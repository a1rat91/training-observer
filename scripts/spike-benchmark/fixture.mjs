/* eslint @typescript-eslint/explicit-member-accessibility: "off" -- This JIT fixture is JavaScript, which has no TypeScript access modifiers. */
// Research fixture only. No training imports, markers or oracle are installed in the host.
import 'zone.js';
import '@angular/compiler';

import {Component, enableProdMode} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideAnimations} from '@angular/platform-browser/animations';
import {TuiButton, TuiRoot, TuiTextfield} from '@taiga-ui/core';
import {provideEventPlugins} from '@taiga-ui/event-plugins';
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

enableProdMode();

class ResearchFixture {
    employee = '';
    email = '';
    course = null;
    budget = 20000;
    consent = false;
    mentor = true;
    comment = '';
    date = null;
    courses = ['Angular', 'TypeScript'];
    format = 'online';
    quantity = 1;
}

Component({
    selector: 'research-fixture',
    standalone: true,
    imports: [
        FormsModule,
        TuiRoot,
        TuiTextfield,
        TuiButton,
        TuiCheckbox,
        TuiSwitch,
        TuiInputNumber,
        TuiRadio,
        TuiInputDate,
        TuiTextarea,
        TuiSelect,
        TuiDataListWrapper,
    ],
    template: `<tui-root><main>
        <h1>Taiga UI 4 · Resolver benchmark</h1>
        <form aria-label="Заявка на обучение">
            <tui-textfield><label tuiLabel>ФИО</label><input tuiTextfield [(ngModel)]="employee" name="employee" /></tui-textfield>
            <tui-textfield><label tuiLabel>Рабочая почта</label><input tuiTextfield type="email" [(ngModel)]="email" name="email" /></tui-textfield>
            <tui-textfield><label tuiLabel>Курс</label><input tuiSelect [(ngModel)]="course" name="course" /><tui-data-list-wrapper new *tuiTextfieldDropdown [items]="courses" /></tui-textfield>
            <tui-textfield><label tuiLabel>Бюджет</label><input tuiInputNumber [(ngModel)]="budget" name="budget" /></tui-textfield>
            <label><input tuiCheckbox type="checkbox" [(ngModel)]="consent" name="consent" /> Согласие</label>
            <label><input tuiSwitch type="checkbox" [(ngModel)]="mentor" name="mentor" /> Нужен наставник</label>
            <tui-textfield><label tuiLabel>Комментарий</label><textarea tuiTextarea [(ngModel)]="comment" name="comment"></textarea></tui-textfield>
            <tui-textfield><label tuiLabel>Дата начала</label><input tuiInputDate [(ngModel)]="date" name="date" /></tui-textfield>
            <button tuiButton type="button"><span>Продолжить</span></button>
            <button tuiButton type="button" aria-label="Открыть справку"><span aria-hidden="true">?</span></button>
        </form>
        <fieldset><legend>Анна</legend><button tuiButton type="button">Редактировать</button></fieldset>
        <fieldset><legend>Борис</legend><button tuiButton type="button">Редактировать</button></fieldset>
        <section aria-label="Неразличимые действия"><button tuiButton type="button">Действие</button><button tuiButton type="button">Действие</button></section>
        <form aria-label="Дополнительные сведения">
            <tui-textfield><label tuiLabel>Телефон</label><input tuiTextfield type="tel" name="phone" /></tui-textfield>
            <tui-textfield><label tuiLabel>Сайт организатора</label><input tuiTextfield type="url" name="website" /></tui-textfield>
            <tui-textfield><input tuiTextfield type="search" placeholder="Найти сотрудника" /></tui-textfield>
            <tui-textfield><input tuiTextfield aria-label="Код подразделения" /></tui-textfield>
            <tui-textfield><label tuiLabel>Количество участников</label><input tuiInputNumber name="quantity" [(ngModel)]="quantity" /></tui-textfield>
            <label><input tuiRadio type="radio" [(ngModel)]="format" value="online" name="format" /> Онлайн</label>
            <label><input tuiRadio type="radio" [(ngModel)]="format" value="office" name="format" /> В офисе</label>
            <tui-textfield><label tuiLabel>Только для чтения</label><input tuiTextfield [readOnly]="true" value="Согласовано" /></tui-textfield>
            <tui-textfield><label tuiLabel>Недоступное поле</label><input tuiTextfield [disabled]="true" /></tui-textfield>
            <a tuiButton href="/guide">Инструкция</a>
            <button tuiButton type="button" title="Отменить оформление">Отмена</button>
            <tui-textfield><label tuiLabel>Пояснение</label><textarea tuiTextarea name="explanation"></textarea></tui-textfield>
        </form>
        <table><tbody>
            <tr><th scope="row">Елена</th><td><button tuiButton type="button">Назначить</button></td></tr>
            <tr><th scope="row">Игорь</th><td><button tuiButton type="button">Назначить</button></td></tr>
        </tbody></table>
    </main></tui-root>`,
    styles: 'main {max-width:820px;padding:32px;margin:auto} form {display:grid;gap:16px;grid-template-columns:1fr 1fr} fieldset,section {margin-top:24px} h1{font-size:24px} button{margin:4px}',
})(ResearchFixture);
await bootstrapApplication(ResearchFixture, {providers: [provideAnimations(), provideEventPlugins()]});
