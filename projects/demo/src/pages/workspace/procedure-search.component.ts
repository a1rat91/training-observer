import {ChangeDetectionStrategy, Component, output} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {TuiTextfield} from '@taiga-ui/core';
import {TuiComboBox, TuiDataListWrapper, TuiFilterByInputPipe} from '@taiga-ui/kit';

export interface ProcedureDefinition {
    readonly title: string;
    readonly profile: string;
}

@Component({
    selector: 'procedure-search-mf',
    imports: [
        ReactiveFormsModule,
        TuiComboBox,
        TuiDataListWrapper,
        TuiFilterByInputPipe,
        TuiTextfield,
    ],
    template: `
        <h2>Поиск процедур</h2>
        <p>
            Выберите процедуру — её форма откроется ниже. Каталог локальный; формы
            загружает HTTP-сервер.
        </p>
        <tui-textfield [stringify]="stringify">
            <label tuiLabel>Поиск процедуры</label>
            <input
                tuiComboBox
                [formControl]="control"
                [matcher]="null"
            />
            <tui-data-list-wrapper
                *tuiTextfieldDropdown
                new
                [items]="procedures | tuiFilterByInput"
            />
        </tui-textfield>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureSearchComponent {
    public readonly selected = output<ProcedureDefinition | null>();
    public readonly control = new FormControl<ProcedureDefinition | null>(null);
    public readonly procedures: readonly ProcedureDefinition[] = [
        {title: 'Заявка на обучение', profile: 'Обычный ответ'},
        {title: 'Заявка на обучение — медленный сервер', profile: 'Медленный ответ'},
        {title: 'Заявка на обучение — сбой сервера', profile: 'Сбой перед сохранением'},
    ];

    constructor() {
        this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
            this.selected.emit(
                value !== null && this.procedures.includes(value) ? value : null,
            );
        });
    }
    public readonly stringify = (item: ProcedureDefinition): string => item.title;
}
