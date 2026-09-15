/** Хранит выбор, реально увиденный в связанном popup, без вывода по совпадению текста. Доказательство принадлежит связи control/host/popup; редактирование, изменение значения, открытый список без выбора, потеря связи, удаление и новый сеанс сбрасывают его. Сырой снимок не меняется; доказательство используется только при подтверждении blur. */
import {type ControlSnapshot} from '@training-observer/core/models';

interface Evidence {
    readonly displayValue: string;
    readonly label: string;
    readonly hostNodeId: string;
    readonly popupIds: string;
}
export class SelectionEvidence {
    private readonly entries = new Map<string, Evidence>();

    public observe(controls: readonly ControlSnapshot[]): void {
        const ids = new Set(controls.map((control) => control.id));

        for (const id of this.entries.keys()) {
            if (!ids.has(id)) {
                this.entries.delete(id);
            }
        }

        for (const control of controls) {
            this.remember(control);
        }
    }

    public remember(control: ControlSnapshot): void {
        if (control.kind !== 'combobox') {
            return;
        }

        const choice = control.choice;
        const previous = this.entries.get(control.id);
        const popupIds = JSON.stringify(choice?.popup.referencedIds ?? []);

        if (
            !choice ||
            control.state.redacted ||
            choice.popup.busy ||
            choice.popup.relation !== 'aria-controls' ||
            !choice.popup.referencedIds.length ||
            choice.popup.status === 'unresolved'
        ) {
            this.invalidate(control.id);

            return;
        }

        // Ранее выбранный вариант при вводе нового запроса не подтверждает новый запрос.
        if (
            choice.popup.status === 'open' &&
            choice.selection.status === 'observed' &&
            choice.selection.labels.length === 1 &&
            choice.selection.labels[0] === choice.displayValue
        ) {
            this.entries.set(control.id, {
                displayValue: choice.displayValue,
                label: choice.selection.labels[0],
                hostNodeId: control.hostNodeId,
                popupIds,
            });

            return;
        }

        if (
            choice.popup.status !== 'closed' ||
            previous?.displayValue !== choice.displayValue ||
            previous.hostNodeId !== control.hostNodeId ||
            previous.popupIds !== popupIds
        ) {
            this.invalidate(control.id);
        }
    }

    public confirm(control: ControlSnapshot): ControlSnapshot {
        const evidence = this.entries.get(control.id);
        const choice = control.choice;

        return !evidence ||
            choice?.selection.status !== 'unknown' ||
            choice.popup.status !== 'closed' ||
            control.state.redacted ||
            choice.popup.busy ||
            choice.popup.relation !== 'aria-controls' ||
            evidence.displayValue !== choice.displayValue ||
            evidence.hostNodeId !== control.hostNodeId ||
            evidence.popupIds !== JSON.stringify(choice.popup.referencedIds)
            ? control
            : {
                  ...control,
                  choice: {
                      ...choice,
                      selection: {
                          status: 'observed',
                          labels: [evidence.label],
                          evidence: 'previous-snapshot',
                      },
                  },
              };
    }

    public invalidate(id: string): void {
        this.entries.delete(id);
    }

    public clear(): void {
        this.entries.clear();
    }
}
