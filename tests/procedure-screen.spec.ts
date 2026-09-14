import { expect, test } from '@playwright/test';

test('input confirmation stays unchanged while editing and accepts clearing only after blur', async ({
    page,
}) => {
    await page.goto('/record');
    const card = page.getByRole('article', { name: 'Input · Фамилия', exact: true });
    const field = page.locator('#surname');
    await field.fill('Первое');
    // Longer than both batching and property polling: neither must confirm an active edit.
    await page.waitForTimeout(650);
    await expect(card).toContainText('Ожидает выхода из поля');
    await field.press('Tab');
    await expect(card).toContainText('Первое');
    await field.fill('Второе');
    await page.waitForTimeout(650);
    await expect(card).toContainText('Первое');
    await expect(card).not.toContainText('Второе');
    await field.press('Tab');
    await expect(card).toContainText('Второе');
    await field.fill('');
    await expect(card).toContainText('Второе');
    await field.press('Tab');
    await expect(card).toContainText('Пусто');
});

test('failed navigation can retry the requested screen without inventing a visit', async ({ page }) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', { name: 'Распознанный экран' });
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.locator('#surname').fill('Смирнова');
    await page.route('**/assets/procedure/screens.json', (route) => route.fulfill({ status: 500 }), {
        times: 1,
    });
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить экран');
    await expect(panel).toContainText('Последнее готовое посещение: 1');
    await page.getByRole('button', { name: 'Повторить загрузку' }).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
});

test('compact Taiga form exposes snapshot cards and real forward/back/wrong transitions', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/record');
    const form = page.getByRole('region', { name: 'Экран процедуры', exact: true });
    const panel = page.getByRole('complementary', { name: 'Распознанный экран' });
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await expect(panel.getByRole('article')).toHaveCount(6);
    await expect(form.getByRole('button', { name: 'Назад', exact: true })).toBeDisabled();
    await page.locator('#surname').fill('Смирнова');
    await expect(panel.getByRole('article', { name: 'Input · Фамилия', exact: true })).toContainText(
        'Ожидает выхода из поля',
    );
    await page.locator('#surname').press('Tab');
    await expect(panel.getByRole('article', { name: 'Input · Фамилия', exact: true })).toContainText(
        'Смирнова',
    );
    await page.locator('#department').click();
    await page.getByRole('option', { name: 'Поддержка', exact: true }).click();
    await expect(panel.getByRole('article', { name: 'Select · Подразделение', exact: true })).toContainText(
        'Ожидает выхода из поля',
    );
    await page.locator('#surname').focus();
    await expect(panel.getByRole('article', { name: 'Select · Подразделение', exact: true })).toContainText(
        'Поддержка',
    );
    await page.locator('#employee').fill('Анна');
    await page.getByRole('option', { name: 'Анна Смирнова', exact: true }).click();
    await expect(panel.getByRole('article', { name: 'ComboBox · Сотрудник', exact: true })).toContainText(
        'Ожидает выхода из поля',
    );
    await page.locator('#surname').focus();
    await expect(panel.getByRole('article', { name: 'ComboBox · Сотрудник', exact: true })).toContainText(
        'Анна Смирнова',
    );
    await form.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await expect(panel.getByRole('article', { name: 'Input · Фамилия', exact: true })).toHaveCount(0);
    await form.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
    await expect(page.locator('#department')).toHaveValue('Поддержка');
    await expect(page.locator('#employee')).toHaveValue('Анна Смирнова');
    await expect(panel).toContainText('Последнее готовое посещение: 3');
    await form.getByRole('button', { name: 'Неправильный переход', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('application-other');
    await form.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
    await form.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await form.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('application-review');
    await form.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('application-done');
    await expect(form.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
});

test('snapshot detects duplicate and missing roots and treats a remount as the same visit', async ({
    page,
}) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', { name: 'Распознанный экран' });
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.locator('section[aria-label="Экран процедуры"]').evaluate((element) => {
        const duplicate = element.cloneNode(true) as HTMLElement;
        duplicate.id = 'another-profile';
        element.after(duplicate);
    });
    await expect(panel.getByRole('status')).toContainText('Найдено несколько экранов');
    await page.locator('#another-profile').evaluate((element) => element.remove());
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page
        .locator('#application-profile')
        .evaluate((element) => element.replaceWith(element.cloneNode(true)));
    await expect(panel).toContainText('Последнее готовое посещение: 1');
    await page.locator('#application-profile').evaluate((element) => element.remove());
    await expect(panel.getByRole('status')).toContainText('Экран недоступен');
    await expect(panel.getByRole('article')).toHaveCount(0);
});

test('HTTP loading is visible to the observer and inspector does not observe itself', async ({ page }) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', { name: 'Распознанный экран' });
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.route('**/assets/procedure/screens.json', async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Загрузка');
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await expect(panel.getByRole('article').filter({ hasText: 'Показать в форме' })).toHaveCount(9);
    await page.screenshot({ path: test.info().outputPath('screen-cards.png'), fullPage: true });
});
