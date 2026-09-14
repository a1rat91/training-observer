/** Поле demo: отрисовывает HTTP-схему через публичные Taiga controls, передаёт значение форме. Наблюдатель не используется. */
import {ChangeDetectionStrategy, Component, computed, input, output, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiCheckbox, TuiInput, TuiRadio} from '@taiga-ui/core';
import {TuiComboBox, TuiDataListWrapper, TuiInputNumber, TuiSelect} from '@taiga-ui/kit';

export type FieldValue = string | number | boolean | null;
export interface ProcedureField {
    readonly id: string;
    readonly label: string;
    readonly kind: 'input' | 'number' | 'checkbox' | 'radio' | 'select' | 'combobox';
    readonly options?: readonly string[];
}

@Component({
    selector: 'app-procedure-field',
    imports: [FormsModule, TuiInput, TuiCheckbox, TuiRadio, TuiSelect, TuiComboBox, TuiDataListWrapper, TuiInputNumber],
    template: `
        @switch (field().kind) {
            @case ('checkbox') {
                <label class="choice"><input tuiCheckbox type="checkbox" [id]="field().id"
                    [ngModel]="value() === true" (ngModelChange)="changed.emit($event)" />{{ field().label }}</label>
            }
            @case ('radio') {
                <fieldset><legend>{{ field().label }}</legend>
                    @for (option of field().options; track option; let index = $index) {
                        <label class="choice"><input tuiRadio type="radio" [id]="field().id + '-' + index"
                            [name]="field().id" [value]="option" [ngModel]="value()"
                            (ngModelChange)="changed.emit($event)" />{{ option }}</label>
                    }
                </fieldset>
            }
            @case ('select') {
                <tui-textfield><label tuiLabel [for]="field().id">{{ field().label }}</label>
                    <input tuiSelect [id]="field().id" [ngModel]="value()" (ngModelChange)="changed.emit($event)" />
                    <tui-data-list-wrapper *tuiDropdown [items]="field().options ?? []" />
                </tui-textfield>
            }
            @case ('combobox') {
                <tui-textfield><label tuiLabel [for]="field().id">{{ field().label }}</label>
                    <input #search tuiComboBox [id]="field().id" [ngModel]="value()"
                        (input)="query.set(search.value)" (ngModelChange)="changed.emit($event)" />
                    <tui-data-list-wrapper *tuiDropdown [items]="results()" emptyContent="Ничего не найдено" />
                </tui-textfield>
            }
            @case ('number') {
                <tui-textfield><label tuiLabel [for]="field().id">{{ field().label }}</label>
                    <input tuiInputNumber [id]="field().id" [ngModel]="numberValue()" (ngModelChange)="changed.emit($event)" />
                </tui-textfield>
            }
            @default {
                <tui-textfield><label tuiLabel [for]="field().id">{{ field().label }}</label>
                    <input tuiInput [id]="field().id" [name]="field().id" [ngModel]="value()" (ngModelChange)="changed.emit($event)" />
                </tui-textfield>
            }
        }
    `,
    styles: ':host {display:block; min-width:0;} .choice {display:flex; align-items:center; gap:.75rem; margin-block:.5rem;} fieldset {border:1px solid var(--tui-border-normal); border-radius:.5rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureFieldComponent {
    readonly field = input.required<ProcedureField>();
    readonly value = input<FieldValue>(null);
    readonly changed = output<FieldValue>();
    protected readonly query = signal('');
    protected readonly results = computed(() => (this.field().options ?? []).filter((option) => option.toLowerCase().includes(this.query().toLowerCase())));
    protected readonly numberValue = computed(() => typeof this.value() === 'number' ? this.value() as number : null);
}
