import {expect, test} from '@playwright/test';

test('Angular registry exposes missing, mounted, duplicated and remounted hosts', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/spike/record');
    await page.getByText('Границы микрофронтов', {exact: true}).click();
    const registry = page.locator('details[aria-label="Границы микрофронтов"]');
    const player = registry.getByRole('listitem').filter({hasText: 'procedure-player'});
    const directory = registry.getByRole('listitem').filter({hasText: 'directory'});

    await expect(player).toContainText('missing');
    await expect(directory).toContainText('resolved');
    await page.getByRole('combobox', {name: 'Поиск процедуры', exact: true}).click();
    await page.getByRole('option', {name: 'Заявка на обучение', exact: true}).click();
    await expect(player).toContainText('resolved');
    const mounted = await player.innerText();

    await page.getByText('Эксперименты с микрофронтами', {exact: true}).click();
    await page.getByRole('button', {name: 'Пересоздать плеер'}).click();
    await expect(player).toContainText('resolved');
    await expect(player).not.toHaveText(mounted);
    await page.getByRole('button', {name: 'Добавить второй справочник'}).click();
    await expect(directory).toContainText('ambiguous');
    await expect(directory).toContainText('экземпляров: 2');
    await page.getByRole('button', {name: 'Убрать второй справочник'}).click();
    await expect(directory).toContainText('resolved');
    await page.getByRole('button', {name: 'Скрыть плеер'}).click();
    await expect(player).toContainText('missing');
    await page.getByRole('button', {name: 'Показать плеер'}).click();
    await expect(player).toContainText('resolved');
    expect(errors).toEqual([]);
});
