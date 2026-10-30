/** Карточка сохраняет типы ожиданий и выдаёт только пользовательские частичные изменения. */
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {FormControlDirective} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {expect} from '@jest/globals';
import {type FieldExpectation} from '@training-observer/contracts';

import {ExpectationCardComponent} from './expectation-card.component';

let fixture: ComponentFixture<ExpectationCardComponent>;
let patches: Array<Partial<FieldExpectation>>;

function expectation(
    expected: FieldExpectation['expected'],
    kind: FieldExpectation['descriptor']['kind'] = 'textbox',
): FieldExpectation {
    return {
        descriptor: {kind, label: 'Поле', tagName: 'input', role: kind, context: []},
        expected,
        message: 'Проверьте ответ',
        optional: false,
    };
}

function root(): HTMLElement {
    return fixture.nativeElement;
}

function render(field: FieldExpectation): void {
    fixture.componentRef.setInput('field', field);
    fixture.detectChanges();
}

function input(label: string): HTMLInputElement {
    return root().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
}

function edit(label: string, value: string): void {
    const field = input(label);

    field.value = value;
    field.dispatchEvent(new Event('input', {bubbles: true}));
    fixture.detectChanges();
}

function optional(): HTMLInputElement {
    const toggles = root().querySelectorAll<HTMLInputElement>('label.toggle input');

    return toggles[toggles.length - 1]!;
}

function clickButton(label: string): void {
    const button = [...root().querySelectorAll('button')].find(
        (item) => (item.getAttribute('aria-label') ?? item.textContent?.trim()) === label,
    );

    expect(button).toBeDefined();
    button!.click();
    fixture.detectChanges();
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(ExpectationCardComponent);
    patches = [];
    fixture.componentInstance.changed.subscribe((patch) => {
        patches.push(patch);
    });
});

afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
});

test('a boolean expectation emits boolean patches and never mutates its input model', () => {
    const field = expectation(false, 'checkbox');

    render(field);
    expect(input('Ожидание: Поле').checked).toBe(false);
    expect(patches).toEqual([]);
    input('Ожидание: Поле').click();
    fixture.detectChanges();
    expect(patches).toEqual([{expected: true}]);
    expect(field.expected).toBe(false);
    render({...field, expected: true});
    expect(patches).toEqual([{expected: true}]);
    input('Ожидание: Поле').click();
    fixture.detectChanges();
    expect(patches).toEqual([{expected: true}, {expected: false}]);
});

test.each(['textbox', 'number'] as const)(
    '%s expectations keep exact text, including formatting and whitespace',
    (kind) => {
        render(expectation('Исходное значение', kind));
        expect(input('Ожидание: Поле').value).toBe('Исходное значение');
        edit('Ожидание: Поле', '  001 500 ₽  ');
        expect(patches).toEqual([{expected: '  001 500 ₽  '}]);
    },
);

test('combobox text remains one array item even when it contains a semicolon', () => {
    const field = expectation(['Анна'], 'combobox');

    render(field);
    expect(input('Ожидание: Поле').value).toBe('Анна');
    edit('Ожидание: Поле', 'Анна; Борис');
    edit('Ожидание: Поле', '');
    expect(patches).toEqual([{expected: ['Анна; Борис']}, {expected: []}]);
    expect(field.expected).toEqual(['Анна']);
});

test.each(['select', 'textbox'] as const)(
    '%s array rows preserve semicolons, commas, whitespace and empty values exactly',
    (kind) => {
        const field = expectation(
            [' A; B ', 'С запятой, внутри', '', '  Пробелы  '],
            kind,
        );

        render(field);
        expect(input('Ожидание: Поле').value).toBe(' A; B ');
        expect(input('Ожидание 2: Поле').value).toBe('С запятой, внутри');
        expect(input('Ожидание 3: Поле').value).toBe('');
        expect(input('Ожидание 4: Поле').value).toBe('  Пробелы  ');
        expect(patches).toEqual([]);
        edit('Ожидание: Поле', '  Новое; значение,  ');
        edit('Ожидание 2: Поле', '');
        expect(patches).toEqual([
            {expected: ['  Новое; значение,  ', 'С запятой, внутри', '', '  Пробелы  ']},
            {expected: ['  Новое; значение,  ', '', '', '  Пробелы  ']},
        ]);
        expect(field.expected).toEqual([
            ' A; B ',
            'С запятой, внутри',
            '',
            '  Пробелы  ',
        ]);
    },
);

test('an empty array can add and remove individual values without a delimiter parser', () => {
    render(expectation([], 'select'));
    expect(input('Ожидание: Поле')).toBeNull();
    expect(root().textContent).toContain('Ни один вариант не выбран');
    expect(patches).toEqual([]);
    clickButton('Добавить значение');
    expect(input('Ожидание: Поле').value).toBe('');
    edit('Ожидание: Поле', ' A; B ');
    clickButton('Добавить значение');
    expect(input('Ожидание 2: Поле').value).toBe('');
    clickButton('Удалить значение 1');
    expect(input('Ожидание: Поле').value).toBe('');
    expect(input('Ожидание 2: Поле')).toBeNull();
    clickButton('Удалить значение 1');
    expect(input('Ожидание: Поле')).toBeNull();
    expect(patches).toEqual([
        {expected: ['']},
        {expected: [' A; B ']},
        {expected: [' A; B ', '']},
        {expected: ['']},
        {expected: []},
    ]);
});

test('external array replacements resize and synchronize rows without echoed patches', () => {
    render(expectation(['Первый', 'Второй'], 'select'));
    render(expectation([' A; B ', '', '  Третий  '], 'select'));
    expect(input('Ожидание: Поле').value).toBe(' A; B ');
    expect(input('Ожидание 2: Поле').value).toBe('');
    expect(input('Ожидание 3: Поле').value).toBe('  Третий  ');
    expect(patches).toEqual([]);
    edit('Ожидание 3: Поле', ' ; ');
    expect(patches).toEqual([{expected: [' A; B ', '', ' ; ']}]);
    render(expectation(['Один'], 'select'));
    expect(input('Ожидание: Поле').value).toBe('Один');
    expect(input('Ожидание 2: Поле')).toBeNull();
    render(expectation([], 'select'));
    expect(input('Ожидание: Поле')).toBeNull();
    expect(patches).toEqual([{expected: [' A; B ', '', ' ; ']}]);
});

test('message and optional edits emit independent patches and preserve plain-text previews', () => {
    const field = expectation('Ответ');

    render(field);
    expect(input('Успех: Поле').value).toBe('');
    expect(patches).toEqual([]);
    edit('Ошибка: Поле', '<b>Не так</b>');
    edit('Успех: Поле', 'Отлично');
    render({...field, message: '<b>Не так</b>', successMessage: 'Отлично'});
    expect(root().querySelector('.preview.error')?.textContent).toContain(
        '<b>Не так</b>',
    );
    expect(root().querySelector('.preview.error b')).toBeNull();
    edit('Успех: Поле', '');
    optional().click();
    fixture.detectChanges();
    expect(patches).toEqual([
        {message: '<b>Не так</b>'},
        {successMessage: 'Отлично'},
        {successMessage: ''},
        {optional: true},
    ]);
    render({...field, optional: true});
    expect(root().textContent).toContain('Поле не проверяется, уведомления');
    expect(root().querySelector('.preview')).toBeNull();
});

test('an external field replacement synchronizes every form control without emitting changes', () => {
    render(expectation(false, 'checkbox'));
    const field = expectation(['Новое имя'], 'combobox');

    render({
        ...field,
        descriptor: {...field.descriptor, label: 'Внешнее поле'},
        message: 'Новая ошибка',
        successMessage: 'Новый успех',
        optional: true,
    });
    expect(input('Ожидание: Внешнее поле').value).toBe('Новое имя');
    expect(input('Ошибка: Внешнее поле').value).toBe('Новая ошибка');
    expect(input('Успех: Внешнее поле').value).toBe('Новый успех');
    expect(optional().checked).toBe(true);
    expect(root().querySelector('article')?.getAttribute('aria-label')).toBe(
        'Ожидание для поля Внешнее поле',
    );
    expect(patches).toEqual([]);
});

test('applying an emitted patch back to the input does not echo another patch', () => {
    let field = expectation('Первый ответ');

    fixture.componentInstance.changed.subscribe((patch) => {
        field = {...field, ...patch};
        fixture.componentRef.setInput('field', field);
    });
    render(field);
    edit('Ожидание: Поле', 'Новый ответ');
    edit('Ошибка: Поле', 'Другое сообщение');
    expect(patches).toEqual([{expected: 'Новый ответ'}, {message: 'Другое сообщение'}]);
    expect(input('Ожидание: Поле').value).toBe('Новый ответ');
    expect(input('Ошибка: Поле').value).toBe('Другое сообщение');
});

test('applying an array patch preserves the row input and does not echo output', () => {
    let field = expectation(['Первый', 'Второй'], 'select');

    fixture.componentInstance.changed.subscribe((patch) => {
        field = {...field, ...patch};
        fixture.componentRef.setInput('field', field);
    });
    render(field);
    const first = input('Ожидание: Поле');
    const second = input('Ожидание 2: Поле');

    edit('Ожидание: Поле', '  A; B  ');
    expect(input('Ожидание: Поле')).toBe(first);
    expect(input('Ожидание 2: Поле')).toBe(second);
    clickButton('Удалить значение 1');
    expect(input('Ожидание: Поле')).toBe(second);
    expect(patches).toEqual([{expected: ['  A; B  ', 'Второй']}, {expected: ['Второй']}]);
});

test('destroying the card releases array and static control subscriptions', () => {
    render(expectation(['Первый'], 'select'));
    const expected = fixture.debugElement
        .query(By.css('input[aria-label="Ожидание: Поле"]'))
        .injector.get(FormControlDirective).control;

    const message = fixture.debugElement
        .query(By.css('input[aria-label="Ошибка: Поле"]'))
        .injector.get(FormControlDirective).control;

    const emit = jest.spyOn(fixture.componentInstance.changed, 'emit');

    fixture.destroy();
    expected.setValue('После уничтожения');
    message.setValue('После уничтожения');
    expect(emit).not.toHaveBeenCalled();
});
