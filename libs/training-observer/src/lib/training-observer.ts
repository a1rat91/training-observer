import {DOCUMENT} from '@angular/common';
import {computed, DestroyRef, inject, Injectable, NgZone, signal} from '@angular/core';

import {type DomElementSnapshot, type DomSnapshot} from './models/dom-snapshot';
import {type ControlSnapshot} from './models/control-snapshot';
import {DomSnapshotBuilder} from './services/dom-snapshot-builder';
import {ControlSnapshotBuilder} from './services/control-snapshot-builder';
import {DomElementAnalyzer} from './services/dom-element-analyzer';
import {DomObservationSession} from './services/dom-observation-session';
import {snapshotFingerprint} from './services/snapshot-fingerprint';
import {SelectionEvidence} from './services/selection-evidence';
import {DOM_OBSERVATION_OPTIONS, type DomObservationOptions, validateObservationTiming} from './tokens/dom-observation-options';
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
    private readonly confirmed = signal<Readonly<Record<string, ControlSnapshot>>>({});
    private readonly pendingConfirmations = new Map<string, ControlSnapshot>();
    private readonly selectionEvidence = new SelectionEvidence();

    /** Last value captured on leaving a logical field. Raw snapshots remain live; absent means not confirmed. */
    readonly confirmedControls = this.confirmed.asReadonly();

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

        validateObservationTiming(options);

        // Validate and build before replacing a working session, so bad options do not stop it.
        const initial = this.zone.runOutsideAngular(() => this.builder.build(root, options));

        this.stop();
        this.confirmed.set({});
        this.failure.set(null);

        this.zone.runOutsideAngular(() => {
            const session = new DomObservationSession(root, options, this.analyzer, {mode: 'standalone'});
            this.session = session;

            try {
                session.start(initial, {
                    onEdit: (event) => this.invalidateSelection(event),
                    onFocusOut: (event) => this.confirmOnBlur(event, root, options, session),
                    captureAndPublish: () => {
                        const snapshot = this.builder.build(root, options);
                        this.publish(snapshot, true);
                        return snapshot;
                    },
                    onError: (error) => this.zone.run(() => {
                        this.stop();
                        this.failure.set(error instanceof Error ? error.message : String(error));
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
    stop(): void {
        this.selectionEvidence.clear();
        this.pendingConfirmations.clear();
        this.session?.dispose();
        this.session = null;
        this.observing.set(false);
    }

    capture(root?: Element, options?: Partial<DomSnapshotOptions>): DomSnapshot {
        this.assertAlive();
        const snapshot = this.zone.runOutsideAngular(() => this.builder.build(root, options));

        this.publish(snapshot, false);
        this.zone.runOutsideAngular(() => this.session?.resetPropertyBaseline());

        return snapshot;
    }

    /** Flush the current session after UI handlers have settled, preserving capture/redaction options. */
    flush(): void {
        this.assertAlive();
        this.zone.runOutsideAngular(() => this.session?.flush());
    }

    clear(): void {
        this.stop();
        this.fingerprint = null;
        this.failure.set(null);
        this.current.set(null);
        this.confirmed.set({});
    }

    /** Capture before a navigation can remove the field, then read settled selection after event handlers.
     * Focus inside the host or an explicitly linked popup stays within the same logical field.
     * Never infer confirmation from input/change, polling, disappearance or a remount alone.
     */
    private confirmOnBlur(event: FocusEvent, root: Element, options: DomObservationOptions, session: DomObservationSession): void {
        const snapshot = this.current();
        if (!snapshot || !event.target) return;
        const contains = (control: ControlSnapshot, node: EventTarget | null): boolean => {
            if (!(node instanceof this.document.defaultView!.Node)) return false;
            return [control.targetNodeId, control.hostNodeId, ...(control.choice?.popup.rootNodeIds ?? control.popup?.rootNodeIds ?? [])]
                .some((id) => this.builder.resolveElement(snapshot, id)?.contains(node));
        };
        const control = this.logicalControls().find((candidate) =>
            ['textbox', 'number', 'select', 'combobox'].includes(candidate.kind) && contains(candidate, event.target));
        if (!control || contains(control, event.relatedTarget)) return;

        const departureSnapshot = this.builder.build(root, options);
        if (departureSnapshot.stats.truncated) {
            this.selectionEvidence.invalidate(control.id);
            return;
        }
        const captured = this.controlBuilder.build(departureSnapshot).find((candidate) => candidate.id === control.id);
        if (captured) this.selectionEvidence.remember(captured);
        const departure = captured && this.selectionEvidence.confirm(captured);
        queueMicrotask(() => {
            if (this.session !== session) return;
            // Some components restore focus from their popup during the same event dispatch.
            if (contains(control, this.document.activeElement)) return;
            if (departure) this.pendingConfirmations.set(control.id, departure);
        });
    }

    private invalidateSelection(event: Event): void {
        const snapshot = this.current();
        const target = event.target;
        if (!snapshot || !(target instanceof this.document.defaultView!.Node)) return;
        for (const control of this.logicalControls()) {
            const element = this.builder.resolveElement(snapshot, control.targetNodeId);
            if (element && (element.contains(target) || (event.type === 'reset' && target.contains(element)))) {
                this.selectionEvidence.invalidate(control.id);
            }
        }
    }

    private publish(snapshot: DomSnapshot, onlyIfChanged: boolean): void {
        const fingerprint = snapshotFingerprint(snapshot);

        this.zone.run(() => {
            this.scans.update((count) => count + 1);
            const controls = this.controlBuilder.build(snapshot);
            if (snapshot.stats.truncated) this.selectionEvidence.clear();
            else this.selectionEvidence.observe(controls);

            // The normal batched capture runs after Angular has rendered the blur/change handlers.
            // If navigation removed the field, retain only the value actually captured at focusout.
            if (this.pendingConfirmations.size) {
                const next = {...this.confirmed()};
                for (const [id, departure] of this.pendingConfirmations) {
                    const control = this.selectionEvidence.confirm(controls.find((candidate) => candidate.id === id) ?? departure);
                    if (!snapshot.stats.truncated && !control.state.redacted) next[id] = control;
                }
                this.pendingConfirmations.clear();
                this.confirmed.set(next);
            }

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
