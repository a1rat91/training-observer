import {expect, test, type Page} from '@playwright/test';

import {type DomElementSnapshot, type DomSnapshot} from '../projects/training-observer/src/index';

async function capture(page: Page): Promise<DomSnapshot> {
    const output = page.getByTestId('snapshot-json');
    const previous = await output.count() ? JSON.parse(await output.innerText()).capturedAt : null;

    await page.getByRole('button', {name: 'Снять снимок'}).click();
    // Angular coalesces rendering until the next frame; wait for this capture, not the old JSON.
    await expect.poll(async () => {
        return await output.count() ? JSON.parse(await output.innerText()).capturedAt : null;
    }).not.toBe(previous);

    return JSON.parse(await output.innerText()) as DomSnapshot;
}

function elements(snapshot: DomSnapshot): DomElementSnapshot[] {
    return Object.values(snapshot.nodes).filter((node): node is DomElementSnapshot => node.kind === 'element');
}

function byId(snapshot: DomSnapshot, id: string): DomElementSnapshot {
    const element = elements(snapshot).find((node) => node.attributes['id'] === id);

    expect(element, `DOM element #${id} must be in the snapshot`).toBeDefined();

    return element!;
}

test.beforeEach(async ({page}) => {
    await page.goto('/');
    await expect(page.getByRole('heading', {name: 'Исследуем страницу'})).toBeVisible();
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение остановлено');
});

test('captures a serializable, consistent graph without modifying the observed DOM', async ({page}) => {
    const before = await page.getByTestId('observed-page').evaluate((root) => root.outerHTML);
    const snapshot = await capture(page);

    expect(snapshot.rootId).not.toBeNull();
    expect(snapshot.stats.nodeCount).toBe(Object.keys(snapshot.nodes).length);
    expect(snapshot.stats.truncated).toBe(false);
    expect(snapshot.nodes[snapshot.rootId!].parentId).toBeNull();
    expect(elements(snapshot).some((node) => node.label === 'Снять снимок')).toBe(false);
    expect(byId(snapshot, 'full-name')).toMatchObject({interactive: true, label: 'Имя', state: {value: 'Алексей'}});

    for (const element of elements(snapshot)) {
        for (const childId of element.children) {
            expect(snapshot.nodes[childId].parentId).toBe(element.id);
        }
    }

    expect(await page.getByTestId('observed-page').evaluate((root) => root.outerHTML)).toBe(before);
});

test('reads current input, checkbox and select properties; snapshots remain manual', async ({page}) => {
    const before = await capture(page);

    await page.locator('#full-name').fill('Мария');
    await page.locator('#notifications').uncheck();
    await page.locator('#department').selectOption('support');
    expect(JSON.parse(await page.getByTestId('snapshot-json').innerText())).toEqual(before);

    const after = await capture(page);

    expect(byId(after, 'full-name').state.value).toBe('Мария');
    expect(byId(after, 'notifications').state.checked).toBe(false);
    expect(byId(after, 'department').state.value).toBe('support');
    expect(byId(after, 'full-name').id).toBe(byId(before, 'full-name').id);
    expect(byId(before, 'notifications').state.checked).toBe(true);
    // Programmatic property changes do not require an event for the next capture.
    await page.locator('#full-name').evaluate((input: HTMLInputElement) => { input.value = 'Из кода'; });
    expect(byId(await capture(page), 'full-name').state.value).toBe('Из кода');
});

test('retains hidden controls and does not let cursor:pointer override disabled', async ({page}) => {
    const snapshot = await capture(page);
    const save = elements(snapshot).find((node) => node.tagName === 'button' && node.label === 'Сохранить');
    const hidden = elements(snapshot).find((node) => node.attributes['aria-label'] === 'Скрытое поле');

    expect(save).toMatchObject({interactive: true, pointerActionable: false, state: {disabled: true}});
    expect(hidden).toMatchObject({visible: false, interactive: true, pointerActionable: false});
});

test('handles display:contents, ancestor opacity, inert, inherited disabled and readonly', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', `
            <div style="display:contents"><button id="contents-button">Внутри contents</button></div>
            <div style="opacity:0"><button id="transparent-button">Прозрачная</button></div>
            <div inert><button id="inert-button">Инертная</button></div>
            <fieldset disabled><input id="fieldset-input"></fieldset>
            <input id="readonly-input" readonly value="Только чтение">
        `);
    });
    const snapshot = await capture(page);

    expect(byId(snapshot, 'contents-button').visible).toBe(true);
    expect(byId(snapshot, 'transparent-button').visible).toBe(false);
    expect(byId(snapshot, 'inert-button')).toMatchObject({pointerActionable: false, state: {inert: true}});
    expect(byId(snapshot, 'fieldset-input').state.disabled).toBe(true);
    expect(byId(snapshot, 'readonly-input')).toMatchObject({interactive: true, state: {readOnly: true, value: 'Только чтение'}});
});

test('detects occlusion and distinguishes rendered offscreen elements', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', `
            <button id="covered-button" style="position:fixed;left:10px;top:10px;width:100px;height:40px;z-index:100">Covered</button>
            <button id="offscreen-button" style="position:absolute;top:5000px">Offscreen</button>
        `);
        const cover = document.createElement('div');

        cover.id = 'test-cover';
        cover.style.cssText = 'position:fixed;left:10px;top:10px;width:100px;height:40px;z-index:101;background:red';
        document.body.append(cover);
    });
    const covered = await capture(page);

    expect(byId(covered, 'covered-button')).toMatchObject({visible: true, inViewport: true, hitTest: 'covered', pointerActionable: false});
    expect(byId(covered, 'offscreen-button')).toMatchObject({visible: true, inViewport: false, hitTest: 'not-tested'});
    await page.locator('#test-cover').evaluate((element) => element.remove());
    expect(byId(await capture(page), 'covered-button')).toMatchObject({hitTest: 'hit', pointerActionable: true});
});

test('updates added, removed and replaced nodes while retaining live-node IDs', async ({page}) => {
    const initial = await capture(page);

    await page.getByRole('button', {name: 'Добавить поле'}).click();
    await expect(page.locator('#comment')).toBeVisible();
    const added = await capture(page);

    expect(byId(added, 'comment').tagName).toBe('textarea');
    expect(byId(added, 'full-name').id).toBe(byId(initial, 'full-name').id);
    await page.getByRole('button', {name: 'Убрать поле'}).click();
    await expect(page.locator('#comment')).toHaveCount(0);
    const removed = await capture(page);

    expect(elements(removed).some((element) => element.attributes['id'] === 'comment')).toBe(false);
    await page.locator('#department').evaluate((element) => element.replaceWith(element.cloneNode(true)));
    expect(byId(await capture(page), 'department').id).not.toBe(byId(initial, 'department').id);
});

test('redacts password property and value attribute', async ({page}) => {
    await page.locator('#secret').fill('do-not-record-this');
    await page.locator('#secret').evaluate((element) => element.setAttribute('value', 'do-not-record-this'));
    const snapshot = await capture(page);

    expect(byId(snapshot, 'secret').state.redacted).toBe(true);
    expect(byId(snapshot, 'secret').state.value).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('do-not-record-this');
});

test('reports iframe and open shadow boundaries, ignores its own UI and excluded subtrees', async ({page}) => {
    await page.getByTestId('observed-page').evaluate((root) => {
        const host = document.createElement('div');

        host.id = 'shadow-host';
        host.attachShadow({mode: 'open'}).innerHTML = '<button id="shadow-button">Shadow</button>';
        root.append(host);
        root.insertAdjacentHTML('beforeend', '<iframe id="frame" srcdoc="<button>Frame</button>"></iframe><div data-training-observer-ignore><input id="excluded"></div><script>/* skipped */</script>');
    });
    const snapshot = await capture(page);

    expect(snapshot.stats.boundaryCount).toBe(2);
    expect(byId(snapshot, 'frame').boundaries).toEqual(['iframe']);
    expect(byId(snapshot, 'shadow-host').boundaries).toEqual(['open-shadow-root']);
    expect(elements(snapshot).some((node) => ['excluded', 'shadow-button'].includes(node.attributes['id']))).toBe(false);
    expect(elements(snapshot).some((node) => node.tagName === 'script')).toBe(false);
});

test('reports truncation and keeps references valid when a limit is reached', async ({page}) => {
    await page.getByText('Ограничения обхода', {exact: true}).click();
    await page.getByLabel('Максимум узлов').fill('3');
    const limited = await capture(page);

    expect(limited.stats).toMatchObject({nodeCount: 3, truncated: true, limitsReached: ['maxNodes']});
    for (const element of elements(limited)) {
        for (const child of element.children) {
            expect(limited.nodes[child]).toBeDefined();
        }
    }

    await page.getByLabel('Максимум узлов').fill('10000');
    await page.getByLabel('Максимум уровней').fill('0');
    const shallow = await capture(page);

    expect(shallow.stats).toMatchObject({nodeCount: 1, truncated: true, limitsReached: ['maxDepth']});
    await page.getByLabel('Максимум уровней').fill('-1');
    await page.getByRole('button', {name: 'Снять снимок'}).click();
    await expect(page.getByRole('alert').first()).toContainText('maxDepth must be');
});
