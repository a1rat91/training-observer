import {DOCUMENT} from '@angular/common';
import {computed, DestroyRef, inject, Injectable, NgZone, signal} from '@angular/core';

import {type DomElementSnapshot, type DomSnapshot} from './models/dom-snapshot';
import {DomSnapshotBuilder} from './services/dom-snapshot-builder';
import {ControlSnapshotBuilder} from './services/control-snapshot-builder';
import {DomElementAnalyzer} from './services/dom-element-analyzer';
import {DomObservationSession} from './services/dom-observation-session';
import {DOM_OBSERVATION_OPTIONS, type DomObservationOptions} from './tokens/dom-observation-options';
import {type DomSnapshotOptions} from './tokens/dom-snapshot-options';

/** One observation session per service instance. Provide locally for a microfrontend's lifecycle. */
@Injectable({providedIn: 'root'})
export class TrainingObserver {
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly controlBuilder = inject(ControlSnapshotBuilder);
    private readonly zone = inject(NgZone);
    private readonly current = signal<DomSnapshot | null>(null);
    private readonly document = inject(DOCUMENT);
    private readonly defaults = inject(DOM_OBSERVATION_OPTIONS);
    private readonly analyzer = inject(DomElementAnalyzer);
    private readonly destroyRef = inject(DestroyRef);
    private readonly observing = signal(false);
    private readonly failure = signal<string | null>(null);
    private readonly scans = signal(0);
    private readonly publications = signal(0);
    private session: DomObservationSession | null = null;
    private fingerprint: string | null = null;
    private destroyed = false;

    readonly snapshot = this.current.asReadonly();
    readonly isObserving = this.observing.asReadonly();
    readonly error = this.failure.asReadonly();
    readonly scanCount = this.scans.asReadonly();
    readonly revision = this.publications.asReadonly();
    readonly controls = computed<readonly DomElementSnapshot[]>(() => {
        const snapshot = this.snapshot();

        return snapshot ? snapshot.interactiveIds.map((id) => snapshot.nodes[id])
            .filter((node): node is DomElementSnapshot => node.kind === 'element') : [];
    });
    readonly logicalControls = computed(() => {
        const snapshot = this.snapshot();

        return snapshot ? this.controlBuilder.build(snapshot) : [];
    });

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.destroyed = true;
            this.clear();
        });
    }

    /** Immediate initial capture followed by batched updates. A new start replaces the old session. */
    start(root: Element = this.document.body, overrides: Partial<DomObservationOptions> = {}): DomSnapshot {
        this.assertAlive();

        const options = {...this.defaults, ...overrides};

        for (const name of ['batchDelayMs', 'propertyCheckIntervalMs'] as const) {
            if (!Number.isInteger(options[name]) || options[name] < 0 || options[name] > 2_147_483_647) {
                throw new Error(`${name} must be a non-negative integer up to 2147483647.`);
            }
        }

        // Validate and build before replacing a working session, so bad options do not stop it.
        const initial = this.zone.runOutsideAngular(() => this.builder.build(root, options));

        this.stop();
        this.failure.set(null);

        this.zone.runOutsideAngular(() => {
            const session = new DomObservationSession(root, options, this.analyzer,
                () => {
                    const snapshot = this.builder.build(root, options);
                    this.publish(snapshot, true);
                    return snapshot;
                },
                (error) => this.zone.run(() => {
                    this.stop();
                    this.failure.set(error instanceof Error ? error.message : String(error));
                }));

            this.session = session;

            try {
                session.start(initial);
            } catch (error: unknown) {
                this.stop();
                throw error;
            }
        });

        this.observing.set(true);
        this.publish(initial, false);

        return initial;
    }

    /** Keep the last snapshot, but cancel observers, listeners and pending work. */
    stop(): void {
        this.session?.dispose();
        this.session = null;
        this.observing.set(false);
    }

    capture(root?: Element, options?: Partial<DomSnapshotOptions>): DomSnapshot {
        this.assertAlive();
        const snapshot = this.zone.runOutsideAngular(() => this.builder.build(root, options));

        this.publish(snapshot, false);
        this.zone.runOutsideAngular(() => this.session?.refreshProperties());

        return snapshot;
    }

    clear(): void {
        this.stop();
        this.fingerprint = null;
        this.failure.set(null);
        this.current.set(null);
    }

    private publish(snapshot: DomSnapshot, onlyIfChanged: boolean): void {
        const fingerprint = JSON.stringify([snapshot.rootId, snapshot.relatedRootIds, snapshot.nodes, snapshot.interactiveIds, snapshot.stats]);

        this.zone.run(() => {
            this.scans.update((count) => count + 1);

            if (!onlyIfChanged || this.fingerprint !== fingerprint) {
                this.fingerprint = fingerprint;
                this.current.set(snapshot);
                this.publications.update((count) => count + 1);
            }
        });
    }

    private assertAlive(): void {
        if (this.destroyed) {
            throw new Error('TrainingObserver has been destroyed.');
        }
    }
}
