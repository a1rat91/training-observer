import {expect, test} from '@playwright/test';

test('demo has five pages, a recording entry point and browser history', async ({
    page,
}) => {
    await page.goto('/');
    const menu = page.locator('tui-doc-navigation nav');

    await expect(page).toHaveURL(/\/record$/);
    await expect(menu.getByRole('link')).toHaveCount(5);
    await menu.getByRole('link', {name: 'Микрофронты', exact: true}).click();
    await expect(page).toHaveURL(/\/microfrontends$/);
    await expect(page).toHaveTitle('Training Observer · Микрофронты');
    await expect(
        page.getByRole('heading', {name: 'Асинхронные микрофронты', exact: true}),
    ).toBeVisible();
    await menu.getByRole('link', {name: 'Контролы', exact: true}).click();
    await expect(page.locator('#full-name')).toBeVisible();
    await expect(page.getByTestId('async-mf-count')).toHaveCount(0);
    await menu.getByRole('link', {name: 'Тренировка', exact: true}).click();
    await expect(
        page.getByText('Сначала создайте и сохраните сценарий в админке.'),
    ).toBeVisible();
    await page.goBack();
    await expect(page.locator('#full-name')).toBeVisible();
    await expect(page).toHaveURL(/\/controls$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/microfrontends$/);
    await expect(page).toHaveTitle('Training Observer · Микрофронты');
});
