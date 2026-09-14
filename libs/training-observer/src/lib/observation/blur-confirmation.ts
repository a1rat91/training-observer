/** Подтверждение значения на границе логического поля.
 * Capture при focusout сохраняет уходящее поле; следующий settled capture уточняет его значение.
 * Внутренний фокус и связанный popup не завершают редактирование. Класс не знает о тренировках/записи.
 */
import { ControlType, type ControlSnapshot, type DomSnapshot } from '@training-observer/core/models';
import type { DomSnapshotBuilder } from '../capture/dom-snapshot-builder';
import type { ControlSnapshotBuilder } from '../controls/control-snapshot-builder';
import type { DomObservationOptions } from '../tokens/dom-observation-options';
import { SelectionEvidence } from './selection-evidence';

export class BlurConfirmation {
    private readonly pending = new Map<string, ControlSnapshot>();
    private readonly evidence = new SelectionEvidence();

    constructor(
        private readonly document: Document,
        private readonly snapshots: DomSnapshotBuilder,
        private readonly controls: ControlSnapshotBuilder,
    ) {}

    reset(): void {
        this.pending.clear();
        this.evidence.clear();
    }

    onEdit(event: Event, snapshot: DomSnapshot | null, controls: readonly ControlSnapshot[]): void {
        const target = event.target;
        if (!snapshot || !(target instanceof this.document.defaultView!.Node)) return;
        for (const control of controls) {
            const element = this.snapshots.resolveElement(snapshot, control.targetNodeId);
            if (
                element &&
                (element.contains(target) || (event.type === 'reset' && target.contains(element)))
            ) {
                this.evidence.invalidate(control.id);
            }
        }
    }

    onFocusOut(
        event: FocusEvent,
        snapshot: DomSnapshot | null,
        controls: readonly ControlSnapshot[],
        root: Element,
        options: DomObservationOptions,
        isCurrentSession: () => boolean,
    ): void {
        if (!snapshot || !event.target) return;
        const contains = (control: ControlSnapshot, node: EventTarget | null): boolean =>
            this.contains(snapshot, control, node);
        const control = controls.find(
            (candidate) => this.requiresBlur(candidate) && contains(candidate, event.target),
        );
        if (!control || contains(control, event.relatedTarget)) return;
        const departureSnapshot = this.snapshots.build(root, options);
        if (departureSnapshot.stats.truncated) {
            this.evidence.invalidate(control.id);
            return;
        }
        const captured = this.controls
            .build(departureSnapshot)
            .find((candidate) => candidate.id === control.id);
        if (captured) this.evidence.remember(captured);
        const departure = captured && this.evidence.confirm(captured);
        queueMicrotask(() => {
            if (!isCurrentSession() || contains(control, this.document.activeElement)) return;
            if (departure) this.pending.set(control.id, departure);
        });
    }

    settle(
        snapshot: DomSnapshot,
        controls: readonly ControlSnapshot[],
        previous: Readonly<Record<string, ControlSnapshot>>,
    ): Readonly<Record<string, ControlSnapshot>> {
        if (snapshot.stats.truncated) this.evidence.clear();
        else this.evidence.observe(controls);
        if (!this.pending.size) return previous;
        const next = { ...previous };
        for (const [id, departure] of this.pending) {
            const control = this.evidence.confirm(
                controls.find((candidate) => candidate.id === id) ?? departure,
            );
            if (!snapshot.stats.truncated && !control.state.redacted) next[id] = control;
        }
        this.pending.clear();
        return next;
    }

    private contains(snapshot: DomSnapshot, control: ControlSnapshot, node: EventTarget | null): boolean {
        if (!(node instanceof this.document.defaultView!.Node)) return false;
        const ids = [
            control.targetNodeId,
            control.hostNodeId,
            ...(control.choice?.popup.rootNodeIds ?? control.popup?.rootNodeIds ?? []),
        ];
        return ids.some((id) => this.snapshots.resolveElement(snapshot, id)?.contains(node));
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
