import {expect, test} from '@playwright/test';

test('demo has three pages, a recording entry point and browser history', async ({page}) => {
    await page.goto('/');
    const menu = page.getByRole('navigation', {name: 'Разделы demo'});
    await expect(page).toHaveURL(/\/record$/);
    await expect(menu.getByRole('link')).toHaveCount(3);
    await menu.getByRole('link', {name: 'Контролы', exact: true}).click();
    await expect(page.locator('#full-name')).toBeVisible();
    await menu.getByRole('link', {name: 'Тренировка', exact: true}).click();
    await expect(page.getByText('Сначала создайте и сохраните сценарий в админке.')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#full-name')).toBeVisible();
    await expect(menu.getByRole('link', {name: 'Контролы', exact: true})).toHaveAttribute('aria-current', 'page');
});
