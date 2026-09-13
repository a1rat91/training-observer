import {expect, type Page, test} from '@playwright/test';

import {
    ELEMENT_GROUPS_KEY,
    parseElementGroups,
} from '../projects/demo/src/authoring/element-groups';

test.use({hasTouch: true});

async function fixture(page: Page): Promise<void> {
    await page.goto('/record');
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page.locator('procedure-search-mf').evaluate((root) => {
        const form = document.createElement('form');

        form.setAttribute('aria-label', 'Generic fixture');
        form.innerHTML =
            '<div><button type="button"><span>Alpha choice</span></button></div><section><button type="submit">Beta choice</button><label><input type="radio" name="choice">Radio choice</label><label><input type="checkbox">Checkbox choice</label></section>';
        root.prepend(form);
        (window as unknown as {pickerEvents: string[]}).pickerEvents = [];

        for (const type of [
            'pointerdown',
            'mousedown',
            'click',
            'input',
            'change',
            'submit',
        ]) {
            form.addEventListener(type, (event) => {
                (window as unknown as {pickerEvents: string[]}).pickerEvents.push(type);

                if (type === 'submit') {
                    event.preventDefault();
                }
            });
        }
    });
}

async function point(
    page: Page,
    name: string,
    role: 'button' | 'checkbox' | 'radio' = 'button',
): Promise<void> {
    const target = page.getByRole(role, {name, exact: true});

    await target.evaluate((element) => element.scrollIntoView({block: 'center'}));
    const box = await target.boundingBox();

    if (!box) {
        throw new Error('Fixture target is missing');
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('generic controls are grouped through a shield, survive reload and remain inactive until selection ends', async ({
    page,
}) => {
    await fixture(page);
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    const dialog = page.getByRole('dialog', {name: 'Выбор элементов группы'});

    await expect(dialog).toBeVisible();
    await point(page, 'Alpha choice');
    await point(page, 'Beta choice');
    await point(page, 'Radio choice', 'radio');
    await point(page, 'Checkbox choice', 'checkbox');
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    await expect(
        page.getByRole('radio', {name: 'Radio choice', exact: true}),
    ).not.toBeChecked();
    await expect(
        page.getByRole('checkbox', {name: 'Checkbox choice', exact: true}),
    ).not.toBeChecked();
    expect(
        await page.evaluate(
            () => (window as unknown as {pickerEvents: string[]}).pickerEvents,
        ),
    ).toEqual([]);
    await point(page, 'Alpha choice');
    await expect(dialog.getByRole('listitem')).toHaveCount(3);
    await dialog
        .getByRole('textbox', {name: 'Название группы вариантов'})
        .fill('My choices');
    await page.screenshot({path: test.info().outputPath('picker.png'), fullPage: true});
    await dialog.getByRole('button', {name: 'Готово', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', {name: 'Beta choice', exact: true}).click();
    expect(
        await page.evaluate(
            () => (window as unknown as {pickerEvents: string[]}).pickerEvents,
        ),
    ).toContain('submit');
    await page.reload();
    await page.getByText('Группы вариантов', {exact: true}).click();
    await expect(
        page.getByRole('button', {name: 'Изменить My choices', exact: true}),
    ).toBeVisible();
    await page.getByRole('button', {name: 'Изменить My choices', exact: true}).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(3);
    await expect(
        dialog.getByRole('button', {name: 'Готово', exact: true}),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('keyboard stays in the picker; Escape cancels and restores focus without saving', async ({
    page,
}) => {
    await fixture(page);
    const start = page.getByRole('button', {
        name: 'Создать группу вариантов',
        exact: true,
    });

    await start.focus();
    await start.press('Enter');
    await page
        .getByRole('button', {name: 'Beta choice', exact: true})
        .evaluate((element: HTMLElement) => element.focus());
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');

    for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Tab');
    }

    expect(
        await page.evaluate(
            () => !!document.activeElement?.closest('[aria-label="Настройки группы"]'),
        ),
    ).toBe(true);
    expect(
        await page.evaluate(
            () => (window as unknown as {pickerEvents: string[]}).pickerEvents,
        ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(start).toBeFocused();
    expect(
        await page.evaluate((key) => localStorage.getItem(key), ELEMENT_GROUPS_KEY),
    ).toBeNull();
});

test('remount invalidates selection while the recording is paused for the picker', async ({
    page,
}) => {
    await fixture(page);
    const start = page.getByRole('button', {
        name: 'Создать группу вариантов',
        exact: true,
    });

    await page.getByRole('button', {name: 'Начать запись', exact: true}).click();
    await expect(start).toBeEnabled();
    await start.click();
    await point(page, 'Alpha choice');
    await page
        .getByRole('button', {name: 'Alpha choice', exact: true})
        .evaluate((element) => element.replaceWith(element.cloneNode(true)));
    const dialog = page.getByRole('dialog', {name: 'Выбор элементов группы'});

    await expect(dialog.getByRole('alert')).toContainText('Элемент изменился');
    await expect(
        dialog.getByRole('button', {name: 'Готово', exact: true}),
    ).toBeDisabled();
    await dialog.getByRole('button', {name: 'Убрать Alpha choice', exact: true}).click();
    await point(page, 'Alpha choice');
    await dialog.getByRole('button', {name: 'Готово', exact: true}).click();
    await expect(page.getByRole('list', {name: 'Записанные действия'})).toContainText(
        'Пока нет действий',
    );
});

test('touch selection and highlighting follow resize and scroll; changed labels invalidate the target', async ({
    page,
}) => {
    await fixture(page);
    await page.getByRole('button', {name: 'Создать группу вариантов', exact: true}).tap();
    await page.setViewportSize({width: 1200, height: 900});
    const target = page.getByRole('button', {name: 'Alpha choice', exact: true});

    await target.evaluate((element) => element.scrollIntoView({block: 'center'}));
    const box = (await target.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.outline')).toBeVisible();
    const outline = (await page.locator('.outline').boundingBox())!;

    expect(Math.abs(outline.y - box.y)).toBeLessThan(1);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const dialog = page.getByRole('dialog', {name: 'Выбор элементов группы'});

    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    expect(
        await page.evaluate(
            () => (window as unknown as {pickerEvents: string[]}).pickerEvents,
        ),
    ).toEqual([]);
    await target.evaluate((element) => {
        element.textContent = 'Changed choice';
    });
    await expect(dialog.getByRole('alert')).toContainText('Элемент изменился');
    await dialog.getByRole('button', {name: 'Отмена', exact: true}).click();
});

test('a Taiga combobox is selectable without opening its dropdown', async ({page}) => {
    await page.goto('/record');
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    const box = (await page
        .getByRole('combobox', {name: 'Поиск процедуры', exact: true})
        .boundingBox())!;

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const dialog = page.getByRole('dialog', {name: 'Выбор элементов группы'});

    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Готово', exact: true}).click();
});

test('invalid saved group documents are rejected and not overwritten', async ({page}) => {
    expect(() =>
        parseElementGroups('{"kind":"training-element-groups","version":2,"groups":[]}'),
    ).toThrow();
    expect(() =>
        parseElementGroups(
            '{"kind":"training-element-groups","version":1,"groups":[],"unknown":true}',
        ),
    ).toThrow();
    await page.goto('/record');
    await page.evaluate(
        (key) => localStorage.setItem(key, 'broken-document'),
        ELEMENT_GROUPS_KEY,
    );
    await page.reload();
    await page.getByText('Группы вариантов', {exact: true}).click();
    await page
        .getByRole('button', {name: 'Создать группу вариантов', exact: true})
        .click();
    await expect(page.getByRole('dialog', {name: 'Выбор элементов группы'})).toHaveCount(
        0,
    );
    expect(
        await page.evaluate((key) => localStorage.getItem(key), ELEMENT_GROUPS_KEY),
    ).toBe('broken-document');
});
