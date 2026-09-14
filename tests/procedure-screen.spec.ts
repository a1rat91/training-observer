import {expect, test} from '@playwright/test';

test('failed navigation can retry the requested screen without inventing a visit', async ({page}) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', {name: 'Распознанный экран'});
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.locator('#surname').fill('Смирнова');
    await page.route('**/assets/procedure/screens.json', (route) => route.fulfill({status: 500}), {times: 1});
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить экран');
    await expect(panel).toContainText('Последнее готовое посещение: 1');
    await page.getByRole('button', {name: 'Повторить загрузку'}).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await page.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
});

test('large Taiga form exposes snapshot cards and real forward/back/wrong transitions', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/record');
    const form = page.getByRole('region', {name: 'Экран процедуры', exact: true});
    const panel = page.getByRole('complementary', {name: 'Распознанный экран'});
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await expect.poll(() => panel.getByRole('article').count()).toBeGreaterThanOrEqual(23);
    await expect(form.getByRole('button', {name: 'Назад', exact: true})).toBeDisabled();
    await page.locator('#surname').fill('Смирнова');
    await page.locator('#surname').press('Tab');
    await expect(panel.getByRole('article', {name: 'Input · Фамилия', exact: true})).toContainText('Смирнова');
    await page.locator('#department').click();
    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await expect(panel.getByRole('article', {name: 'Select · Подразделение', exact: true})).toContainText('Поддержка');
    await page.locator('#employee').fill('Анна');
    await page.getByRole('option', {name: 'Анна Смирнова', exact: true}).click();
    await expect(panel.getByRole('article', {name: 'ComboBox · Сотрудник', exact: true})).toContainText('Анна Смирнова');
    await form.getByRole('checkbox', {name: 'Сертификат', exact: true}).check();
    await form.getByRole('radio', {name: 'Очно', exact: true}).check();
    await expect(panel.getByRole('article', {name: 'Checkbox · Сертификат', exact: true})).toContainText('Включён');
    await form.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await expect(panel.getByRole('article', {name: 'Input · Фамилия', exact: true})).toHaveCount(0);
    await form.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
    await expect(form.getByRole('radio', {name: 'Очно', exact: true})).toBeChecked();
    await expect(panel).toContainText('Последнее готовое посещение: 3');
    await form.getByRole('button', {name: 'Неправильный переход', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('application-other');
    await form.getByRole('button', {name: 'Назад', exact: true}).click();
    await expect(page.locator('#surname')).toHaveValue('Смирнова');
    await form.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('application-details');
    await form.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('application-review');
    await form.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('application-done');
    await expect(form.getByRole('button', {name: 'Далее', exact: true})).toBeDisabled();
    expect(errors).toEqual([]);
});

test('snapshot detects duplicate and missing roots and treats a remount as the same visit', async ({page}) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', {name: 'Распознанный экран'});
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.locator('section[aria-label="Экран процедуры"]').evaluate((element) => {
        const duplicate = element.cloneNode(true) as HTMLElement;
        duplicate.id = 'another-profile';
        element.after(duplicate);
    });
    await expect(panel.getByRole('status')).toContainText('Найдено несколько экранов');
    await page.locator('#another-profile').evaluate((element) => element.remove());
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.locator('#application-profile').evaluate((element) => element.replaceWith(element.cloneNode(true)));
    await expect(panel).toContainText('Последнее готовое посещение: 1');
    await page.locator('#application-profile').evaluate((element) => element.remove());
    await expect(panel.getByRole('status')).toContainText('Экран недоступен');
    await expect(panel.getByRole('article')).toHaveCount(0);
});

test('HTTP loading is visible to the observer and inspector does not observe itself', async ({page}) => {
    await page.goto('/record');
    const panel = page.getByRole('complementary', {name: 'Распознанный экран'});
    await expect(panel.getByRole('status')).toContainText('application-profile');
    await page.route('**/assets/procedure/screens.json', async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.fulfill({response});
    });
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('Загрузка');
    await expect(panel.getByRole('status')).toContainText('application-details');
    await expect(panel).toContainText('Последнее готовое посещение: 2');
    await expect(panel.getByRole('article').filter({hasText: 'Показать в форме'})).toHaveCount(9);
    await page.screenshot({path: test.info().outputPath('screen-cards.png'), fullPage: true});
});
