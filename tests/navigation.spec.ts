import {expect, test} from '@playwright/test';

test('demo menu follows lazy routes, browser history and direct links', async ({page}) => {
    await page.goto('/');
    const menu = page.getByRole('navigation', {name: 'Разделы demo'});
    await expect(page).toHaveURL(/\/controls$/);
    await expect(menu.getByRole('link', {name: 'Контролы', exact: true})).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#full-name')).toBeVisible();

    await menu.getByRole('link', {name: 'Микрофронты', exact: true}).click();
    await expect(page).toHaveURL(/\/microfrontends$/);
    await expect(menu.getByRole('link', {name: 'Микрофронты', exact: true})).toHaveAttribute('aria-current', 'page');
    await expect(menu.getByRole('link', {name: 'Контролы', exact: true})).not.toHaveAttribute('aria-current');
    await expect(page.getByTestId('mf-count')).toHaveText('3');

    await menu.getByRole('link', {name: 'Нагрузка', exact: true}).click();
    await expect(page).toHaveURL(/\/load$/);
    await expect(page.getByTestId('load-count')).toHaveText('10');
    await expect(page.getByTestId('load-controls')).toHaveText('470');
    await page.goBack();
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    await expect(menu.getByRole('link', {name: 'Микрофронты', exact: true})).toHaveAttribute('aria-current', 'page');

    await page.goto('/load?count=10');
    await expect(menu.getByRole('link', {name: 'Нагрузка', exact: true})).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('load-controls')).toHaveText('50');
});
