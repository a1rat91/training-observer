import { expect, test, type Page } from '@playwright/test';
import { type ControlSnapshot, type DomSnapshot } from '../libs/training-observer/src/index';

test.use({ trace: 'off' });

async function controls(page: Page): Promise<ControlSnapshot[]> {
    return JSON.parse((await page.getByTestId('controls-json').textContent()) ?? '[]');
}

async function control(page: Page, id: string): Promise<ControlSnapshot | undefined> {
    return (await controls(page)).find((item) => item.locatorHints.id === id);
}

async function expectObservedValue(page: Page, id: string): Promise<void> {
    const value = await page.locator(`#${id}`).inputValue();
    await expect.poll(async () => (await control(page, id))?.state.value).toBe(value);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/controls');
    await expect(page.locator('#amount')).not.toHaveValue('');
    await expectObservedValue(page, 'amount');
});

test('real Taiga numbers preserve labels, exact formatting and big integers', async ({ page }) => {
    expect(await control(page, 'amount')).toMatchObject({
        kind: 'number',
        source: 'taiga-ui',
        label: 'Сумма',
        state: { required: true },
        locatorHints: { role: 'textbox', inputType: 'text' },
    });
    expect((await control(page, 'amount'))?.state.value).toContain('₽');
    await expectObservedValue(page, 'international-amount');
    expect(await control(page, 'international-amount')).toMatchObject({
        kind: 'number',
        source: 'taiga-ui',
        label: 'Сумма в другом формате',
    });
    expect((await control(page, 'international-amount'))?.state.value).toContain('1,234.5');
    await expectObservedValue(page, 'large-number');
    expect(String((await control(page, 'large-number'))?.state.value).replace(/\D/g, '')).toBe(
        '900719925474099312345',
    );
    expect(await control(page, 'native-quantity')).toMatchObject({
        kind: 'number',
        source: 'native',
        label: 'Количество (HTML)',
        state: { value: '2' },
        locatorHints: { role: 'spinbutton', inputType: 'number' },
    });
});

test('typing, step buttons, keyboard and cleaner update the same numeric control', async ({ page }) => {
    await page.getByText('InputNumber', { exact: true }).click();
    const original = (await control(page, 'amount'))!;
    const input = page.locator('#amount');
    await input.fill('10');
    await expectObservedValue(page, 'amount');
    const typed = await input.inputValue();
    await input.press('ArrowUp');
    await expect(input).not.toHaveValue(typed);
    await expectObservedValue(page, 'amount');
    const stepped = await input.inputValue();
    const host = page.locator('tui-textfield').filter({ has: input });
    await host.getByRole('button', { name: '-', exact: true }).click();
    await expect(input).not.toHaveValue(stepped);
    await expectObservedValue(page, 'amount');
    expect(await input.inputValue()).toBe(typed);
    await host.locator('[tuiButtonX]').click();
    await expect(input).toHaveValue('');
    await expectObservedValue(page, 'amount');
    expect((await control(page, 'amount'))?.id).toBe(original.id);

    const dom: DomSnapshot = JSON.parse((await page.getByTestId('snapshot-json').textContent()) ?? '{}');
    const amount = (await control(page, 'amount'))!;
    const cleaner = amount.memberNodeIds
        .map((id) => dom.nodes[id])
        .find((node) => node?.kind === 'element' && 'tuibuttonx' in node.attributes);
    expect(cleaner).toBeDefined();
    expect((await controls(page)).some((item) => item.targetNodeId === cleaner!.id)).toBe(false);
    // Step buttons stay explicit actions with their own availability.
    const buttons = (await controls(page)).filter(
        (item) => item.kind === 'button' && ['+', '-'].includes(item.label),
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(amount.memberNodeIds).not.toContain(button.targetNodeId);
});

test('numeric boundaries update step availability; readonly and disabled remain observable', async ({
    page,
}) => {
    await page.getByText('InputNumber', { exact: true }).click();
    const input = page.locator('#amount');
    await input.fill('2000');
    await expectObservedValue(page, 'amount');
    await expect
        .poll(async () => (await controls(page)).find((item) => item.label === '+')?.state.disabled)
        .toBe(true);
    await input.fill('0');
    await expect
        .poll(async () => (await controls(page)).find((item) => item.label === '-')?.state.disabled)
        .toBe(true);
    await input.evaluate((element: HTMLInputElement) => {
        element.readOnly = true;
    });
    await expect.poll(async () => (await control(page, 'amount'))?.state.readOnly).toBe(true);
    await input.evaluate((element: HTMLInputElement) => {
        element.disabled = true;
    });
    await expect.poll(async () => (await control(page, 'amount'))?.state.disabled).toBe(true);
    expect((await control(page, 'amount'))?.pointerActionable).toBe(false);
});

test('native validity and silent numeric value writes are reconciled', async ({ page }) => {
    await page.getByText('InputNumber', { exact: true }).click();
    await page.locator('#native-quantity').fill('3');
    await expect.poll(async () => (await control(page, 'native-quantity'))?.state.invalid).toBe(true);
    await page.locator('#native-quantity').evaluate((input: HTMLInputElement) => {
        input.value = '8';
    });
    await expect.poll(async () => (await control(page, 'native-quantity'))?.state.value).toBe('8');
    expect((await control(page, 'native-quantity'))?.state.invalid).toBe(false);
    await page.locator('#amount').evaluate((input: HTMLInputElement) => {
        input.value = '1 999,5 ₽';
    });
    await expect.poll(async () => (await control(page, 'amount'))?.state.value).toBe('1 999,5 ₽');
    await page.locator('#native-quantity').fill('');
    await expect.poll(async () => (await control(page, 'native-quantity'))?.state.value).toBe('');
    expect((await control(page, 'native-quantity'))?.state.invalid).toBe(true);
});

test('numeric keyboards are not enough to classify text fields; conflicting native roles stay unsupported', async ({
    page,
}) => {
    await page.getByTestId('observed-page').evaluate((root) =>
        root.insertAdjacentHTML(
            'beforeend',
            `
        <label>Номер договора<input id="account-text" inputmode="numeric" value="00123"></label>
        <input id="conflicting-number" type="number" role="slider" value="5">
        <div id="aria-spinbutton" role="spinbutton" aria-valuenow="7"></div>`,
        ),
    );
    await expect.poll(async () => (await control(page, 'account-text'))?.state.value).toBe('00123');
    expect((await control(page, 'account-text'))?.kind).toBe('textbox');
    expect(await control(page, 'conflicting-number')).toBeUndefined();
    expect(await control(page, 'aria-spinbutton')).toBeUndefined();
});

test('a numeric field keeps its explicit popup relationship without claiming selection semantics', async ({
    page,
}) => {
    await page.evaluate(() => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="number-popup" role="dialog">Подсказка к сумме</div>',
        );
        const input = document.getElementById('amount')!;
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-haspopup', 'dialog');
        input.setAttribute('aria-controls', 'number-popup');
        input.setAttribute('aria-expanded', 'true');
    });
    await expect.poll(async () => (await control(page, 'amount'))?.popup?.status).toBe('open');
    expect(await control(page, 'amount')).toMatchObject({
        kind: 'number',
        popup: {
            relation: 'aria-controls',
            referencedIds: ['number-popup'],
            text: 'Подсказка к сумме',
            options: [],
        },
    });
    expect((await control(page, 'amount'))?.choice).toBeUndefined();
    await page.locator('#number-popup').evaluate((node) => node.remove());
    await expect.poll(async () => (await control(page, 'amount'))?.popup?.status).toBe('unresolved');
});
