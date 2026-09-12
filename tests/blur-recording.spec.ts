import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

import {parseRecording} from '../libs/training-observer/src/contracts';

test('Taiga text input remains a draft through a pause and Enter, then commits once on Tab', async ({
    page,
}) => {
    await page.goto('/spike/record');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    const input = page.getByRole('textbox', {name: 'ФИО', exact: true});

    await expect(input).toBeVisible();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await input.fill('Ан');
    // Deliberately exceed the former 400 ms idle timeout while retaining focus.
    await page.waitForTimeout(800);
    await input.fill('Анна');
    await input.press('Enter');
    await page.waitForTimeout(800);
    const actions = page
        .getByRole('list', {name: 'Записанные действия'})
        .getByRole('listitem');

    await expect(actions.filter({hasText: 'input'})).toHaveCount(0);
    await expect(input).toBeFocused();
    await input.press('Tab');
    await expect(actions.filter({hasText: 'input'})).toHaveCount(1);
    await input.focus();
    await input.press('Tab');
    await expect(actions.filter({hasText: 'input'})).toHaveCount(1);
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    const download = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const recording = parseRecording(
        await readFile(await (await download).path(), 'utf8'),
    );

    expect(recording.actions.filter((action) => action.kind === 'input')).toEqual([
        expect.objectContaining({
            commit: 'blur',
            value: {status: 'captured', raw: 'Анна'},
        }),
    ]);
});

test('Taiga combobox distinguishes a blurred search query from a confirmed procedure', async ({
    page,
}) => {
    await page.goto('/spike/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    const search = page.getByRole('combobox', {name: 'Поиск процедуры', exact: true});

    await search.fill('Заявка');
    await search.press('Tab');
    await expect(page.getByRole('option')).toHaveCount(0);
    const actions = page
        .getByRole('list', {name: 'Записанные действия'})
        .getByRole('listitem');

    await expect(actions.filter({hasText: 'input'})).toHaveCount(1);
    await expect(actions.filter({hasText: 'select'})).toHaveCount(0);
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toHaveCount(0);
    await search.click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await expect(page.getByRole('textbox', {name: 'ФИО', exact: true})).toBeVisible();
    await expect(actions.filter({hasText: 'select'})).toHaveCount(1);
});
