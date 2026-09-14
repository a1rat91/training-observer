/** Поле demo: отрисовывает HTTP-схему через публичные Taiga controls, передаёт значение форме. Наблюдатель не используется. */
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiCheckbox, TuiInput, TuiRadio } from '@taiga-ui/core';
import { TuiComboBox, TuiDataListWrapper, TuiInputNumber, TuiSelect } from '@taiga-ui/kit';

export type FieldValue = string | number | boolean | null;
export interface ProcedureField {
    readonly id: string;
    readonly label: string;
    readonly kind: 'input' | 'number' | 'checkbox' | 'radio' | 'select' | 'combobox';
    readonly options?: readonly string[];
}

@Component({
    selector: 'app-procedure-field',
    imports: [
        FormsModule,
        TuiInput,
        TuiCheckbox,
        TuiRadio,
        TuiSelect,
        TuiComboBox,
        TuiDataListWrapper,
        TuiInputNumber,
    ],
    templateUrl: './procedure-field.component.html',
    styleUrl: './procedure-field.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureFieldComponent {
    readonly field = input.required<ProcedureField>();
    readonly value = input<FieldValue>(null);
    readonly changed = output<FieldValue>();
    protected readonly query = signal('');
    protected readonly results = computed(() =>
        (this.field().options ?? []).filter((option) =>
            option.toLowerCase().includes(this.query().toLowerCase()),
        ),
    );
    protected readonly numberValue = computed(() =>
        typeof this.value() === 'number' ? (this.value() as number) : null,
    );
}
