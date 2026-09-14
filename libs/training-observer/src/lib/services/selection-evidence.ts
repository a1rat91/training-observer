/** Remembers selection actually seen in a linked popup, never infers it from matching option text.
 * Evidence belongs to a live control/host/popup relationship. Editing, value changes, an open list
 * without selection, unknown ownership, removal and session reset invalidate it.
 * Raw snapshots remain unchanged; only blur confirmation can consume retained evidence.
 */
import type {ControlSnapshot} from '../models/control-snapshot';
interface Evidence {
    readonly displayValue: string;
    readonly label: string;
    readonly hostNodeId: string;
    readonly popupIds: string;
}
export class SelectionEvidence {
    private readonly entries = new Map<string, Evidence>();

    observe(controls: readonly ControlSnapshot[]): void {
        const ids = new Set(controls.map(control => control.id));
        for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id);
        for (const control of controls) this.remember(control);
    }

    remember(control: ControlSnapshot): void {
        if (control.kind !== 'combobox') return;
        const choice = control.choice;
        const previous = this.entries.get(control.id);
        const popupIds = JSON.stringify(choice?.popup.referencedIds ?? []);
        if (!choice || control.state.redacted || choice.popup.busy || choice.popup.relation !== 'aria-controls' ||
            !choice.popup.referencedIds.length || choice.popup.status === 'unresolved') {
            this.invalidate(control.id);
            return;
        }
        // A selected old option while typing a new query does not confirm that query.
        if (choice.popup.status === 'open' && choice.selection.status === 'observed' &&
            choice.selection.labels.length === 1 && choice.selection.labels[0] === choice.displayValue) {
            this.entries.set(control.id, {displayValue: choice.displayValue, label: choice.selection.labels[0],
                hostNodeId: control.hostNodeId, popupIds});
            return;
        }
        if (choice.popup.status !== 'closed' || previous?.displayValue !== choice.displayValue ||
            previous.hostNodeId !== control.hostNodeId || previous.popupIds !== popupIds) this.invalidate(control.id);
    }

    confirm(control: ControlSnapshot): ControlSnapshot {
        const evidence = this.entries.get(control.id);
        const choice = control.choice;
        if (!evidence || !choice || choice.selection.status !== 'unknown' || choice.popup.status !== 'closed' ||
            control.state.redacted || choice.popup.busy || choice.popup.relation !== 'aria-controls' ||
            evidence.displayValue !== choice.displayValue || evidence.hostNodeId !== control.hostNodeId ||
            evidence.popupIds !== JSON.stringify(choice.popup.referencedIds)) return control;
        return {...control, choice: {...choice, selection: {status: 'observed', labels: [evidence.label], evidence: 'previous-snapshot'}}};
    }

    invalidate(id: string): void { this.entries.delete(id); }
    clear(): void { this.entries.clear(); }
}
