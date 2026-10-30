/** Подтверждение значения на границе логического поля.
 * Capture при blur сохраняет уходящее поле; settled capture уточняет значение только в том же экране.
 * Внутренний фокус и связанный popup не завершают редактирование. Класс не знает о тренировках/записи.
 */
import {DOCUMENT} from '@angular/common';
import {DestroyRef, inject, Injectable} from '@angular/core';
import {
    type ControlSnapshot,
    ControlType,
    type DomSnapshot,
} from '@training-observer/core/models';

import {DomSnapshotBuilder} from '../capture/dom-snapshot-builder';
import {containsAcrossShadow, deepActiveElement, eventOrigin} from '../capture/dom-tree';
import {ControlSnapshotBuilder} from '../controls/control-snapshot-builder';
import {type DomObservationOptions} from '../tokens/dom-observation-options';
import {BLUR_CONFIRMATION_CONTEXT} from './confirmation-context';
import {type DomObservationScope} from './dom-observation-scope';
import {SelectionEvidence} from './selection-evidence';

enum DeparturePhase {
    Waiting = 'waiting',
    Returned = 'returned',
    Departed = 'departed',
    Editing = 'editing',
}

interface PendingDeparture {
    readonly control: ControlSnapshot;
    readonly context: string | null;
    phase: DeparturePhase;
}

@Injectable()
export class BlurConfirmation {
    private readonly document = inject(DOCUMENT);
    private readonly snapshots = inject(DomSnapshotBuilder);
    private readonly controls = inject(ControlSnapshotBuilder);
    private readonly readContext = inject(BLUR_CONFIRMATION_CONTEXT);
    private generation = 0;
    private readonly pending = new Map<string, PendingDeparture>();
    private readonly evidence = new SelectionEvidence();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.reset());
    }

    public reset(): void {
        this.generation++;
        this.pending.clear();
        this.evidence.clear();
    }

    public onEdit(
        event: Event,
        snapshot: DomSnapshot | null,
        controls: readonly ControlSnapshot[],
    ): void {
        const target = eventOrigin(event);

        if (!snapshot || !(target instanceof this.document.defaultView!.Node)) {
            return;
        }

        for (const control of controls) {
            const element = this.snapshots.resolveElement(snapshot, control.targetNodeId);

            if (
                element &&
                (containsAcrossShadow(element, target) ||
                    (event.type === 'reset' && containsAcrossShadow(target, element)))
            ) {
                this.evidence.invalidate(control.id);
                const pending = this.pending.get(control.id);

                if (
                    pending?.phase === DeparturePhase.Departed &&
                    this.contains(snapshot, control, deepActiveElement(this.document))
                ) {
                    pending.phase = DeparturePhase.Editing;
                }
            }
        }
    }

    public onFocusIn(event: FocusEvent, snapshot: DomSnapshot): void {
        const target = eventOrigin(event);

        for (const pending of this.pending.values()) {
            if (
                pending.phase === DeparturePhase.Departed &&
                this.contains(snapshot, pending.control, target)
            ) {
                pending.phase = DeparturePhase.Editing;
            }
        }
    }

    public onFocusOut(
        event: FocusEvent,
        snapshot: DomSnapshot | null,
        controls: readonly ControlSnapshot[],
        session: {
            root: Element;
            options: DomObservationOptions;
        },
        scope?: DomObservationScope,
    ): void {
        const {root, options} = session;
        const generation = this.generation;
        const target = eventOrigin(event);

        if (!snapshot || !target) {
            return;
        }

        const contains = (control: ControlSnapshot, node: EventTarget | null): boolean =>
            this.contains(snapshot, control, node, scope);

        // Popup может содержать самостоятельные поля: одно событие завершает все покинутые
        // логические области, но не trigger, если фокус остаётся внутри его popup.
        const departing = controls.filter((candidate) => {
            const pending = this.pending.get(candidate.id);

            return (
                this.requiresBlur(candidate) &&
                (!pending ||
                    pending.phase === DeparturePhase.Returned ||
                    pending.phase === DeparturePhase.Editing) &&
                contains(candidate, target) &&
                !contains(candidate, event.relatedTarget)
            );
        });

        if (!departing.length) {
            return;
        }

        const departureSnapshot = this.snapshots.build(root, options);

        if (departureSnapshot.stats.truncated) {
            departing.forEach((control) => this.evidence.invalidate(control.id));

            return;
        }

        const capturedControls = this.controls.build(departureSnapshot);
        const captured = new Map(
            capturedControls.map((control) => [control.id, control]),
        );

        const context = this.readContext(departureSnapshot, capturedControls);

        const departures = departing.flatMap((control) => {
            const departure = captured.get(control.id);
            const previous = this.pending.get(control.id);

            if (!departure || (previous && previous.context !== context)) {
                return [];
            }

            this.evidence.remember(departure);
            const pending: PendingDeparture = {
                control: this.evidence.confirm(departure),
                context,
                phase: DeparturePhase.Waiting,
            };

            // Native blur precedes focusout; reserve its value before application handlers run.
            this.pending.set(control.id, pending);

            return [{control, pending}];
        });

        queueMicrotask(() => {
            if (generation !== this.generation) {
                return;
            }

            for (const {control, pending} of departures) {
                if (this.pending.get(control.id) !== pending) {
                    continue;
                }

                // The same DOM control may now belong to another screen. Only a connected
                // settled frame can distinguish an internal return from that next screen.
                pending.phase = contains(control, deepActiveElement(this.document))
                    ? DeparturePhase.Returned
                    : DeparturePhase.Departed;
            }
        });
    }

    /** Использует уже захваченные значения при замене корня, когда новый capture старого DOM невозможен. */
    public settleDepartures(
        previous: Readonly<Record<string, ControlSnapshot>>,
    ): Readonly<Record<string, ControlSnapshot>> {
        if (!this.pending.size) {
            return previous;
        }

        let next: Record<string, ControlSnapshot> | null = null;

        for (const [id, departure] of this.pending) {
            if (departure.phase === DeparturePhase.Waiting) {
                continue;
            }

            if (!departure.control.state.redacted) {
                next ??= {...previous};
                next[id] = departure.control;
            }

            this.pending.delete(id);
        }

        return next ?? previous;
    }

    public settle(
        snapshot: DomSnapshot,
        controls: readonly ControlSnapshot[],
        previous: Readonly<Record<string, ControlSnapshot>>,
    ): Readonly<Record<string, ControlSnapshot>> {
        if (snapshot.stats.truncated) {
            this.evidence.clear();
        } else {
            this.evidence.observe(controls);
        }

        if (!this.pending.size) {
            return previous;
        }

        const context = this.readContext(snapshot, controls);
        let next: Record<string, ControlSnapshot> | null = null;

        for (const [id, departure] of this.pending) {
            if (departure.phase === DeparturePhase.Waiting) {
                continue;
            }

            if (
                departure.phase === DeparturePhase.Returned &&
                context === departure.context
            ) {
                this.pending.delete(id);

                continue;
            }

            const current =
                context === departure.context &&
                departure.phase === DeparturePhase.Departed
                    ? controls.find((candidate) => candidate.id === id)
                    : undefined;

            const control = current ? this.evidence.confirm(current) : departure.control;

            if (!snapshot.stats.truncated && !control.state.redacted) {
                next ??= {...previous};
                next[id] = control;
            }

            this.pending.delete(id);
        }

        return next ?? previous;
    }

    private contains(
        snapshot: DomSnapshot,
        control: ControlSnapshot,
        node: EventTarget | null,
        scope?: DomObservationScope,
    ): boolean {
        if (
            !(node instanceof this.document.defaultView!.Node) ||
            (scope && !scope.owns(node))
        ) {
            return false;
        }

        const ids = [
            control.targetNodeId,
            control.hostNodeId,
            ...(control.choice?.popup.rootNodeIds ?? control.popup?.rootNodeIds ?? []),
        ];

        return ids.some((id) => {
            const element = this.snapshots.resolveElement(snapshot, id);

            return !!element && containsAcrossShadow(element, node);
        });
    }

    private requiresBlur(control: ControlSnapshot): boolean {
        return (
            control.kind === ControlType.Textbox ||
            control.kind === ControlType.Number ||
            control.kind === ControlType.Select ||
            control.kind === ControlType.ComboBox
        );
    }
}
