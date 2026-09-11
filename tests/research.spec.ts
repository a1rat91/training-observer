import {readFile} from 'node:fs/promises';

import {expect, type Locator, test} from '@playwright/test';

test('research route exposes Taiga controls, live inspection, replay and saved results', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/spike/research');
    const research = page.locator('research-page');
    const fixture = research.locator('research-fixture');
    const panel = research.getByRole('complementary', {name: 'Панель исследования'});

    await expect(
        research.getByRole('heading', {name: 'Исследование locators', exact: true}),
    ).toBeVisible();
    await expect(research.getByText(/504 сравнений/)).toBeVisible();
    await fixture.getByRole('textbox', {name: 'ФИО', exact: true}).click();
    await expect(
        panel.getByText('Locators сгенерированы в текущем DOM.', {exact: false}),
    ).toBeVisible();
    await expect(
        panel
            .locator('details')
            .filter({has: page.locator('summary', {hasText: 'dom-to-locator'})}),
    ).toContainText('ФИО');
    await panel.getByRole('button', {name: 'Проверить CSS', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('correct');
    await panel.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await expect(
        panel.getByRole('button', {name: 'Остановить', exact: true}),
    ).toBeEnabled();
    await fixture.getByRole('textbox', {name: 'ФИО', exact: true}).fill('Ирина');
    await fixture.getByRole('combobox', {name: 'Курс', exact: true}).click();
    await page.getByRole('option', {name: 'Angular', exact: true}).click();
    await expect(fixture.getByRole('combobox', {name: 'Курс', exact: true})).toHaveValue(
        'Angular',
    );
    await panel.getByRole('button', {name: 'Остановить', exact: true}).click();
    await expect(panel.getByText(/rrweb: [1-9]\d* событий/)).toBeVisible();
    const downloadPromise = page.waitForEvent('download');

    await research.getByRole('button', {name: 'Скачать полный JSON-отчёт'}).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('library-probes.json');
    const report = JSON.parse(await readFile(await download.path(), 'utf8'));

    expect(report.rows).toHaveLength(504);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: 'dist/research-route.png', fullPage: true});
    // A real SPA navigation exercises DestroyRef cleanup, then remounts the route.
    await page.getByRole('button', {name: 'Examples', exact: true}).click();
    await page.getByRole('link', {name: 'Controls example', exact: true}).click();
    await expect(research).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('research-page')).toBeVisible();
    expect(errors).toEqual([]);
});

test('records actual field values, silent property updates and stop/restart boundaries', async ({
    page,
}) => {
    await page.goto('/spike/research');
    const fixture = page.locator('research-fixture');
    const panel = page.getByRole('complementary', {name: 'Панель исследования'});
    const journal = panel.getByRole('list', {name: 'Журнал значений'});
    const entries = journal.getByRole('listitem');
    const valueEntry = (name: string, value: string, source: string): Locator =>
        entries
            .filter({has: page.locator('strong', {hasText: new RegExp(`^${name}$`)})})
            .filter({has: page.locator('code', {hasText: value})})
            .filter({has: page.locator('small', {hasText: source})});

    await panel.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await expect(valueEntry('Согласие', 'false', 'snapshot')).toHaveCount(1);
    await expect(valueEntry('Нужен наставник', 'true', 'snapshot')).toHaveCount(1);
    const employee = fixture.getByRole('textbox', {name: 'ФИО', exact: true});

    await employee.fill('Ирина');
    await expect(valueEntry('ФИО', '"Ирина"', 'native')).toHaveCount(1);
    await expect(valueEntry('ФИО', '"Ирина"', 'rrweb')).toHaveCount(1);
    // No DOM event: exercise rrweb's property observation, including equal-length replacements.
    await employee.evaluate((element: HTMLInputElement) => {
        element.value = 'Антон';
    });
    await expect(valueEntry('ФИО', '"Антон"', 'rrweb')).toHaveCount(1);
    await expect(valueEntry('ФИО', '"Антон"', 'native')).toHaveCount(0);
    await employee.fill('');
    await expect(valueEntry('ФИО', '""', 'rrweb')).toHaveCount(1);
    await fixture
        .getByRole('textbox', {name: 'Комментарий', exact: true})
        .fill('Первая строка\nВторая строка');
    await expect(valueEntry('Комментарий', 'Вторая строка', 'rrweb')).toHaveCount(1);
    await fixture.getByRole('checkbox', {name: 'Согласие', exact: true}).check();
    await expect(valueEntry('Согласие', 'true', 'rrweb')).toHaveCount(1);
    await fixture.getByRole('switch', {name: 'Нужен наставник', exact: true}).uncheck();
    await expect(valueEntry('Нужен наставник', 'false', 'rrweb')).toHaveCount(1);
    await fixture.getByRole('combobox', {name: 'Курс', exact: true}).click();
    await page.getByRole('option', {name: 'Angular', exact: true}).click();
    await expect(valueEntry('Курс', '"Angular"', 'rrweb')).toHaveCount(1);
    await expect(valueEntry('Курс', '"Angular"', 'native')).toHaveCount(0);
    await panel.getByRole('button', {name: 'Остановить', exact: true}).click();
    await employee.fill('После остановки');
    await expect(journal).not.toContainText('После остановки');
    await panel.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await expect(valueEntry('ФИО', '"После остановки"', 'snapshot')).toHaveCount(1);
    await expect(valueEntry('ФИО', '"Ирина"', 'native')).toHaveCount(0);
    await employee.fill('Новая запись');
    await expect(valueEntry('ФИО', '"Новая запись"', 'rrweb')).toHaveCount(1);
    await panel.getByRole('button', {name: 'Остановить', exact: true}).click();
});
