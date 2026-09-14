import { expect, test } from '@playwright/test';

const hint = {
    kind: 'textbox',
    label: 'Фамилия',
    id: 'surname',
    tagName: 'input',
    role: 'textbox',
    context: [],
};
const recording = {
    kind: 'training-state-recording',
    version: 1,
    complete: true,
    events: [
        { sequence: 1, kind: 'screen', visit: 1, screenKey: 'application-profile' },
        {
            sequence: 2,
            kind: 'value',
            visit: 1,
            screenKey: 'application-profile',
            field: hint,
            value: 'Первое',
        },
        {
            sequence: 3,
            kind: 'value',
            visit: 1,
            screenKey: 'application-profile',
            field: hint,
            value: 'Второе',
        },
        { sequence: 4, kind: 'screen', visit: 2, screenKey: 'application-details' },
    ],
};
async function seed(page: import('@playwright/test').Page) {
    await page.goto('/record');
    await page.evaluate(
        (value) => localStorage.setItem('training-observer.state-recording.v1', JSON.stringify(value)),
        recording,
    );
    await page.reload();
    await page.getByText('Настроить тренировку', { exact: true }).click();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
}

test('delete and undo rebuild source values while preserving authored feedback and published scenario', async ({
    page,
}) => {
    await seed(page);
    const expected = page.getByRole('textbox', { name: 'Ожидание: Фамилия', exact: true });
    const message = page.getByRole('textbox', { name: 'Ошибка: Фамилия', exact: true });
    const publish = page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true });
    await expect(expected).toHaveValue('Второе');
    await message.fill('Моё сообщение');
    await publish.click();
    const published = await page.evaluate(() => localStorage.getItem('training-observer.scenario.v1'));
    await page.getByRole('button', { name: 'Удалить строку 3', exact: true }).click();
    await expect(publish).toBeDisabled();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
    await expect(expected).toHaveValue('Первое');
    await expect(message).toHaveValue('Моё сообщение');
    expect(await page.evaluate(() => localStorage.getItem('training-observer.scenario.v1'))).toBe(published);
    await expected.fill('Авторское ожидание');
    await page.getByRole('button', { name: 'Отменить удаление', exact: true }).click();
    await expect(publish).toBeDisabled();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
    await expect(expected).toHaveValue('Авторское ожидание');
    await expect(message).toHaveValue('Моё сообщение');
    await expect(page.getByRole('region', { name: 'Журнал записи' }).getByRole('listitem')).toHaveCount(4);
});

test('deleting a screen boundary blocks compilation; undo repairs it; edited journal survives reload', async ({
    page,
}) => {
    await seed(page);
    await page.getByRole('button', { name: 'Удалить строку 1', exact: true }).click();
    await expect(page.getByText(/отсутствует граница экрана/)).toBeVisible();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Отменить удаление', exact: true }).click();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Удалить строку 3', exact: true }).click();
    await page.reload();
    const journal = page.getByRole('region', { name: 'Журнал записи' });
    await expect(journal.getByRole('listitem')).toHaveCount(3);
    await expect(journal).not.toContainText('Второе');
    await expect(page.getByRole('button', { name: 'Отменить удаление', exact: true })).toBeDisabled();
});

test('reload cannot publish a scenario linked to an older journal', async ({ page }) => {
    await seed(page);
    await page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить строку 3', exact: true }).click();
    await page.reload();
    await page.getByText('Настроить тренировку', { exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Создать ожидания из записи', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Ожидание: Фамилия', exact: true })).toHaveValue('Первое');
    await expect(
        page.getByRole('button', { name: 'Сохранить сценарий для ученика', exact: true }),
    ).toBeEnabled();
});
