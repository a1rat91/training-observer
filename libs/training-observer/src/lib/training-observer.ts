import {DOCUMENT} from '@angular/common';
import {computed, DestroyRef, inject, Injectable, NgZone, signal} from '@angular/core';

import {type DomElementSnapshot, type DomSnapshot} from './models/dom-snapshot';
import {ControlSnapshotBuilder} from './services/control-snapshot-builder';
import {DomElementAnalyzer} from './services/dom-element-analyzer';
import {DomObservationSession} from './services/dom-observation-session';
import {DomSnapshotBuilder} from './services/dom-snapshot-builder';
import {snapshotFingerprint} from './services/snapshot-fingerprint';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
    validateObservationTiming,
} from './tokens/dom-observation-options';
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

    public readonly snapshot = this.current.asReadonly();
    public readonly isObserving = this.observing.asReadonly();
    public readonly error = this.failure.asReadonly();
    public readonly scanCount = this.scans.asReadonly();
    public readonly revision = this.publications.asReadonly();
    public readonly controls = computed<readonly DomElementSnapshot[]>(() => {
        const snapshot = this.snapshot();

        return snapshot
            ? snapshot.interactiveIds
                  .map((id) => snapshot.nodes[id])
                  .filter((node): node is DomElementSnapshot => node?.kind === 'element')
            : [];
    });

    public readonly logicalControls = computed(() => {
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
    public start(
        root: Element = this.document.body,
        overrides: Partial<DomObservationOptions> = {},
    ): DomSnapshot {
        this.assertAlive();

        const options = {...this.defaults, ...overrides};

        validateObservationTiming(options);

        // Validate and build before replacing a working session, so bad options do not stop it.
        const initial = this.zone.runOutsideAngular(() =>
            this.builder.build(root, options),
        );

        this.stop();
        this.failure.set(null);

        this.zone.runOutsideAngular(() => {
            const session = new DomObservationSession(root, options, this.analyzer, {
                mode: 'standalone',
            });

            this.session = session;

            try {
                session.start(initial, {
                    captureAndPublish: () => {
                        const snapshot = this.builder.build(root, options);

                        this.publish(snapshot, true);

                        return snapshot;
                    },
                    onError: (error) =>
                        this.zone.run(() => {
                            this.stop();
                            this.failure.set(
                                error instanceof Error ? error.message : String(error),
                            );
                        }),
                });
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
    public stop(): void {
        this.session?.dispose();
        this.session = null;
        this.observing.set(false);
    }

    public capture(root?: Element, options?: Partial<DomSnapshotOptions>): DomSnapshot {
        this.assertAlive();
        const snapshot = this.zone.runOutsideAngular(() =>
            this.builder.build(root, options),
        );

        this.publish(snapshot, false);
        this.zone.runOutsideAngular(() => this.session?.resetPropertyBaseline());

        return snapshot;
    }

    public clear(): void {
        this.stop();
        this.fingerprint = null;
        this.failure.set(null);
        this.current.set(null);
    }

    private publish(snapshot: DomSnapshot, onlyIfChanged: boolean): void {
        const fingerprint = snapshotFingerprint(snapshot);

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
