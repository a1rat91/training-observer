import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

import {parseRecording} from '../libs/training-observer/src/contracts';

test('player-only recording ignores search and directory values while detecting late mount', async ({
    page,
}) => {
    await page.goto('/spike/record');
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
    await page.goto('/spike/record');
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
