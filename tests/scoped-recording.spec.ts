import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

import {parseRecording} from '../libs/training-observer/src/contracts';

test('player-only recording ignores search and directory values while detecting late mount', async ({
    page,
}) => {
    await page.goto('/record');
    await page
        .getByText('Соседние приложения — для проверки изоляции', {exact: true})
        .click();
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    await page.getByText('Границы микрофронтов', {exact: true}).click();
    await page
        .getByRole('checkbox', {name: 'Наблюдать procedure-search', exact: true})
        .uncheck();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('textbox', {name: 'Поиск', exact: true}).fill('OFF_AREA_SECRET');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await expect(page.getByRole('list', {name: 'Записанные действия'})).toContainText(
        'Анна',
    );
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const downloaded = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const text = await readFile(await (await downloaded).path(), 'utf8');
    const report = parseRecording(text);

    expect(text).not.toContain('OFF_AREA_SECRET');
    expect(report.actions).toHaveLength(1);
    expect(report.actions[0]!.kind).toBe('input');
    expect(
        report.descriptors.some(
            (descriptor) =>
                descriptor.fingerprint.features.accessibleName === 'Поиск процедуры',
        ),
    ).toBe(false);
});

test('enabling a neighboring MF records new edits in the same journal', async ({
    page,
}) => {
    await page.goto('/record');
    await page
        .getByText('Соседние приложения — для проверки изоляции', {exact: true})
        .click();
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    await page.getByText('Границы микрофронтов', {exact: true}).click();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    const search = page.getByRole('textbox', {name: 'Поиск', exact: true});

    await search.fill('BEFORE_ENABLE');
    await search.press('Tab');
    await page.getByRole('checkbox', {name: 'Наблюдать directory', exact: true}).check();
    await search.fill('Анна');
    await search.press('Tab');
    await expect(page.getByRole('list', {name: 'Записанные действия'})).toContainText(
        'Анна',
    );
    await page
        .getByRole('checkbox', {name: 'Наблюдать directory', exact: true})
        .uncheck();
    await search.fill('AFTER_DISABLE');
    await search.press('Tab');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const list = page.getByRole('list', {name: 'Записанные действия'});

    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).not.toContainText('BEFORE_ENABLE');
    await expect(list).not.toContainText('AFTER_DISABLE');
});

test('v3 carries search and late player bindings into a new learner document', async ({
    page,
    context,
}) => {
    await page.goto('/record');
    await page
        .getByText('Соседние приложения — для проверки изоляции', {exact: true})
        .click();
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page
        .getByRole('button', {name: 'Выбрать результат в приложении', exact: true})
        .click();
    // This test checks a two-area exercise, not submission of the entire procedure.
    await page.getByRole('heading', {name: 'Данные сотрудника', exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать черновик сценария', exact: true})
        .click();
    await page
        .getByRole('button', {name: 'Сохранить и открыть прохождение', exact: true})
        .click();
    const learner = await context.newPage();

    await page.close();
    await learner.goto('/learn');
    await expect(learner.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveCount(0);
    // Training starts automatically when the saved scenario loads.
    await expect(
        learner.getByRole('heading', {name: 'Заполните «Поиск процедуры»', exact: true}),
    ).toBeVisible();
    await learner.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await learner.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await expect(
        learner.getByRole('heading', {name: 'Заполните «ФИО»', exact: true}),
    ).toBeVisible();
    await learner.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await learner.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await expect(
        learner.getByRole('heading', {name: 'Обучение завершено', exact: true}),
    ).toBeVisible();
    await expect(learner.getByRole('alert')).toHaveCount(0);
});
