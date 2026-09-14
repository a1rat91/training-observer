/** Headless recorder: remembers field ownership, accepts blur confirmations before screen transitions,
 * and stores serializable values and locator hints. It never infers a click or a missing value.
 * One instance owns one recording; start resets it, stop returns an immutable document.
 */
import type {ControlSnapshot, ControlLocatorHints} from '../models/control-snapshot';
import type {ScreenState} from '../models/screen-state';

export type RecordedValue = string | readonly string[] | boolean;
export interface RecordedEvent {
    readonly sequence: number;
    readonly visit: number;
    readonly screenKey: string;
    readonly kind: 'screen' | 'value' | 'unavailable';
    readonly field?: ControlLocatorHints;
    readonly value?: RecordedValue;
    readonly reason?: string;
}
export interface StateRecording {
    readonly kind: 'training-state-recording';
    readonly version: 1;
    readonly complete: boolean;
    readonly events: readonly RecordedEvent[];
}
const needsBlur = (control: ControlSnapshot): boolean => ['textbox', 'number', 'select', 'combobox'].includes(control.kind);

export class StateRecorder {
    private running = false;
    private events: RecordedEvent[] = [];
    private visit = 0;
    private key = '';
    private complete = true;
    private gap = '';
    private owners = new Map<string, {visit: number; key: string}>();
    private seen = new Map<string, ControlSnapshot>();
    private immediateValues = new Map<string, string>();

    start(screen: ScreenState, confirmed: Readonly<Record<string, ControlSnapshot>>): void {
        if (screen.status !== 'ready' || !screen.key) throw new Error('Дождитесь готового экрана.');
        this.events = [];
        this.visit = 0;
        this.key = '';
        this.complete = true;
        this.gap = '';
        this.owners.clear();
        this.immediateValues.clear();
        this.seen = new Map(Object.entries(confirmed));
        this.running = true;
        this.observe(screen, confirmed);
    }

    observe(screen: ScreenState, confirmed: Readonly<Record<string, ControlSnapshot>>): void {
        if (!this.running) return;
        // Confirmations may refer to the departing screen, whose nodes are already gone.
        for (const [id, control] of Object.entries(confirmed)) {
            if (this.seen.get(id) === control) continue;
            const owner = this.owners.get(id);
            if (owner) {
                this.seen.set(id, control);
                this.recordValue(control, owner);
            }
        }
        if (screen.status === 'loading') return;
        if (screen.status !== 'ready' || !screen.key) {
            if (this.gap !== screen.reason) {
                this.append({kind: 'unavailable', reason: screen.reason, visit: this.visit, screenKey: this.key});
                this.complete = false;
                this.gap = screen.reason;
            }
            return;
        }
        this.gap = '';
        if (this.key !== screen.key) {
            this.key = screen.key;
            this.visit++;
            this.append({kind: 'screen', screenKey: this.key, visit: this.visit});
        }
        for (const control of screen.controls) {
            this.owners.set(control.id, {key: this.key, visit: this.visit});
            const confirmation = confirmed[control.id];
            if (confirmation && this.seen.get(control.id) !== confirmation) {
                this.seen.set(control.id, confirmation);
                this.recordValue(confirmation, {key: this.key, visit: this.visit});
            }
            if (control.kind === 'button' || needsBlur(control)) continue;
            const value = JSON.stringify([control.state.checked, control.state.indeterminate, control.state.value]);
            const previous = this.immediateValues.get(control.id);
            this.immediateValues.set(control.id, value);
            if (previous !== undefined && previous !== value) this.recordValue(control, {key: this.key, visit: this.visit});
        }
    }

    snapshot(): StateRecording {
        return structuredClone({kind: 'training-state-recording', version: 1, complete: this.complete, events: this.events});
    }

    stop(): StateRecording {
        this.running = false;
        return this.snapshot();
    }

    private recordValue(control: ControlSnapshot, owner: {key: string; visit: number}): void {
        if (control.state.redacted) return;
        // ComboBox training compares displayed text after blur, not proof of option selection.
        const value = control.kind === 'combobox' && control.choice
            ? control.choice.displayValue ? [control.choice.displayValue] : []
            : control.choice
            ? control.choice.selection.status === 'observed' ? control.choice.selection.labels : undefined
            : control.state.indeterminate ? undefined : control.state.checked ?? control.state.value;
        if (value === undefined) {
            this.complete = false;
            this.append({kind: 'unavailable', screenKey: owner.key, visit: owner.visit,
                field: structuredClone(control.locatorHints), reason: 'Значение не подтверждено наблюдением'});
            return;
        }
        this.append({kind: 'value', screenKey: owner.key, visit: owner.visit,
            field: structuredClone(control.locatorHints), value: structuredClone(value)});
    }

    private append(event: Omit<RecordedEvent, 'sequence'>): void {
        this.events.push({...event, sequence: this.events.length + 1});
    }
}
