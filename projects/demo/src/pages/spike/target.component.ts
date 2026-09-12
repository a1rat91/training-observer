import {ChangeDetectionStrategy, Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {
    TuiCheckbox,
    TuiDataListWrapper,
    TuiInputNumber,
    TuiSelect,
    TuiSwitch,
} from '@taiga-ui/kit';

/**
 * Ранняя тестовая форма со смесью native и Taiga controls; не финальная матрица benchmark.
 * Алгоритм: шаблон отображает controls и повторяющиеся контексты, обработчики изменяют локальные значения.
 * Наблюдатель не вызывается из формы; компонент остаётся частью неподключённого черновика.
 */
@Component({
    standalone: true,
    selector: 'spike-target',
    imports: [
        FormsModule,
        TuiButton,
        TuiCheckbox,
        TuiDataListWrapper,
        TuiInputNumber,
        TuiSelect,
        TuiSwitch,
        TuiTextfield,
    ],
    template: `
        <section aria-label="Заявка сотрудника">
            <h2>Заявка сотрудника</h2>
            <div class="actions">
                <button
                    type="button"
                    (click)="status = 'Черновик сохранён'"
                >
                    Сохранить черновик
                </button>
                <button
                    aria-label="Открыть справку"
                    type="button"
                    (click)="status = 'Справка открыта'"
                >
                    ?
                </button>
                <a href="#policy">Правила обучения</a>
            </div>
            <div class="fields">
                <label>
                    Фамилия
                    <input
                        name="surname"
                        [(ngModel)]="surname"
                    />
                </label>
                <label>
                    Рабочая почта
                    <input
                        name="email"
                        type="email"
                    />
                </label>
                <input
                    placeholder="Найти сотрудника"
                    type="search"
                />
                <label>
                    Комментарий
                    <textarea name="comment"></textarea>
                </label>
                <label>
                    <input type="checkbox" />
                    Согласие на обучение
                </label>
                <label>
                    <input
                        name="format"
                        type="radio"
                        value="remote"
                    />
                    Дистанционно
                </label>
                <label>
                    Отдел
                    <select name="department">
                        <option>Разработка</option>
                        <option>Поддержка</option>
                    </select>
                </label>
                <label>
                    Навыки
                    <select
                        multiple
                        name="skills"
                    >
                        <option>Angular</option>
                        <option>TypeScript</option>
                        <option>SQL</option>
                    </select>
                </label>
                <label>
                    Стаж
                    <input
                        max="40"
                        min="0"
                        type="number"
                    />
                </label>
                <label>
                    Дата начала
                    <input type="date" />
                </label>
                <label>
                    Нагрузка
                    <input
                        max="100"
                        min="0"
                        type="range"
                    />
                </label>
                <label>
                    Пароль
                    <input
                        autocomplete="new-password"
                        type="password"
                    />
                </label>
                <div
                    aria-label="Заметки"
                    contenteditable="true"
                    role="textbox"
                >
                    Рабочие заметки
                </div>
                <details>
                    <summary>Требования к курсу</summary>
                    <p>Курс длится четыре недели.</p>
                </details>
                <div
                    role="button"
                    tabindex="0"
                    (click)="status = 'Архив открыт'"
                    (keydown.enter)="status = 'Архив открыт'"
                >
                    Открыть архив
                </div>
                <div
                    aria-label="Уведомления"
                    role="switch"
                    tabindex="0"
                    [attr.aria-checked]="notifications"
                    (click)="notifications = !notifications"
                    (keydown.space)="notifications = !notifications"
                >
                    Уведомления
                </div>
                <div
                    aria-selected="true"
                    role="tab"
                    tabindex="0"
                >
                    План обучения
                </div>
            </div>
            <table>
                <caption>Сотрудники</caption>
                <tbody>
                    <tr>
                        <th>Анна Смирнова</th>
                        <td><button type="button">Редактировать</button></td>
                    </tr>
                    <tr>
                        <th>Борис Иванов</th>
                        <td><button type="button">Редактировать</button></td>
                    </tr>
                </tbody>
            </table>
            <p role="status">{{ status }}</p>
        </section>
        <section aria-label="Taiga UI">
            <h2>Taiga UI · реальные компоненты</h2>
            <div class="fields">
                <button
                    tuiButton
                    type="button"
                    (click)="status = 'Заявка отправлена'"
                >
                    Отправить заявку
                </button>
                <tui-textfield>
                    <label tuiLabel>Должность</label>
                    <input
                        tuiTextfield
                        [(ngModel)]="position"
                    />
                </tui-textfield>
                <label>
                    <input
                        tuiCheckbox
                        type="checkbox"
                        [(ngModel)]="approved"
                    />
                    Одобрено руководителем
                </label>
                <label>
                    <input
                        tuiSwitch
                        type="checkbox"
                        [(ngModel)]="mentor"
                    />
                    Нужен наставник
                </label>
                <tui-textfield>
                    <label tuiLabel>Бюджет обучения</label>
                    <input
                        tuiInputNumber
                        [(ngModel)]="budget"
                    />
                </tui-textfield>
                <tui-textfield>
                    <label tuiLabel>Учебный трек</label>
                    <input
                        tuiSelect
                        [(ngModel)]="track"
                    />
                    <tui-data-list-wrapper
                        *tuiTextfieldDropdown
                        [items]="tracks"
                    />
                </tui-textfield>
            </div>
        </section>
    `,
    styles: `
        :host {
            display: block;
            min-width: 0;
        }
        section {
            border: 1px solid #dce1e8;
            border-radius: 14px;
            padding: 22px;
            background: white;
            margin-bottom: 20px;
        }
        h2 {
            font-size: 19px;
            margin: 0 0 20px;
        }
        .fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
            align-items: start;
        }
        .fields > label {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
        }
        input:not(
            [type='checkbox'],
            [type='radio'],
            [type='range'],
            [tuiTextfield],
            [tuiInputNumber],
            [tuiSelect]
        ),
        textarea,
        select {
            padding: 8px;
            border: 1px solid #a8b4c4;
            border-radius: 6px;
            max-width: 100%;
        }
        button:not([tuiButton]),
        [role='button'] {
            padding: 9px 13px;
            border: 1px solid #a8b4c4;
            border-radius: 6px;
            background: #f6f8fb;
            cursor: pointer;
        }
        .actions {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
        }
        table {
            margin-top: 24px;
            width: 100%;
            text-align: left;
        }
        td,
        th {
            padding: 8px;
        }
        [contenteditable] {
            border: 1px dashed #a8b4c4;
            padding: 10px;
        }
        @media (max-width: 900px) {
            .fields {
                grid-template-columns: 1fr;
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpikeTargetComponent {
    public surname = '';
    public position = '';
    public status = 'Заполните заявку';
    public approved = false;
    public mentor = true;
    public notifications = true;
    public budget = 50000;
    public track: string | null = null;
    public tracks = ['Frontend', 'Backend', 'Аналитика'];
}
