import {expect, test} from '@playwright/test';

test('admin shows available commands by phase and distinguishes feedback drafts from training screens', async ({
    page,
}) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', {name: 'Панель записи'});

    await expect(
        page.getByText('После создания черновика раскройте «Обратная связь и варианты»', {
            exact: false,
        }),
    ).toBeVisible();
    await expect(
        panel.getByRole('button', {name: 'Начать запись', exact: true}),
    ).toBeEnabled();
    await expect(
        panel.getByRole('button', {name: 'Остановить запись', exact: true}),
    ).toHaveCount(0);
    await expect(
        panel.getByRole('button', {name: 'Создать группу вариантов', exact: true}),
    ).toBeHidden();
    await page.screenshot({
        path: test.info().outputPath('admin-before.png'),
        fullPage: true,
    });
    await panel.getByText('Настройки записи и диагностика', {exact: true}).click();
    await panel.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await expect(
        panel.getByRole('button', {name: 'Начать запись', exact: true}),
    ).toHaveCount(0);
    await expect(
        panel.getByRole('button', {name: 'Остановить запись', exact: true}),
    ).toBeEnabled();
    await expect(panel.locator('button:disabled:visible')).toHaveCount(0);
    await expect(
        panel.getByRole('checkbox', {name: 'Сохранять значения полей'}),
    ).toHaveCount(0);
    await expect(
        panel.getByText('Редактирование заданий появится после остановки.', {
            exact: false,
        }),
    ).toBeVisible();
    await page.screenshot({
        path: test.info().outputPath('admin-recording.png'),
        fullPage: true,
    });
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Анна');
    await page.getByRole('textbox', {name: 'ФИО', exact: true}).press('Tab');
    await panel.getByRole('button', {name: 'Остановить запись', exact: true}).click();
    await expect(
        panel.getByRole('button', {name: 'Удалить действие 1', exact: true}),
    ).toBeVisible();
    expect(
        await panel
            .getByRole('list', {name: 'Записанные действия'})
            .evaluate(
                (element) =>
                    !!(
                        element.compareDocumentPosition(
                            document.querySelector('scenario-editor')!,
                        ) & Node.DOCUMENT_POSITION_FOLLOWING
                    ),
            ),
    ).toBe(true);
    await panel.getByText('Группы вариантов', {exact: true}).click();
    await expect(
        panel.getByText('Чтобы включить его в тренировку, привяжите группу к заданию', {
            exact: false,
        }),
    ).toBeVisible();
    await expect(
        panel.getByRole('button', {name: 'Создать группу вариантов', exact: true}),
    ).toBeEnabled();
    await page.screenshot({
        path: test.info().outputPath('admin-editing.png'),
        fullPage: true,
    });
});
