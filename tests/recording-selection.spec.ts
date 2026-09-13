import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

import {parseRecording} from '../libs/training-observer/src/contracts';

test('group selection pauses an active recording before blur and resumes its journal after save and cancel', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    const name = page.getByRole('textbox', {name: 'ФИО', exact: true});

    await expect(name).toBeVisible();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await name.fill('Первое значение');
    await name.press('Tab');
    await name.fill('Незавершённый ввод');
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'Выбор элементов — запись на паузе',
            exact: true,
        }),
    ).toBeVisible();
    const journal = page.getByRole('list', {name: 'Записанные действия'});

    await expect(journal.getByRole('listitem')).toHaveCount(1);
    const dialog = page.getByRole('dialog', {name: 'Выбор элементов группы'});
    const next = page.getByRole('button', {name: 'Продолжить', exact: true});

    await next.evaluate((element) => element.scrollIntoView({block: 'center'}));
    const box = (await next.boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await dialog
        .getByRole('textbox', {name: 'Название группы вариантов', exact: true})
        .fill('Кнопки экрана');
    await dialog.getByRole('button', {name: 'Готово', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(
        page.getByRole('heading', {name: 'Идёт запись', exact: true}),
    ).toBeVisible();
    await expect(name).toBeFocused();
    await name.press('Tab');
    await expect(journal.getByRole('listitem')).toHaveCount(1);
    await expect(page.locator('procedure-mf').getByRole('alert')).toHaveCount(0);
    await name.fill('Второе значение');
    await name.press('Tab');
    await expect(journal.getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', {name: 'Изменить Кнопки экрана', exact: true}).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
        page.getByRole('heading', {name: 'Идёт запись', exact: true}),
    ).toBeVisible();
    const email = page.getByRole('textbox', {name: 'Рабочая почта', exact: true});

    await email.fill('anna@example.test');
    await email.press('Tab');
    await expect(journal.getByRole('listitem')).toHaveCount(3);
    await page.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await page.getByText('Настройки записи и диагностика', {exact: true}).click();
    const downloading = page.waitForEvent('download');

    await page.getByRole('button', {name: 'Скачать запись', exact: true}).click();
    const recording = parseRecording(
        await readFile(await (await downloading).path(), 'utf8'),
    );

    expect(recording.actions.map((action) => action.sequence)).toEqual([1, 2, 3]);
    expect(
        recording.actions.map(
            (action) =>
                'value' in action &&
                action.value.status === 'captured' &&
                action.value.raw,
        ),
    ).toEqual(['Первое значение', 'Второе значение', 'anna@example.test']);
    expect(
        recording.actions
            .slice(0, 2)
            .map((action) => 'targetId' in action && action.targetId)[0],
    ).toBe(
        recording.actions
            .slice(0, 2)
            .map((action) => 'targetId' in action && action.targetId)[1],
    );
});

test('a failed picker opening restores recording and leaving an open picker releases the paused session', async ({
    page,
}) => {
    await page.goto('/record');
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page.evaluate(() => {
        HTMLElement.prototype.showPopover = () => {
            throw new Error('Popover failed');
        };
    });
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    await expect(page.getByRole('alert')).toContainText('Не удалось открыть выбор');
    await expect(
        page.getByRole('heading', {name: 'Идёт запись', exact: true}),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goto('/learn');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/record');
    await expect(
        page.getByRole('button', {name: 'Начать запись', exact: true}),
    ).toBeEnabled();
});
