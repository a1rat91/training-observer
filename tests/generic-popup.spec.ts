import {expect, type Page, test} from '@playwright/test';

import {type ControlSnapshot} from '../libs/training-observer/src';

test.use({trace: 'off'});

async function control(page: Page, id: string): Promise<ControlSnapshot | undefined> {
    const controls: ControlSnapshot[] = JSON.parse(
        (await page.getByTestId('controls-json').textContent()) ?? '[]',
    );

    return controls.find((item) => item.locatorHints.id === id);
}

test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page.getByText('Обычные поля с dropdown', {exact: true}).click();
});

test('real generic TuiInput resolves its popup without claiming selection semantics', async ({
    page,
}) => {
    await page.locator('#generic-hint').fill('Новый запрос');
    await expect(page.locator('tui-dropdown')).toContainText('Введите несколько слов');
    await expect
        .poll(async () => control(page, 'generic-hint'))
        .toMatchObject({
            kind: 'textbox',
            source: 'taiga-ui',
            state: {value: 'Новый запрос'},
            popup: {status: 'open', relation: 'aria-controls'},
        });
    expect((await control(page, 'generic-hint'))?.choice).toBeUndefined();
    expect((await control(page, 'generic-hint'))!.popup!.rootNodeIds).toHaveLength(1);
});

test('a generic input without an explicit link remains present with an unresolved popup', async ({
    page,
}) => {
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<input id="unlinked-input" tuiInput role="combobox" value="Запрос">',
            ),
        );
    await expect
        .poll(async () => control(page, 'unlinked-input'))
        .toMatchObject({
            kind: 'textbox',
            state: {value: 'Запрос'},
            popup: {status: 'unresolved', relation: 'missing', rootNodeIds: []},
        });
});

test('real dialog popup is captured outside the scope and reconciles silent input changes', async ({
    page,
}) => {
    await page.locator('#generic-dialog').fill('Запрос');
    await expect(page.locator('tui-dropdown')).toHaveAttribute('role', 'dialog');
    await expect
        .poll(async () => (await control(page, 'generic-dialog'))?.popup?.status)
        .toBe('open');
    await expect(page.getByTestId('observed-page').locator('#popup-detail')).toHaveCount(
        0,
    );
    await expect
        .poll(async () => (await control(page, 'popup-detail'))?.state.value)
        .toBe('Начальное');
    // No input/change event and no attribute mutation: only property reconciliation can see this.
    await page.locator('#popup-detail').evaluate((input: HTMLInputElement) => {
        input.value = 'Без события';
    });
    await expect
        .poll(async () => (await control(page, 'popup-detail'))?.state.value)
        .toBe('Без события');
    await page.getByRole('button', {name: 'Готово', exact: true}).click();
    await expect
        .poll(async () => (await control(page, 'generic-dialog'))?.popup?.status)
        .toBe('closed');
    await expect.poll(async () => control(page, 'popup-detail')).toBeUndefined();
    await page.locator('#generic-hint').focus();
    await page.locator('#generic-dialog').focus();
    await expect
        .poll(async () => (await control(page, 'generic-dialog'))?.popup?.status)
        .toBe('open');
    await page.locator('#popup-detail').evaluate((input: HTMLInputElement) => {
        input.value = 'После открытия';
    });
    await expect
        .poll(async () => (await control(page, 'popup-detail'))?.state.value)
        .toBe('После открытия');
});

test('an explicit link on the textfield host resolves a non-list popup', async ({
    page,
}) => {
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<tui-textfield aria-expanded="true" aria-haspopup="dialog" aria-controls="host-popup"><input id="host-input" tuiInput role="combobox"></tui-textfield>',
            ),
        );
    await page.evaluate(() =>
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="host-popup" role="dialog"><button>Внешнее действие</button></div>',
        ),
    );
    await expect
        .poll(async () => (await control(page, 'host-input'))?.popup)
        .toMatchObject({
            status: 'open',
            relation: 'aria-controls',
            referencedIds: ['host-popup'],
            text: 'Внешнее действие',
        });
});

test('excluded portal properties do not trigger scans', async ({page}) => {
    await page.locator('#generic-dialog').focus();
    await expect
        .poll(async () => (await control(page, 'generic-dialog'))?.popup?.status)
        .toBe('open');
    await page
        .locator('tui-dropdown')
        .evaluate((popup) => popup.setAttribute('data-training-observer-ignore', ''));
    await expect
        .poll(async () => (await control(page, 'generic-dialog'))?.popup?.status)
        .toBe('unresolved');
    await page.waitForTimeout(600);
    const count = await page.getByTestId('scan-count').textContent();

    await page.locator('#popup-detail').evaluate((input: HTMLInputElement) => {
        input.value = 'Исключён';
    });
    await page.waitForTimeout(1200);
    expect(await page.getByTestId('scan-count').textContent()).toBe(count);
});

test('native option label follows the visible label attribute', async ({page}) => {
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<select id="label-probe"><option value="key" label="Отображаемое имя" selected>Внутренний текст</option></select>',
            ),
        );
    await expect
        .poll(async () => (await control(page, 'label-probe'))?.choice?.displayValue)
        .toBe('Отображаемое имя');
    expect((await control(page, 'label-probe'))?.state.value).toBe('key');
});
