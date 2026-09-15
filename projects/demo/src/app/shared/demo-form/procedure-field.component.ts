/** Поле demo: отрисовывает HTTP-схему через публичные Taiga controls, передаёт значение форме. Наблюдатель не используется. */
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiTextfield} from '@taiga-ui/core';
import {
    TuiCheckbox,
    TuiComboBox,
    TuiDataListWrapper,
    TuiInputNumber,
    TuiRadio,
    TuiSelect,
} from '@taiga-ui/kit';

export type FieldValue = boolean | number | string | null;
export interface ProcedureField {
    readonly id: string;
    readonly label: string;
    readonly kind: 'checkbox' | 'combobox' | 'input' | 'number' | 'radio' | 'select';
    readonly options?: readonly string[];
}

@Component({
    selector: 'app-procedure-field',
    imports: [
        FormsModule,
        TuiCheckbox,
        TuiComboBox,
        TuiDataListWrapper,
        TuiInputNumber,
        TuiRadio,
        TuiSelect,
        TuiTextfield,
    ],
    templateUrl: './procedure-field.component.html',
    styleUrl: './procedure-field.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureFieldComponent {
    protected readonly query = signal('');
    protected readonly results = computed(() =>
        (this.field().options ?? []).filter((option) =>
            option.toLowerCase().includes(this.query().toLowerCase()),
        ),
    );

    protected readonly numberValue = computed(() => {
        const value = this.value();

        return typeof value === 'number' ? value : null;
    });

    public readonly field = input.required<ProcedureField>();
    public readonly value = input<FieldValue>(null);
    public readonly changed = output<FieldValue>();
}
