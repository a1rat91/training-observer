import {expect, test, type Page} from '@playwright/test';
import {type ControlSnapshot, type DomSnapshot} from '../libs/training-observer/src/index';

test.use({trace: 'off'});

async function controls(page: Page): Promise<ControlSnapshot[]> {
    return JSON.parse(await page.getByTestId('controls-json').textContent() ?? '[]');
}
async function control(page: Page, id: string): Promise<ControlSnapshot> {
    return (await controls(page)).find((item) => item.locatorHints.id === id)!;
}
async function snapshot(page: Page): Promise<DomSnapshot> {
    return JSON.parse(await page.getByTestId('snapshot-json').innerText());
}

test.beforeEach(async ({page}) => {
    await page.goto('/controls');
    await expect.poll(async () => (await control(page, 'department'))?.kind).toBe('select');
});

test('Taiga select tracks absent, opened, selected, closed and recreated portal outside the form', async ({page}) => {
    const initial = await control(page, 'department');
    expect(initial.choice).toMatchObject({displayValue: 'Разработка', popup: {status: 'closed', options: [], rootNodeIds: []}});
    expect(await page.locator('tui-dropdown').count()).toBe(0);
    await page.locator('#department').click();
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.options.map((option) => option.label))
        .toEqual(['Разработка', 'Поддержка', 'Продажи']);
    const opened = await control(page, 'department');
    expect(opened.id).toBe(initial.id);
    expect(opened.state.expanded).toBe(true);
    expect(opened.choice!.popup.options[0].selected).toBe(true);
    expect(opened.choice!.popup.options[2].disabled).toBe(true);
    const dom = await snapshot(page);
    expect(dom.relatedRootIds).toContain(opened.choice!.popup.rootNodeIds[0]);
    expect(await page.getByTestId('observed-page').locator('tui-dropdown').count()).toBe(0);
    expect((await controls(page)).filter((item) => item.kind === 'checkbox')).toHaveLength(1);

    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await expect.poll(async () => (await control(page, 'department')).choice?.displayValue).toBe('Поддержка');
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.status).toBe('closed');
    expect((await control(page, 'department')).choice?.popup.options).toEqual([]);
    expect((await snapshot(page)).relatedRootIds).toEqual([]);
    await expect(page.locator('tui-dropdown')).toHaveCount(0);
    await page.locator('#department').click();
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.options.find((option) => option.selected)?.label).toBe('Поддержка');
    expect((await control(page, 'department')).id).toBe(initial.id);
    expect((await control(page, 'department')).choice?.popup.rootNodeIds).not.toEqual(opened.choice!.popup.rootNodeIds);
});

test('Taiga combobox exposes query, asynchronous loading, rendered results and selection evidence', async ({page}) => {
    await page.locator('#employee').fill('Анна');
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.busy, {intervals: [25]}).toBe(true);
    expect((await control(page, 'employee')).choice).toMatchObject({displayValue: 'Анна', selection: {status: 'unknown'}, popup: {options: []}});
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.options.map((option) => option.label))
        .toEqual(['Анна Смирнова']);
    expect((await control(page, 'employee')).choice?.popup.busy).toBe(false);
    await page.getByRole('option', {name: 'Анна Смирнова', exact: true}).click();
    await expect.poll(async () => (await control(page, 'employee')).choice?.displayValue).toBe('Анна Смирнова');
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.status).toBe('closed');
    // Closed input text alone doesn't reveal an Angular model value or prove commitment.
    expect((await control(page, 'employee')).choice?.selection.status).toBe('unknown');
    await page.locator('#employee').click();
    await expect.poll(async () => (await control(page, 'employee')).choice?.selection.labels).toEqual(['Анна Смирнова']);
});

test('latest search results, empty results and Escape update the same combobox', async ({page}) => {
    const id = (await control(page, 'employee')).id;
    await page.locator('#employee').fill('Анна');
    await page.locator('#employee').fill('Мария');
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.options.map((option) => option.label)).toEqual(['Мария Петрова']);
    expect((await control(page, 'employee')).id).toBe(id);
    await page.locator('#employee').fill('zzz');
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.text).toContain('Ничего не найдено');
    expect((await control(page, 'employee')).choice?.popup.options).toEqual([]);
    await page.locator('#employee').press('Escape');
    await expect.poll(async () => (await control(page, 'employee')).choice?.popup.status).toBe('closed');
});

test('an unrelated listbox is not attributed to the active field, even with whole-document capture', async ({page}) => {
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend',
        '<div id="unrelated-list" role="listbox"><button role="option">Чужой вариант</button></div>'));
    await page.locator('#department').click();
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.options.length).toBe(3);
    expect(Object.values((await snapshot(page)).nodes).some((node) => node.kind === 'element' && node.attributes['id'] === 'unrelated-list')).toBe(false);
    await page.locator('#department').press('Escape');
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => { details.open = true; });
    await page.getByLabel('Вся страница').check();
    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await page.locator('#department').click();
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.options.length).toBe(3);
    expect((await control(page, 'department')).choice?.popup.options.some((option) => option.label === 'Чужой вариант')).toBe(false);
    expect((await snapshot(page)).relatedRootIds).toEqual([]);
});

test('missing explicit popup link remains unresolved rather than choosing another listbox', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => root.insertAdjacentHTML('beforeend',
        '<input id="unlinked-choice" tuiComboBox aria-expanded="true" aria-haspopup="listbox" aria-label="Без связи">'));
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div role="listbox"><button role="option">Не угадывать</button></div>'));
    await expect.poll(async () => (await control(page, 'unlinked-choice'))?.choice?.popup.status).toBe('unresolved');
    expect((await control(page, 'unlinked-choice')).choice?.popup.options).toEqual([]);
});

test('native select also exposes selected labels, values and disabled options', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => root.insertAdjacentHTML('beforeend', `
        <label for="native-choice">Native</label><select id="native-choice">
            <option value="a">Первый</option><option value="b" selected>Второй</option><option value="c" disabled>Третий</option>
        </select>`));
    await expect.poll(async () => (await control(page, 'native-choice'))?.choice?.displayValue).toBe('Второй');
    expect((await control(page, 'native-choice')).state.value).toBe('b');
    expect((await control(page, 'native-choice')).choice?.popup.options[2]).toMatchObject({disabled: true, value: 'c'});
});

test('keyboard option selection is reflected without a mouse click on the option', async ({page}) => {
    await page.locator('#department').click();
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.status).toBe('open');
    await page.getByRole('option', {name: 'Поддержка', exact: true}).focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await control(page, 'department')).choice?.displayValue).toBe('Поддержка');
    await expect.poll(async () => (await control(page, 'department')).choice?.popup.status).toBe('closed');
});

test('portal capture respects the global node limit and explicit exclusions', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => root.insertAdjacentHTML('beforeend',
        '<input id="limited-choice" tuiComboBox aria-expanded="true" aria-haspopup="listbox" aria-controls="limited-list" aria-label="Лимит">'));
    await page.evaluate(() => {
        const list = document.createElement('div');
        list.id = 'limited-list';
        list.setAttribute('role', 'listbox');
        list.innerHTML = Array.from({length: 100}, (_, i) => `<button role="option">Вариант ${i}</button>`).join('');
        document.body.append(list);
    });
    await expect.poll(async () => (await control(page, 'limited-choice'))?.choice?.popup.options.length).toBe(100);
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => { details.open = true; });
    const full = await snapshot(page);
    const limit = full.stats.nodeCount - 150;
    await page.getByLabel('Максимум узлов').fill(String(limit));
    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await expect.poll(async () => (await snapshot(page)).stats.truncated).toBe(true);
    const limited = await snapshot(page);
    expect(limited.stats.nodeCount).toBeLessThanOrEqual(limit);
    expect((await control(page, 'limited-choice')).choice!.popup.options.length).toBeLessThan(100);
    for (const node of Object.values(limited.nodes)) {
        if (node.kind === 'element') for (const id of node.children) expect(limited.nodes[id]?.parentId).toBe(node.id);
    }
    await page.locator('#limited-list').evaluate((list) => list.setAttribute('data-training-observer-ignore', ''));
    await expect.poll(async () => (await control(page, 'limited-choice')).choice?.popup.status).toBe('unresolved');
    expect((await control(page, 'limited-choice')).choice?.popup.options).toEqual([]);
});
