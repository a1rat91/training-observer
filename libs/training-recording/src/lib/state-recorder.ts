/** Регистратор состояний без UI. Запоминает владельцев полей и принимает уходящие blur-подтверждения до перехода. Хранит значения и признаки поиска; не выдумывает клик или недоступное значение. Исходные checkbox/radio записываются для каждого посещения, последнее значение используется компилятором. Один экземпляр владеет одной записью. */
import type { ControlSnapshot } from '@training-observer/core/models';
import type { ScreenState } from '@training-observer/core/models';

export type { StateRecording, RecordedEvent, RecordedValue } from '@training-observer/contracts';
import type { StateRecording, RecordedEvent } from '@training-observer/contracts';
import { readControlValue, requiresBlur, recordsInitialState } from '@training-observer/contracts';
import { ControlType, ScreenStatus } from '@training-observer/core/models';
import { RecordingEventKind } from '@training-observer/contracts';

export class StateRecorder {
    private running = false;
    private events: RecordedEvent[] = [];
    private visit = 0;
    private key = '';
    private complete = true;
    private gap = '';
    private readonly owners = new Map<string, { visit: number; key: string }>();
    private seen = new Map<string, ControlSnapshot>();
    private readonly immediateValues = new Map<string, string>();

    start(screen: ScreenState, confirmed: Readonly<Record<string, ControlSnapshot>>): void {
        if (screen.status !== ScreenStatus.Ready || !screen.key)
            throw new Error('Дождитесь готового экрана.');
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
        this.recordDepartingConfirmations(confirmed);
        if (screen.status === ScreenStatus.Loading) return;
        if (screen.status !== ScreenStatus.Ready || !screen.key) {
            if (this.gap !== screen.reason) {
                this.append({
                    kind: RecordingEventKind.Unavailable,
                    reason: screen.reason,
                    visit: this.visit,
                    screenKey: this.key,
                });
                this.complete = false;
                this.gap = screen.reason;
            }
            return;
        }
        this.gap = '';
        if (this.key !== screen.key) {
            this.key = screen.key;
            this.visit++;
            this.immediateValues.clear();
            this.append({ kind: RecordingEventKind.Screen, screenKey: this.key, visit: this.visit });
        }
        this.recordCurrentControls(screen.controls, confirmed);
    }

    snapshot(): StateRecording {
        return structuredClone({
            kind: 'training-state-recording',
            version: 1,
            complete: this.complete,
            events: this.events,
        });
    }

    stop(): StateRecording {
        this.running = false;
        return this.snapshot();
    }

    private recordDepartingConfirmations(confirmed: Readonly<Record<string, ControlSnapshot>>): void {
        // Подтверждения могут принадлежать уходящему экрану, DOM-узлы которого уже удалены.
        for (const [id, control] of Object.entries(confirmed)) {
            if (this.seen.get(id) === control) continue;
            const owner = this.owners.get(id);
            if (owner) {
                this.seen.set(id, control);
                this.recordValue(control, owner);
            }
        }
    }

    private recordCurrentControls(
        controls: readonly ControlSnapshot[],
        confirmed: Readonly<Record<string, ControlSnapshot>>,
    ): void {
        for (const control of controls) {
            this.owners.set(control.id, { key: this.key, visit: this.visit });
            const confirmation = confirmed[control.id];
            if (confirmation && this.seen.get(control.id) !== confirmation) {
                this.seen.set(control.id, confirmation);
                this.recordValue(confirmation, { key: this.key, visit: this.visit });
            }
            if (control.kind === ControlType.Button || requiresBlur(control)) continue;
            const value = JSON.stringify([
                control.state.checked,
                control.state.indeterminate,
                control.state.value,
            ]);
            const previous = this.immediateValues.get(control.id);
            this.immediateValues.set(control.id, value);
            const captureInitial = recordsInitialState(control);
            if (previous !== value && (previous !== undefined || captureInitial))
                this.recordValue(control, { key: this.key, visit: this.visit });
        }
    }

    private recordValue(control: ControlSnapshot, owner: { key: string; visit: number }): void {
        if (control.state.redacted) return;
        const value = readControlValue(control);
        if (value === undefined) {
            this.complete = false;
            this.append({
                kind: RecordingEventKind.Unavailable,
                screenKey: owner.key,
                visit: owner.visit,
                field: structuredClone(control.locatorHints),
                reason: 'Значение не подтверждено наблюдением',
            });
            return;
        }
        this.append({
            kind: RecordingEventKind.Value,
            screenKey: owner.key,
            visit: owner.visit,
            field: structuredClone(control.locatorHints),
            value: structuredClone(value),
        });
    }

    private append(event: Omit<RecordedEvent, 'sequence'>): void {
        this.events.push({ ...event, sequence: this.events.length + 1 });
    }
}
