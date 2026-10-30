/** Angular-фасад нескольких областей. Обнаруживает корни, подключает общие источники событий, ведёт независимые сеансы и освобождает их через DestroyRef. */
import {DOCUMENT} from '@angular/common';
import {DestroyRef, inject, Injectable, NgZone, signal} from '@angular/core';
import {type MicrofrontendSnapshot} from '@training-observer/core/models';
import {BehaviorSubject} from 'rxjs';

import {
    isAdapterExcluded,
    isCaptureExcludedMutation,
} from './capture/dom-adapter-exclusions';
import {DomSnapshotBuilder} from './capture/dom-snapshot-builder';
import {
    closestAcrossShadow,
    containsAcrossShadow,
    parentAcrossShadow,
    querySelectorAllDeep,
} from './capture/dom-tree';
import {MICROFRONTEND_SELECTOR} from './observation/dom-observation-scope';
import {PAGE_EVENTS, type SessionSnapshot} from './observation/dom-observation-session';
import {DomObservationSources} from './observation/dom-observation-sources';
import {isObserverUi} from './observation/dom-observer-ui';
import {
    ObservationSessionFactory,
    type ObservationSessionRef,
} from './observation/observation-session-factory';
import {SessionSourceMode} from './observation/session-context';
import {snapshotFingerprint} from './observation/snapshot-fingerprint';
import {CONTROL_ADAPTER_EXCLUSIONS} from './tokens/control-adapters';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
    validateObservationTiming,
} from './tokens/dom-observation-options';

interface Area {
    readonly root: Element;
    readonly sessionRef: ObservationSessionRef;
    parent: Element | null;
    state: MicrofrontendSnapshot;
    fingerprint: string | null;
}

/** Общие источники событий document и независимое объединение обновлений областей. */
@Injectable()
export class MicrofrontendObserver {
    private readonly document = inject(DOCUMENT);
    private readonly zone = inject(NgZone);
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly sessions = inject(ObservationSessionFactory);
    private readonly defaults = inject(DOM_OBSERVATION_OPTIONS);
    private readonly excludedSelector = inject(CONTROL_ADAPTER_EXCLUSIONS).join(',');
    private readonly current = signal<readonly MicrofrontendSnapshot[]>([]);
    private readonly updates = new BehaviorSubject<readonly MicrofrontendSnapshot[]>(
        this.current(),
    );

    private readonly active = signal(false);
    private readonly entries = new Map<Element, Area>();
    private readonly identities = new WeakMap<Element, string>();
    private nextId = 0;
    private sources: DomObservationSources | null = null;
    private readonly cleanups: Array<() => void> = [];
    private destroyed = false;
    private generation = 0;

    public readonly areas = this.current.asReadonly();
    public readonly isObserving = this.active.asReadonly();
    /** Синхронная публикация того же массива, который возвращает areas(). */
    public readonly updates$ = this.updates.asObservable();

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
            this.clear();
            this.updates.complete();
        });
    }

    public start(
        root: Element = this.document.body,
        overrides: Partial<DomObservationOptions> = {},
    ): void {
        if (this.destroyed) {
            throw new Error('MicrofrontendObserver has been destroyed.');
        }

        const view = this.document.defaultView;

        if (!view || !root?.isConnected || root.ownerDocument !== this.document) {
            throw new Error(
                'Microfrontend discovery requires a connected root in the injected document.',
            );
        }

        const options = {
            ...this.defaults,
            ...overrides,
            boundarySelector:
                overrides.boundarySelector ??
                this.defaults.boundarySelector ??
                MICROFRONTEND_SELECTOR,
        };

        if (!options.boundarySelector.trim()) {
            throw new Error('Provide a non-empty microfrontend boundary selector.');
        }

        validateObservationTiming(options);
        this.builder.validateOptions(options);
        this.stop();
        const generation = this.generation;

        this.zone.runOutsideAngular(() => {
            this.reconcile(root, options);

            // updates$ is synchronous: its subscriber may stop, destroy or start again.
            if (this.isCurrent(generation)) {
                this.connectSharedSources(root, options, view, generation);
            }
        });

        if (this.isCurrent(generation)) {
            this.active.set(true);
        }
    }

    /** Находит существующие и поздно смонтированные области по селекторам в текущем документе. */
    public observe(
        selectors: string | readonly string[],
        overrides: Partial<DomObservationOptions> = {},
    ): void {
        const selector = typeof selectors === 'string' ? selectors : selectors.join(',');

        if (
            !selector.trim() ||
            (Array.isArray(selectors) && selectors.some((item) => !item.trim()))
        ) {
            throw new Error('Provide at least one non-empty microfrontend selector.');
        }

        this.start(this.document.body, {...overrides, boundarySelector: selector});
    }

    /** Обновить одну область или все области после внешнего изменения раскладки. */
    public refresh(id?: string): void {
        this.zone.runOutsideAngular(() => {
            this.sources?.refresh();

            for (const area of this.entries.values()) {
                if (!id || area.state.id === id) {
                    area.sessionRef.session.invalidate();
                }
            }
        });
    }

    /** Сохраняет результаты, освобождает DOM-ссылки и все browser-ресурсы. */
    public stop(): void {
        this.generation++;

        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }

        for (const area of this.entries.values()) {
            area.sessionRef.destroy();
        }

        this.entries.clear();
        this.sources = null;
        this.active.set(false);
    }

    public clear(): void {
        this.stop();
        this.publish();
    }

    private connectSharedSources(
        root: Element,
        options: DomObservationOptions,
        view: Window & typeof globalThis,
        generation: number,
    ): void {
        const sources = new DomObservationSources(
            this.document,
            PAGE_EVENTS,
            (records) => {
                if (!this.isCurrent(generation)) {
                    return;
                }

                const relevant = records.filter((record) =>
                    this.discoveryRelevant(record, options.ignoreSelector),
                );

                if (!relevant.length) {
                    return;
                }

                const existing = new Set(this.entries.values());

                // Изменение атрибутов влияет на ignoreSelector, маркеры границ и имена областей.
                if (relevant.some((record) => record.type !== 'characterData')) {
                    this.reconcile(root, options);
                }

                for (const area of this.entries.values()) {
                    if (!this.isCurrent(generation)) {
                        return;
                    }

                    if (existing.has(area)) {
                        area.sessionRef.session.handleMutations(relevant);
                    }
                }
            },
            (event) => {
                for (const area of this.entries.values()) {
                    if (!this.isCurrent(generation)) {
                        return;
                    }

                    area.sessionRef.session.handleEvent(event);
                }
            },
        );

        this.sources = sources;
        this.cleanups.push(() => sources.dispose());

        const resize = (): void => {
            if (this.isCurrent(generation)) {
                this.refresh();
            }
        };

        view.addEventListener('resize', resize, {passive: true});
        this.cleanups.push(() => view.removeEventListener('resize', resize));

        if (options.propertyCheckIntervalMs > 0) {
            const timer = view.setInterval(() => {
                if (!this.isCurrent(generation)) {
                    return;
                }

                if (sources.refresh()) {
                    this.reconcile(root, options);

                    if (!this.isCurrent(generation)) {
                        return;
                    }

                    this.refresh();
                }

                for (const area of this.entries.values()) {
                    if (!this.isCurrent(generation)) {
                        return;
                    }

                    area.sessionRef.session.checkProperties();
                }
            }, options.propertyCheckIntervalMs);

            this.cleanups.push(() => view.clearInterval(timer));
        }
    }

    private isCurrent(generation: number): boolean {
        return !this.destroyed && this.generation === generation;
    }

    private reconcile(root: Element, options: DomObservationOptions): void {
        const roots = root.isConnected
            ? [root, ...querySelectorAllDeep(root, options.boundarySelector!)].filter(
                  (element) =>
                      element.matches(options.boundarySelector!) &&
                      !isObserverUi(element) &&
                      !isAdapterExcluded(element, this.excludedSelector) &&
                      (!options.ignoreSelector ||
                          !closestAcrossShadow(element, options.ignoreSelector)),
              )
            : [];

        const mounted = new Set(roots);
        let changed = false;

        for (const [element, area] of this.entries) {
            if (!mounted.has(element)) {
                area.sessionRef.destroy();
                this.entries.delete(element);
                changed = true;
            }
        }

        for (const element of roots) {
            if (!this.entries.has(element)) {
                this.entries.set(element, this.createArea(element, options));
                changed = true;
            }
        }

        for (const area of this.entries.values()) {
            const name = area.root.localName;
            const parent = parentAcrossShadow(area.root)
                ? closestAcrossShadow(
                      parentAcrossShadow(area.root)!,
                      options.boundarySelector!,
                  )
                : null;

            const parentId = parent ? (this.entries.get(parent)?.state.id ?? null) : null;

            if (area.parent !== parentAcrossShadow(area.root)) {
                area.parent = parentAcrossShadow(area.root);
                area.sessionRef.session.invalidate();
            }

            if (area.state.name !== name || area.state.parentId !== parentId) {
                area.state = {
                    ...area.state,
                    name,
                    parentId,
                    revision: area.state.revision + 1,
                };
                changed = true;
            }
        }

        if (changed || (!roots.length && this.current().length > 0)) {
            this.publish();
        }
    }

    private createArea(root: Element, options: DomObservationOptions): Area {
        let id = this.identities.get(root);

        if (!id) {
            id = `mf${++this.nextId}`;
            this.identities.set(root, id);
        }

        const sessionRef = this.sessions.create(root, options, SessionSourceMode.Shared);
        const parent = parentAcrossShadow(root);
        const parentArea = parent
            ? closestAcrossShadow(parent, options.boundarySelector!)
            : null;

        const area: Area = {
            root,
            sessionRef,
            parent,
            fingerprint: null,
            state: {
                id,
                name: root.localName,
                parentId: parentArea
                    ? (this.entries.get(parentArea)?.state.id ?? null)
                    : null,
                snapshot: null,
                logicalControls: [],
                confirmedControls: {},
                scanCount: 0,
                revision: 0,
                error: null,
            },
        };

        sessionRef.session.snapshots$.subscribe((result) => {
            this.acceptArea(area, result);
            this.publish();
        });
        sessionRef.session.errors$.subscribe((error) => {
            this.failArea(area, error);
            this.publish();
        });

        try {
            const initial = this.builder.build(root, options);

            this.acceptArea(area, sessionRef.session.start(initial));
        } catch (error: unknown) {
            this.failArea(area, error);
        }

        return area;
    }

    private failArea(area: Area, error: unknown): void {
        area.sessionRef.destroy();
        area.state = {
            ...area.state,
            error: error instanceof Error ? error.message : String(error),
            revision: area.state.revision + 1,
        };
    }

    private acceptArea(area: Area, result: SessionSnapshot): void {
        const {snapshot, controls, confirmedControls} = result;
        const fingerprint = snapshotFingerprint(snapshot);
        const changed =
            fingerprint !== area.fingerprint ||
            confirmedControls !== area.state.confirmedControls;

        area.fingerprint = fingerprint;
        area.state = {
            ...area.state,
            scanCount: area.state.scanCount + 1,
            confirmedControls,
            ...(changed
                ? {
                      snapshot,
                      logicalControls: controls,
                      revision: area.state.revision + 1,
                  }
                : {}),
        };
    }

    private publish(): void {
        this.zone.run(() => {
            const state = [...this.entries.values()].map((area) => area.state);

            this.current.set(state);
            this.updates.next(state);
        });
    }

    private discoveryRelevant(record: MutationRecord, ignoreSelector: string): boolean {
        if (
            isCaptureExcludedMutation(record, this.excludedSelector, (element) =>
                [...this.entries.values()].some(
                    (area) =>
                        containsAcrossShadow(element, area.root) ||
                        area.sessionRef.session.wasCaptured(element),
                ),
            )
        ) {
            return false;
        }

        const target =
            record.target.nodeType === 1
                ? (record.target as Element)
                : parentAcrossShadow(record.target);

        const ignored =
            ignoreSelector && target ? closestAcrossShadow(target, ignoreSelector) : null;

        return !ignored || (record.type === 'attributes' && target === ignored);
    }
}
