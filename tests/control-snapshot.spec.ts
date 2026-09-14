import { expect, test, type Page } from '@playwright/test';

import { type ControlSnapshot, type DomSnapshot } from '../libs/training-observer/src/index';

test.use({ trace: 'off' });

async function controls(page: Page): Promise<ControlSnapshot[]> {
    return JSON.parse((await page.getByTestId('controls-json').textContent()) ?? '[]') as ControlSnapshot[];
}

async function control(page: Page, id: string): Promise<ControlSnapshot | undefined> {
    return (await controls(page)).find((item) => item.locatorHints.id === id);
}

async function snapshot(page: Page): Promise<DomSnapshot> {
    return JSON.parse(await page.getByTestId('snapshot-json').innerText()) as DomSnapshot;
}

test.beforeEach(async ({ page }) => {
    await page.goto('/controls');
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение включено');
    await expect.poll(async () => (await controls(page)).length).toBeGreaterThan(0);
});

test('normalizes real Taiga UI textfield, cleaner, button and checkbox', async ({ page }) => {
    // Lazy routing may publish the first snapshot before NgModel's deferred write.
    await expect.poll(async () => (await control(page, 'full-name'))?.state.value).toBe('Алексей');
    const field = (await control(page, 'full-name'))!;
    expect(field).toMatchObject({
        kind: 'textbox',
        source: 'taiga-ui',
        label: 'Имя',
        state: { value: 'Алексей', disabled: false, redacted: false },
        locatorHints: { name: 'fullName', inputType: 'text', label: 'Имя' },
    });
    const dom = await snapshot(page);
    expect(dom.nodes[field.targetNodeId]).toMatchObject({ tagName: 'input' });
    expect(dom.nodes[field.hostNodeId]).toMatchObject({ tagName: 'tui-textfield' });
    const cleaner = Object.values(dom.nodes).find(
        (node) => node.kind === 'element' && 'tuibuttonx' in node.attributes,
    );
    expect(cleaner).toBeDefined();
    expect(field.memberNodeIds).toContain(cleaner!.id);
    expect((await controls(page)).some((item) => item.targetNodeId === cleaner!.id)).toBe(false);
    expect((await controls(page)).filter((item) => item.locatorHints.id === 'full-name')).toHaveLength(1);
    expect((await controls(page)).find((item) => item.label === 'Сохранить')).toMatchObject({
        kind: 'button',
        source: 'taiga-ui',
        state: { disabled: true },
        pointerActionable: false,
    });
    expect(await control(page, 'notifications')).toMatchObject({
        kind: 'checkbox',
        source: 'taiga-ui',
        label: 'Получать уведомления',
        state: { checked: true, indeterminate: false },
    });

    await page
        .locator('tui-textfield')
        .filter({ has: page.locator('#full-name') })
        .locator('[tuiButtonX]')
        .click();
    await expect.poll(async () => (await control(page, 'full-name'))?.state.value).toBe('');
    expect((await control(page, 'full-name'))?.id).toBe(field.id);
});

test('projects native controls with labels and search context but leaves unsupported controls in raw DOM', async ({
    page,
}) => {
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <fieldset id="billing"><legend>Платёжные данные</legend>
            <label for="native-name">Получатель</label>
            <input id="native-name" name="recipient" data-testid="recipient-field" placeholder="ФИО" value="Анна" readonly required>
            <label><input id="native-check" type="checkbox" checked>Согласие</label>
            <button id="native-button"><span>Отправить</span></button>
            <input id="native-submit" type="submit" value="Подтвердить">
            <input id="not-text" type="range"><input id="native-radio" type="radio">
        </fieldset>
    `,
        ),
    );
    await expect.poll(async () => (await control(page, 'native-name'))?.label).toBe('Получатель');
    expect(await control(page, 'native-name')).toMatchObject({
        source: 'native',
        kind: 'textbox',
        state: { value: 'Анна', readOnly: true, required: true },
        locatorHints: {
            name: 'recipient',
            testId: 'recipient-field',
            placeholder: 'ФИО',
            context: expect.arrayContaining([
                { tagName: 'fieldset', id: 'billing', label: 'Платёжные данные' },
            ]),
        },
    });
    expect(await control(page, 'native-check')).toMatchObject({
        kind: 'checkbox',
        source: 'native',
        label: 'Согласие',
    });
    expect(await control(page, 'native-button')).toMatchObject({ kind: 'button', label: 'Отправить' });
    expect(await control(page, 'native-submit')).toMatchObject({ kind: 'button', label: 'Подтвердить' });
    expect(await control(page, 'not-text')).toBeUndefined();
    expect(await control(page, 'native-radio')).toMatchObject({
        kind: 'radio',
        source: 'native',
        state: { checked: false, value: 'on' },
    });
    expect(await control(page, 'department')).toMatchObject({ kind: 'select', source: 'taiga-ui' });
    expect(
        Object.values((await snapshot(page)).nodes).some(
            (node) => node.kind === 'element' && node.attributes['id'] === 'department',
        ),
    ).toBe(true);
});

test('keeps logical controls live for input, checkbox properties and availability changes', async ({
    page,
}) => {
    const previousId = (await control(page, 'full-name'))!.id;
    await page.locator('#full-name').fill('Мария');
    await page.locator('#notifications').uncheck();
    await expect.poll(async () => (await control(page, 'full-name'))?.state.value).toBe('Мария');
    await expect.poll(async () => (await control(page, 'notifications'))?.state.checked).toBe(false);
    await page.locator('#notifications').evaluate((input: HTMLInputElement) => {
        input.indeterminate = true;
    });
    await expect.poll(async () => (await control(page, 'notifications'))?.state.indeterminate).toBe(true);
    await page.locator('#full-name').evaluate((input: HTMLInputElement) => {
        input.disabled = true;
    });
    await expect.poll(async () => (await control(page, 'full-name'))?.state.disabled).toBe(true);
    expect((await control(page, 'full-name'))?.pointerActionable).toBe(false);
    expect((await control(page, 'full-name'))?.id).toBe(previousId);
});

test('preserves hints across value changes and DOM replacement without pretending IDs are stable', async ({
    page,
}) => {
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<label for="replace-me">Описание</label><input id="replace-me" name="description" value="До">',
            ),
        );
    await expect.poll(async () => (await control(page, 'replace-me'))?.state.value).toBe('До');
    const before = (await control(page, 'replace-me'))!;
    await page.locator('#replace-me').fill('После');
    await expect.poll(async () => (await control(page, 'replace-me'))?.state.value).toBe('После');
    expect((await control(page, 'replace-me'))?.locatorHints).toEqual(before.locatorHints);
    await page.locator('#replace-me').evaluate((input) => input.replaceWith(input.cloneNode(true)));
    await expect.poll(async () => (await control(page, 'replace-me'))?.id).not.toBe(before.id);
    const replaced = (await control(page, 'replace-me'))!;
    expect(replaced.locatorHints).toEqual(before.locatorHints);
    expect((await controls(page)).some((item) => item.id === before.id)).toBe(false);
    await page.locator('#replace-me').evaluate((input) => input.remove());
    await expect.poll(async () => await control(page, 'replace-me')).toBeUndefined();
});

test('does not merge independent buttons or fields just because their host or label matches', async ({
    page,
}) => {
    await page
        .locator('tui-textfield')
        .filter({ has: page.locator('#full-name') })
        .evaluate((host) =>
            host.insertAdjacentHTML('beforeend', '<button id="independent-action">Проверить</button>'),
        );
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <tui-textfield>
            <label tuiLabel>Поиск</label><input id="floating-field" tuiTextfield>
            <input id="field-filler" class="t-filler" aria-hidden="true" disabled>
        </tui-textfield>
        <tui-textfield multi><input id="multi-editor" tuiTextfield></tui-textfield>
        <input id="duplicate-label-a" aria-label="Имя"><input id="duplicate-label-b" aria-label="Имя">
    `,
        ),
    );
    await expect.poll(async () => (await control(page, 'floating-field'))?.label).toBe('Поиск');
    expect(await control(page, 'field-filler')).toBeUndefined();
    expect(await control(page, 'multi-editor')).toBeUndefined();
    const filler = Object.values((await snapshot(page)).nodes).find(
        (node) => node.kind === 'element' && node.attributes['id'] === 'field-filler',
    );
    expect((await control(page, 'floating-field'))?.memberNodeIds).toContain(filler!.id);
    const button = (await control(page, 'independent-action'))!;
    expect(button).toMatchObject({ kind: 'button', label: 'Проверить' });
    expect((await control(page, 'full-name'))?.memberNodeIds).not.toContain(button.targetNodeId);
    const a = (await control(page, 'duplicate-label-a'))!;
    const b = (await control(page, 'duplicate-label-b'))!;
    expect(a.label).toBe(b.label);
    expect(a.id).not.toBe(b.id);
});

test('redacts passwords, retains hidden controls and excludes inspector content', async ({ page }) => {
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <input id="private-field" type="password" aria-label="Пароль" value="private-value-123">
        <input id="hidden-control" hidden aria-label="Скрытое поле">
        <div data-training-observer-ignore><button id="ignored-control">Не наблюдать</button></div>
    `,
        ),
    );
    await expect.poll(async () => (await control(page, 'private-field'))?.state.redacted).toBe(true);
    expect((await control(page, 'private-field'))?.state.value).toBeUndefined();
    expect(JSON.stringify(await controls(page))).not.toContain('private-value-123');
    expect(await control(page, 'hidden-control')).toMatchObject({ visible: false, pointerActionable: false });
    expect(await control(page, 'ignored-control')).toBeUndefined();
    expect((await controls(page)).some((item) => item.label === 'Снять снимок')).toBe(false);
});

test('all control references resolve in the same snapshot, including truncated captures', async ({
    page,
}) => {
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => {
        details.open = true;
    });
    await page.getByLabel('Максимум узлов').fill('20');
    await page.getByRole('button', { name: 'Применить настройки' }).click();
    await expect.poll(async () => (await snapshot(page)).stats.truncated).toBe(true);
    const dom = await snapshot(page);
    const logical = await controls(page);
    expect(logical.length).toBeGreaterThan(0);
    for (const item of logical) {
        for (const id of [item.targetNodeId, item.hostNodeId, ...item.memberNodeIds])
            expect(dom.nodes[id]).toBeDefined();
    }
});
