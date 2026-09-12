import {readFile} from 'node:fs/promises';

import {expect, type Page, test} from '@playwright/test';

import {parseRecording, type Recording} from '../libs/training-observer/src/contracts';

async function select(page: Page, name: string, option: string): Promise<void> {
    await page.getByRole('combobox', {name, exact: true}).click();
    await page.getByRole('option', {name: option, exact: true}).click();
}

async function begin(page: Page, alternate = false, capture = true): Promise<void> {
    await page.goto('/spike/record');
    await select(page, 'Поиск процедуры', 'Заявка на обучение');
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await page.getByText('Условия тестового прохождения', {exact: true}).click();

    if (alternate) {
        await select(page, 'Расположение полей', 'Другое расположение');
    }

    if (!capture) {
        await page.getByRole('checkbox', {name: 'Сохранять значения полей'}).uncheck();
    }

    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
}

async function next(page: Page): Promise<void> {
    await page.getByRole('button', {name: 'Продолжить', exact: true}).click();
}

async function identity(page: Page, external = false): Promise<void> {
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна Смирнова');
    await page
        .getByRole('textbox', {name: 'Рабочая почта', exact: true})
        .fill('anna@example.test');
    await select(page, 'Вид обучения', external ? 'Внешний курс' : 'Внутренний курс');
    await next(page);
}

async function download(page: Page): Promise<Recording> {
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const pending = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const file = await pending;

    return parseRecording(await readFile(await file.path(), 'utf8'));
}

function actions(report: Recording): unknown[] {
    return report.actions.map((action) => ({
        kind: action.kind,
        name:
            action.kind === 'navigation'
                ? action.pathname
                : report.descriptors.find((target) => target.id === action.targetId)
                      ?.fingerprint.features.accessibleName,
        ...('value' in action ? {value: action.value} : {}),
    }));
}

for (const alternate of [false, true]) {
    test(`records actual internal workflow, append/replace, dropdown and checked state (alternate=${alternate})`, async ({
        page,
    }) => {
        const errors: string[] = [];

        page.on('pageerror', (error) => errors.push(error.message));
        await begin(page, alternate);
        await identity(page);
        await select(page, 'Курс', 'Angular');
        await page.getByRole('radio', {name: 'Онлайн', exact: true}).check();
        await page.getByRole('switch', {name: 'Нужен наставник', exact: true}).check();
        await page
            .getByRole('textbox', {name: 'Комментарий', exact: true})
            .fill('Нужна практика');
        await next(page);
        await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
        await next(page);
        await expect(
            page.getByRole('heading', {name: 'Заявка принята', exact: true}),
        ).toBeVisible();
        const report = await download(page);
        const captured = (raw: boolean | string): object => ({status: 'captured', raw});

        expect(actions(report)).toEqual([
            {kind: 'click', name: 'Новая процедура'},
            {kind: 'input', name: 'ФИО', value: captured('Анна Смирнова')},
            {kind: 'input', name: 'Рабочая почта', value: captured('anna@example.test')},
            {kind: 'select', name: 'Вид обучения', value: captured('Внутренний курс')},
            {kind: 'click', name: 'Продолжить'},
            {kind: 'select', name: 'Курс', value: captured('Angular')},
            {kind: 'select', name: 'Онлайн', value: captured(true)},
            {kind: 'select', name: 'Нужен наставник', value: captured(true)},
            {kind: 'input', name: 'Комментарий', value: captured('Нужна практика')},
            {kind: 'click', name: 'Продолжить'},
            {kind: 'select', name: 'Данные проверены', value: captured(true)},
            {kind: 'click', name: 'Продолжить'},
        ]);
        expect(report.actions.every((action) => action.evidence.trusted)).toBe(true);
        expect(report.states.some((state) => !state.connected)).toBe(true);
        expect(report.states.some((state) => state.connected && !state.enabled)).toBe(
            true,
        );
        expect(report.diagnostics).toEqual([]);
        expect(errors).toEqual([]);
    });
}

test('external number/date normalization and server 422 do not fabricate actions', async ({
    page,
}) => {
    await begin(page);
    await identity(page, true);
    await page
        .getByRole('textbox', {name: 'Организатор', exact: true})
        .fill('Учебный центр');
    await page.getByRole('textbox', {name: 'Стоимость', exact: true}).fill('150000');
    await page
        .getByRole('textbox', {name: 'Дата начала', exact: true})
        .fill('15.02.2027');
    await next(page);
    await expect(
        page.getByText('Проверьте данные: сервер отклонил отправку.'),
    ).toBeVisible();
    await page
        .getByRole('textbox', {name: 'Обоснование', exact: true})
        .fill('Обучение необходимо для разработки внутренних приложений');
    await next(page);
    await page.getByRole('checkbox', {name: 'Данные проверены', exact: true}).check();
    await next(page);
    await expect(
        page.getByRole('heading', {name: 'Заявка принята', exact: true}),
    ).toBeVisible();
    const report = await download(page);

    expect(actions(report)).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                kind: 'input',
                name: 'Стоимость',
                value: expect.objectContaining({
                    normalized: {rule: 'decimal-comma-v1', value: 150000},
                }),
            }),
            expect.objectContaining({
                kind: 'input',
                name: 'Дата начала',
                value: expect.objectContaining({
                    raw: '15.02.2027',
                    normalized: {rule: 'date-dmy-v1', value: '2027-02-15'},
                }),
            }),
        ]),
    );
    expect(report.actions.filter((action) => action.kind === 'click')).toHaveLength(5);
    expect(report.diagnostics).toEqual([]);
});

test('value omission preserves actions but removes raw input values', async ({page}) => {
    await begin(page, false, false);
    await identity(page);
    const report = await download(page);

    expect(report.actions.map((action) => action.kind)).toEqual([
        'click',
        'input',
        'input',
        'select',
        'click',
    ]);
    expect(JSON.stringify(report)).not.toContain('anna@example.test');
    expect(
        report.actions
            .filter((action) => 'value' in action)
            .every((action) => 'value' in action && action.value.status === 'omitted'),
    ).toBe(true);
});

test('keyboard option selection is recorded once with keyboard evidence', async ({
    page,
}) => {
    await begin(page);
    await page.getByRole('combobox', {name: 'Вид обучения', exact: true}).click();
    await page.getByRole('option', {name: 'Внутренний курс', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect(
        page.getByRole('combobox', {name: 'Вид обучения', exact: true}),
    ).toHaveValue('Внутренний курс');
    const report = await download(page);

    expect(report.actions.map((action) => action.kind)).toEqual(['click', 'select']);
    expect(report.actions[1]).toMatchObject({
        evidence: {trusted: true, trigger: 'keyboard'},
        value: {raw: 'Внутренний курс'},
    });
});

test('DOM property changes appear in states without producing input actions', async ({
    page,
}) => {
    await begin(page);
    await page
        .getByRole('textbox', {name: 'ФИО', exact: true})
        .evaluate((element: HTMLInputElement) => {
            element.value = 'Программное значение';
        });
    await page.getByText('Наблюдаемые состояния (последние 10)', {exact: true}).click();
    await expect(page.locator('aside pre')).toContainText('Программное значение');
    const report = await download(page);

    expect(report.actions.map((action) => action.kind)).toEqual(['click']);
    expect(report.states).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                source: expect.stringMatching(/^(?:property-observer|mutation)$/),
                value: {status: 'captured', raw: 'Программное значение'},
            }),
        ]),
    );
});

test('saved descriptor resolves after the player recreates the form in another layout', async ({
    page,
}) => {
    await begin(page);
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const previous = await page
        .getByRole('textbox', {name: 'ФИО', exact: true})
        .elementHandle();

    await page.getByText('Условия тестового прохождения', {exact: true}).click();
    await select(page, 'Расположение полей', 'Другое расположение');
    await page.getByRole('button', {name: 'Новая процедура', exact: true}).click();
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveValue('');
    expect(await previous.evaluate((element) => element.isConnected)).toBe(false);
    await page.getByRole('button', {name: 'Проверить поиск', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Результаты поиска'})).toContainText(
        'ФИО · resolved',
    );
    await page.getByRole('button', {name: 'Сбросить', exact: true}).click();
    await page.getByRole('button', {name: 'Проверить поиск', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Результаты поиска'})).toContainText(
        'ФИО · broken',
    );
});
