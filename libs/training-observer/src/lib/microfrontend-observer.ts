/** Angular-фасад нескольких областей. Обнаруживает корни, подключает общие источники событий, ведёт независимые сеансы и освобождает их через DestroyRef. */
import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, NgZone, signal } from '@angular/core';

import { type DomSnapshot } from '@training-observer/core/models';
import { type MicrofrontendSnapshot } from '@training-observer/core/models';
import { ControlSnapshotBuilder } from './controls/control-snapshot-builder';
import { DomElementAnalyzer } from './capture/dom-element-analyzer';
import { DomObservationScope, MICROFRONTEND_SELECTOR } from './observation/dom-observation-scope';
import { DomObservationSession, PAGE_EVENTS } from './observation/dom-observation-session';
import { isObserverUi, isObserverUiMutation } from './observation/dom-observer-ui';
import { isScrollDecoration } from './capture/dom-scroll-decoration';
import { DomSnapshotBuilder } from './capture/dom-snapshot-builder';
import { snapshotFingerprint } from './observation/snapshot-fingerprint';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
    validateObservationTiming,
} from './tokens/dom-observation-options';

interface Area {
    readonly root: Element;
    readonly session: DomObservationSession;
    parent: Element | null;
    state: MicrofrontendSnapshot;
    fingerprint: string | null;
}

/** Общие источники событий document и независимое объединение обновлений областей. */
@Injectable({ providedIn: 'root' })
export class MicrofrontendObserver {
    private readonly document = inject(DOCUMENT);
    private readonly zone = inject(NgZone);
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly controls = inject(ControlSnapshotBuilder);
    private readonly analyzer = inject(DomElementAnalyzer);
    private readonly defaults = inject(DOM_OBSERVATION_OPTIONS);
    private readonly current = signal<readonly MicrofrontendSnapshot[]>([]);
    private readonly active = signal(false);
    private readonly entries = new Map<Element, Area>();
    private readonly identities = new WeakMap<Element, string>();
    private nextId = 0;
    private cleanups: (() => void)[] = [];
    private destroyed = false;

    readonly areas = this.current.asReadonly();
    readonly isObserving = this.active.asReadonly();

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.clear();
            this.destroyed = true;
        });
    }

    start(root: Element = this.document.body, overrides: Partial<DomObservationOptions> = {}): void {
        if (this.destroyed) throw new Error('MicrofrontendObserver has been destroyed.');
        const view = this.document.defaultView;
        if (!view || !root?.isConnected || root.ownerDocument !== this.document) {
            throw new Error('Microfrontend discovery requires a connected root in the injected document.');
        }
        const options = { ...this.defaults, ...overrides, boundarySelector: MICROFRONTEND_SELECTOR };
        validateObservationTiming(options);
        this.builder.validateOptions(options);
        this.stop();
        this.zone.runOutsideAngular(() => {
            this.reconcile(root, options);
            this.connectSharedSources(root, options, view);
        });
        this.active.set(true);
    }

    /** Обновить одну область или все области после внешнего изменения раскладки. */
    refresh(id?: string): void {
        this.zone.runOutsideAngular(() => {
            for (const area of this.entries.values()) {
                if (!id || area.state.id === id) area.session.invalidate();
            }
        });
    }

    /** Сохраняет результаты, освобождает DOM-ссылки и все browser-ресурсы. */
    stop(): void {
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        for (const area of this.entries.values()) area.session.dispose();
        this.entries.clear();
        this.active.set(false);
    }

    clear(): void {
        this.stop();
        this.current.set([]);
    }

    private connectSharedSources(
        root: Element,
        options: DomObservationOptions,
        view: Window & typeof globalThis,
    ): void {
        const mutations = new view.MutationObserver((records) => {
            const relevant = records.filter((record) =>
                this.discoveryRelevant(record, options.ignoreSelector),
            );
            if (!relevant.length) return;
            const existing = new Set(this.entries.values());
            // Изменение атрибутов влияет как на произвольный ignoreSelector, так и на data-mf.
            if (relevant.some((record) => record.type !== 'characterData')) this.reconcile(root, options);
            for (const area of this.entries.values()) {
                if (existing.has(area)) area.session.handleMutations(relevant);
            }
        });
        mutations.observe(this.document, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        this.cleanups.push(() => mutations.disconnect());
        for (const name of PAGE_EVENTS) {
            const listener = (event: Event): void => {
                for (const area of this.entries.values()) area.session.handleEvent(event);
            };
            this.document.addEventListener(name, listener, { capture: true, passive: true });
            this.cleanups.push(() => this.document.removeEventListener(name, listener, true));
        }
        const resize = (): void => this.refresh();
        view.addEventListener('resize', resize, { passive: true });
        this.cleanups.push(() => view.removeEventListener('resize', resize));
        if (options.propertyCheckIntervalMs > 0) {
            const timer = view.setInterval(() => {
                for (const area of this.entries.values()) area.session.checkProperties();
            }, options.propertyCheckIntervalMs);
            this.cleanups.push(() => view.clearInterval(timer));
        }
    }

    private reconcile(root: Element, options: DomObservationOptions): void {
        const roots = root.isConnected
            ? [root, ...Array.from(root.querySelectorAll(MICROFRONTEND_SELECTOR))].filter(
                  (element) =>
                      element.matches(MICROFRONTEND_SELECTOR) &&
                      !isObserverUi(element) &&
                      !isScrollDecoration(element) &&
                      !(options.ignoreSelector && element.closest(options.ignoreSelector)),
              )
            : [];
        const mounted = new Set(roots);
        let changed = false;
        for (const [element, area] of this.entries) {
            if (!mounted.has(element)) {
                area.session.dispose();
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
            const name = area.root.getAttribute('data-mf') ?? '';
            const parent = area.root.parentElement?.closest(MICROFRONTEND_SELECTOR);
            const parentId = parent ? (this.entries.get(parent)?.state.id ?? null) : null;
            if (area.parent !== area.root.parentElement) {
                area.parent = area.root.parentElement;
                area.session.invalidate();
            }
            if (area.state.name !== name || area.state.parentId !== parentId) {
                area.state = { ...area.state, name, parentId };
                changed = true;
            }
        }
        if (changed || !roots.length) this.publish();
    }

    private createArea(root: Element, options: DomObservationOptions): Area {
        let id = this.identities.get(root);
        if (!id) {
            id = `mf${++this.nextId}`;
            this.identities.set(root, id);
        }
        const session = new DomObservationSession(root, options, this.analyzer, {
            mode: 'shared',
            scope: new DomObservationScope(root, options.ignoreSelector),
        });
        const area: Area = {
            root,
            session,
            parent: root.parentElement,
            fingerprint: null,
            state: {
                id,
                name: root.getAttribute('data-mf') ?? '',
                parentId: null,
                snapshot: null,
                logicalControls: [],
                scanCount: 0,
                revision: 0,
                error: null,
            },
        };
        try {
            const initial = this.captureArea(area, options);
            session.start(initial, {
                captureAndPublish: () => {
                    const snapshot = this.captureArea(area, options);
                    this.publish();
                    return snapshot;
                },
                onError: (error) => {
                    this.failArea(area, error);
                    this.publish();
                },
            });
        } catch (error: unknown) {
            this.failArea(area, error);
        }
        return area;
    }

    private failArea(area: Area, error: unknown): void {
        area.session.dispose();
        area.state = { ...area.state, error: error instanceof Error ? error.message : String(error) };
    }

    private captureArea(area: Area, options: DomObservationOptions): DomSnapshot {
        const snapshot = this.builder.build(area.root, options);
        const fingerprint = snapshotFingerprint(snapshot);
        const changed = fingerprint !== area.fingerprint;
        area.fingerprint = fingerprint;
        area.state = {
            ...area.state,
            scanCount: area.state.scanCount + 1,
            ...(changed
                ? {
                      snapshot,
                      logicalControls: this.controls.build(snapshot),
                      revision: area.state.revision + 1,
                  }
                : {}),
        };
        return snapshot;
    }

    private publish(): void {
        this.zone.run(() => this.current.set([...this.entries.values()].map((area) => area.state)));
    }

    private discoveryRelevant(record: MutationRecord, ignoreSelector: string): boolean {
        if (isObserverUiMutation(record) || isScrollDecoration(record.target)) return false;
        const target =
            record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
        const ignored = ignoreSelector ? target?.closest(ignoreSelector) : null;
        return !ignored || (record.type === 'attributes' && target === ignored);
    }
}
