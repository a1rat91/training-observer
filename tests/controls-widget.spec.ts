import {expect, test} from '@playwright/test';

test('floating widget shares live values, blur confirmations and block transitions with the session', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const surname = widget.locator('[data-control-id="surname"]');

    await expect(widget.getByRole('heading')).toHaveText('Контролы · 6');
    await expect(widget).toBeVisible();
    expect(await widget.boundingBox()).toMatchObject({width: 200, height: 300});
    await page.locator('#surname').fill('Первое значение');
    await expect(surname).toContainText('Сейчас: Первое значение');
    await expect(surname).toContainText('Ожидает выхода из поля');
    await page.locator('#surname').press('Tab');
    await expect(surname).toContainText('После blur: Первое значение');
    await page.locator('#surname').fill('Второе значение');
    await expect(surname).toContainText('Сейчас: Второе значение');
    await expect(surname).toContainText('После blur: Первое значение');
    await page.getByRole('button', {name: 'Далее', exact: true}).click();
    await expect(widget.getByRole('heading')).toHaveText('Контролы · 9');
    await expect(surname).toHaveCount(0);
    await expect(widget.locator('[data-control-id="goal"]')).toContainText(
        'Цель обучения',
    );
});

test('TuiPan moves the widget by its header and the portal remains fixed during scrolling', async ({
    page,
}) => {
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const handle = widget.getByTitle('Перетащить виджет');

    await expect(handle).toBeVisible();
    const before = (await widget.boundingBox())!;
    const header = (await handle.boundingBox())!;
    const start = {x: header.x + header.width / 2, y: header.y + header.height / 2};

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 220, start.y - 140, {steps: 15});
    await page.mouse.up();
    await expect
        .poll(async () => (await widget.boundingBox())!.x)
        .toBeLessThan(before.x - 150);
    const moved = (await widget.boundingBox())!;

    expect(moved.y).toBeLessThan(before.y - 90);
    await page.locator('#surname').focus();
    await page.locator('#surname').press('Escape');
    await expect(widget).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect
        .poll(async () => (await widget.boundingBox())!.y)
        .toBeCloseTo(moved.y, 0);
    expect(await widget.boundingBox()).toMatchObject({width: 200, height: 300});
});

test('widget is excluded from observation and is removed with its route owner', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/record');
    const widget = page.getByRole('region', {name: 'Текущие контролы', exact: true});
    const inspector = page.getByRole('complementary', {name: 'Распознанный экран'});

    await expect(widget.getByRole('heading')).toHaveText('Контролы · 6');
    const snapshot = await inspector.locator('pre').textContent();

    expect(snapshot).not.toContain('Текущие контролы');
    expect(snapshot).not.toContain('app-controls-widget');
    await page.getByRole('link', {name: 'Тренировка', exact: true}).click();
    await expect(widget).toHaveCount(0);
    await page.getByRole('link', {name: 'Запись', exact: true}).click();
    await expect(widget).toHaveCount(1);
    await expect(widget.getByRole('heading')).toHaveText('Контролы · 6');
    expect(errors).toEqual([]);
});
