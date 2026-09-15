import {expect, test} from '@playwright/test';

test('selector inspector tracks unmarked and later mounted microfrontends', async ({
    page,
}) => {
    await page.goto('/controls?fixture=selectors');
    const root = page.locator('demo-microfrontend');

    await expect(root).toBeVisible();
    await root.evaluate((element) => {
        element.removeAttribute('data-mf');
        const input = document.createElement('input');

        input.setAttribute('aria-label', 'Поле области');
        element.append(input);
    });
    await page
        .getByRole('textbox', {name: 'Поле области', exact: true})
        .fill('Первое значение');
    await expect(page.getByTestId('controls-json')).toContainText('Первое значение');
    await root.evaluate((element) => {
        const replacement = document.createElement('demo-microfrontend');
        const input = document.createElement('input');

        input.setAttribute('aria-label', 'Новая область');
        replacement.append(input);
        element.replaceWith(replacement);
    });
    await page
        .getByRole('textbox', {name: 'Новая область', exact: true})
        .fill('После монтажа');
    await expect(page.getByTestId('controls-json')).toContainText('После монтажа');
    await expect(page.getByTestId('controls-json')).not.toContainText('Первое значение');
});
