import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {type FormControl, ReactiveFormsModule} from '@angular/forms';
import {type TuiDay} from '@taiga-ui/cdk';
import {TuiTextfield} from '@taiga-ui/core';
import {
    TuiCheckbox,
    TuiDataListWrapper,
    TuiInputDate,
    TuiInputNumber,
    TuiRadio,
    TuiSelect,
    TuiSwitch,
    TuiTextarea,
} from '@taiga-ui/kit';

import {type ProcedureField} from './procedure-contract';

export type FieldValue = TuiDay | boolean | number | string | null;

@Component({
    standalone: true,
    selector: 'procedure-field',
    imports: [
        ReactiveFormsModule,
        TuiCheckbox,
        TuiDataListWrapper,
        TuiInputDate,
        TuiInputNumber,
        TuiRadio,
        TuiSelect,
        TuiSwitch,
        TuiTextarea,
        TuiTextfield,
    ],
    templateUrl: './procedure-field.component.html',
    styles: ':host {display: block} fieldset {border: 0; padding: 0; margin: 0} .choice {display: flex; align-items: center; gap: .5rem; margin-block: .75rem} .error {color: var(--tui-text-negative); margin-block: .5rem}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureFieldComponent {
    public readonly field = input.required<ProcedureField>();
    public readonly control = input.required<FormControl<FieldValue>>();
    public readonly error = input('');
    public readonly options = computed(
        () => this.field().options?.map((item) => item.label) ?? [],
    );
}
