import {expect, test, type Page} from '@playwright/test';

import {type DomElementSnapshot, type DomSnapshot} from '../libs/training-observer/src/index';

// Trace snapshots themselves read native form properties, which would contaminate the polling probe.
test.use({trace: 'off'});

async function snapshot(page: Page): Promise<DomSnapshot> {
    return JSON.parse(await page.getByTestId('snapshot-json').innerText()) as DomSnapshot;
}

async function element(page: Page, id: string): Promise<DomElementSnapshot | undefined> {
    return Object.values((await snapshot(page)).nodes)
        .find((node): node is DomElementSnapshot => node.kind === 'element' && node.attributes['id'] === id);
}

async function count(page: Page, name = 'scan-count'): Promise<number> {
    return Number(await page.getByTestId(name).innerText());
}

async function settings(page: Page, poll = 0, batch = 50): Promise<void> {
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => { details.open = true; });
    await page.getByLabel('Сверка свойств, мс').fill(String(poll));
    await page.getByLabel('Объединение событий, мс').fill(String(batch));
    const before = await count(page);

    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await expect.poll(() => count(page)).toBeGreaterThan(before);
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение включено');
    // Let focus/transition work from the settings interaction finish before measuring idle work.
    await page.waitForTimeout(batch + 100);
}

async function installReadProbe(page: Page): Promise<void> {
    await page.getByTestId('observed-page').evaluate((root) => {
        const input = document.createElement('input');
        const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        let reads = 0;

        input.id = 'read-probe';
        input.hidden = true;
        Object.defineProperty(input, 'value', {
            configurable: true,
            get() { reads++; return value.get!.call(this); },
            set(next: string) { value.set!.call(this, next); },
        });
        Object.defineProperty(input, 'testReadCount', {get: () => reads});
        root.append(input);
    });
    await expect.poll(async () => (await element(page, 'read-probe'))?.tagName).toBe('input');
}

function reads(page: Page): Promise<number> {
    return page.evaluate(() => (document.getElementById('read-probe') as HTMLInputElement & {testReadCount: number}).testReadCount);
}

test.beforeEach(async ({page}) => {
    await page.goto('/');
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение включено');
    await expect(page.getByTestId('snapshot-json')).toBeVisible();
});

test('updates text, attributes, additions and removals without manual capture', async ({page}) => {
    await settings(page);
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', '<button id="live-button">До</button>');
    });
    await expect.poll(async () => (await element(page, 'live-button'))?.label).toBe('До');
    await page.locator('#live-button').evaluate((button) => {
        button.firstChild!.textContent = 'После';
        button.setAttribute('disabled', '');
    });
    await expect.poll(async () => (await element(page, 'live-button'))?.state.disabled).toBe(true);
    expect((await element(page, 'live-button'))?.label).toBe('После');
    await page.getByRole('button', {name: 'Добавить поле'}).click();
    await expect.poll(async () => (await element(page, 'comment'))?.tagName).toBe('textarea');
    await page.getByRole('button', {name: 'Убрать поле'}).click();
    await expect.poll(async () => await element(page, 'comment')).toBeUndefined();
    await page.locator('#live-button').evaluate((button) => button.remove());
    await expect.poll(async () => await element(page, 'live-button')).toBeUndefined();
});

test('capture-phase input/change work with polling disabled and stopped bubbling', async ({page}) => {
    await settings(page);
    await page.locator('#full-name').evaluate((input: HTMLInputElement) => {
        input.addEventListener('input', (event) => event.stopPropagation());
        input.value = 'Событие ввода';
        input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await expect.poll(async () => (await element(page, 'full-name'))?.state.value).toBe('Событие ввода');
    await page.locator('#notifications').evaluate((input: HTMLInputElement) => {
        input.checked = false;
        input.dispatchEvent(new Event('change'));
    });
    await expect.poll(async () => (await element(page, 'notifications'))?.state.checked).toBe(false);
});

test('reconciles silent native property changes and remains idle when properties do not change', async ({page}) => {
    await settings(page, 100);
    await installReadProbe(page);
    await page.evaluate(() => {
        const input = document.getElementById('read-probe') as HTMLInputElement;

        input.value = 'Без события';
    });
    await expect.poll(async () => (await element(page, 'read-probe'))?.state.value).toBe('Без события');
    await page.locator('#notifications').evaluate((input: HTMLInputElement) => { input.indeterminate = true; });
    await expect.poll(async () => (await element(page, 'notifications'))?.state.indeterminate).toBe(true);
    const before = await count(page);
    const propertyReads = await reads(page);

    // Negative assertion across multiple configured polling intervals.
    await page.waitForTimeout(450);
    expect(await count(page)).toBe(before);
    expect(await reads(page)).toBeGreaterThan(propertyReads);
});

test('batches a burst once and publishes nothing for an unchanged recomputation', async ({page}) => {
    await settings(page, 0, 150);
    // An unbound native control isolates batching from Taiga UI's asynchronous input reactions.
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', '<input id="batch-probe" hidden>');
    });
    await expect.poll(async () => (await element(page, 'batch-probe'))?.tagName).toBe('input');
    const before = await count(page);
    const revision = await count(page, 'revision');

    await page.locator('#batch-probe').evaluate((input) => {
        for (let index = 0; index < 100; index++) {
            input.setAttribute('data-sequence', String(index));
            input.dispatchEvent(new Event('input', {bubbles: true}));
        }
    });
    await expect.poll(async () => (await element(page, 'batch-probe'))?.attributes['data-sequence']).toBe('99');
    await page.waitForTimeout(250);
    expect(await count(page)).toBe(before + 1);
    expect(await count(page, 'revision')).toBe(revision + 1);
    const publishedAt = (await snapshot(page)).capturedAt;

    await page.locator('#batch-probe').dispatchEvent('input');
    await expect.poll(() => count(page)).toBe(before + 2);
    expect(await count(page, 'revision')).toBe(revision + 1);
    expect((await snapshot(page)).capturedAt).toBe(publishedAt);
});

test('does not starve updates during a continuous stream of changes', async ({page}) => {
    await settings(page, 0, 60);
    const timer = await page.locator('#full-name').evaluate((input) => {
        let tick = 0;

        return window.setInterval(() => {
            input.setAttribute('data-tick', String(++tick));
        }, 25);
    });

    try {
        // Observe this stream's data, not a scan that an unrelated page event could trigger.
        // Keep emitting until the assertion completes: a debounce that starves would time out.
        await expect.poll(async () => Number((await element(page, 'full-name'))?.attributes['data-tick'] ?? 0),
            {intervals: [30], timeout: 2000}).toBeGreaterThan(0);
    } finally {
        await page.evaluate((id) => window.clearInterval(id), timer);
    }
});

test('refreshes geometry for window resize and external overlays', async ({page}) => {
    await settings(page);
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', `
            <button id="fixed-button" style="position:fixed;left:10px;top:10px;width:100px;height:40px;z-index:100">Hit</button>
            <button id="resize-button" style="position:fixed;left:70vw;top:100px;width:60px;height:30px">Resize</button>
        `);
    });
    await expect.poll(async () => (await element(page, 'fixed-button'))?.hitTest).toBe('hit');
    const x = (await element(page, 'resize-button'))!.rects[0].x;

    await page.setViewportSize({width: 1200, height: 1100});
    await expect.poll(async () => (await element(page, 'resize-button'))?.rects[0].x).not.toBe(x);
    await page.evaluate(() => {
        const cover = document.createElement('div');
        cover.id = 'outside-cover';
        cover.style.cssText = 'position:fixed;left:10px;top:10px;width:100px;height:40px;z-index:101;background:red';
        document.body.append(cover);
    });
    await expect.poll(async () => (await element(page, 'fixed-button'))?.hitTest).toBe('covered');
    await page.locator('#outside-cover').evaluate((cover) => cover.remove());
    await expect.poll(async () => (await element(page, 'fixed-button'))?.hitTest).toBe('hit');
});

test('whole-document capture ignores inspector mutations, events and property polling', async ({page}) => {
    await settings(page, 100);
    await page.getByLabel('Вся страница').check();
    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await expect.poll(async () => {
        const current = await snapshot(page);
        const root = current.nodes[current.rootId!];
        return root.kind === 'element' ? root.tagName : '';
    }).toBe('body');
    await page.waitForTimeout(250);
    const before = await count(page);

    await page.getByLabel('Максимум узлов').fill('9999');
    await page.locator('app-observer-panel .inspector').evaluate((panel) => {
        panel.insertAdjacentHTML('beforeend', '<div id="inspector-noise">Служебный текст</div>');
        panel.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await page.waitForTimeout(600);
    expect(await count(page)).toBe(before);
    expect(await element(page, 'inspector-noise')).toBeUndefined();
    const current = await snapshot(page);
    expect(Object.values(current.nodes).some((node) => node.kind === 'element' && node.tagName === 'app-observer-panel')).toBe(false);
});

test('stop cancels a queued capture, native polling and all event listeners; restart catches up', async ({page}) => {
    await settings(page, 100, 200);
    await installReadProbe(page);
    await page.evaluate(() => {
        document.getElementById('read-probe')!.setAttribute('data-pending', 'yes');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Остановить')!.click();
    });
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение остановлено');
    const before = await count(page);

    await page.evaluate(() => {
        const input = document.getElementById('read-probe') as HTMLInputElement;

        input.value = 'Во время паузы';
        input.setAttribute('data-later', 'yes');
        input.dispatchEvent(new Event('input', {bubbles: true}));
        window.dispatchEvent(new Event('resize'));
    });
    // Measure after the intentional assignment: a patched native setter may synchronously read value.
    const propertyReads = await reads(page);

    await page.waitForTimeout(600);
    expect(await count(page)).toBe(before);
    expect(await reads(page)).toBe(propertyReads);
    await page.getByRole('button', {name: 'Начать наблюдение'}).click();
    await expect.poll(async () => (await element(page, 'read-probe'))?.state.value).toBe('Во время паузы');
});

test('repeated starts replace the old polling interval and clear stops observation', async ({page}) => {
    await settings(page, 100);
    await installReadProbe(page);
    await settings(page, 0);
    await settings(page, 0);
    const before = await count(page);

    await page.evaluate(() => {
        const input = document.getElementById('read-probe') as HTMLInputElement;

        input.value = 'Polling disabled';
    });
    // Measure after the intentional assignment: a patched native setter may synchronously read value.
    const propertyReads = await reads(page);

    await page.waitForTimeout(450);
    expect(await count(page)).toBe(before);
    expect(await reads(page)).toBe(propertyReads);
    await page.getByRole('button', {name: 'Очистить', exact: true}).click();
    await expect(page.getByTestId('snapshot-json')).toHaveCount(0);
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение остановлено');
});

test('DestroyRef releases polling and pending work when the inspector is unmounted', async ({page}) => {
    await settings(page, 100, 200);
    await installReadProbe(page);
    await page.evaluate(() => {
        document.getElementById('read-probe')!.setAttribute('data-pending', 'yes');
        Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Закрыть инспектор')!.click();
    });
    await expect(page.locator('app-observer-panel')).toHaveCount(0);

    await page.evaluate(() => {
        const input = document.getElementById('read-probe') as HTMLInputElement;

        input.value = 'После уничтожения';
        input.dispatchEvent(new Event('change', {bubbles: true}));
        window.dispatchEvent(new Event('resize'));
    });
    // Measure after the intentional assignment: a patched native setter may synchronously read value.
    const propertyReads = await reads(page);

    await page.waitForTimeout(600);
    expect(await reads(page)).toBe(propertyReads);
    await page.getByRole('button', {name: 'Открыть инспектор'}).click();
    await expect.poll(async () => (await element(page, 'read-probe'))?.state.value).toBe('После уничтожения');
});

test('reports a detached root and retains the last successful snapshot', async ({page}) => {
    await settings(page, 0);
    // Read and detach in one browser task: no unrelated capture can occur between two RPCs.
    const before = await page.getByTestId('observed-page').evaluate((root) => {
        const published = JSON.parse(document.querySelector('[data-testid="snapshot-json"]')!.textContent!);
        root.remove();
        return published;
    });
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение остановлено');
    await expect(page.getByRole('alert')).toContainText('observed root was removed');
    expect((await snapshot(page)).capturedAt).toBe(before.capturedAt);
});

test('invalid start settings do not interrupt a working observation', async ({page}) => {
    await settings(page, 0);
    await page.getByLabel('Объединение событий, мс').fill('-1');
    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await expect(page.getByRole('alert')).toContainText('batchDelayMs must');
    await expect(page.getByTestId('observation-status')).toHaveText('Наблюдение включено');
    await page.locator('#full-name').fill('Продолжаем');
    await expect.poll(async () => (await element(page, 'full-name'))?.state.value).toBe('Продолжаем');
});

test('tracks moving a control into and out of an excluded subtree', async ({page}) => {
    await settings(page, 0);
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', '<button id="moved-control">Перемещение</button><div id="excluded-area" data-training-observer-ignore></div>');
    });
    await expect.poll(async () => (await element(page, 'moved-control'))?.tagName).toBe('button');
    await page.evaluate(() => {
        document.getElementById('excluded-area')!.append(document.getElementById('moved-control')!);
    });
    await expect.poll(() => element(page, 'moved-control')).toBeUndefined();
    await page.getByTestId('observed-page').evaluate((root) => {
        root.append(document.getElementById('moved-control')!);
    });
    await expect.poll(async () => (await element(page, 'moved-control'))?.tagName).toBe('button');
    await page.locator('#moved-control').evaluate((button) => button.setAttribute('data-training-observer-ignore', ''));
    await expect.poll(() => element(page, 'moved-control')).toBeUndefined();
    await page.locator('#moved-control').evaluate((button) => button.removeAttribute('data-training-observer-ignore'));
    await expect.poll(async () => (await element(page, 'moved-control'))?.tagName).toBe('button');
});

test('plain scroll does not rebuild or publish a snapshot, including with property polling enabled', async ({page}) => {
    await settings(page, 100);
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', `
            <div id="passive-scroller" style="height:60px;overflow:auto">
                <div style="height:400px"><button id="passive-row">Строка</button></div>
            </div>
        `);
    });
    await expect.poll(async () => (await element(page, 'passive-row'))?.label).toBe('Строка');
    const before = await snapshot(page);
    const scans = await count(page);
    const revision = await count(page, 'revision');
    const oldY = (await element(page, 'passive-row'))!.rects[0].y;

    await page.locator('#passive-scroller').evaluate((scroller) => { scroller.scrollTop = 150; });
    await page.evaluate(() => {
        document.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));
    });
    expect(await page.locator('#passive-row').evaluate((row) => row.getBoundingClientRect().y)).toBe(oldY - 150);
    // Observe multiple polling intervals: geometry differences alone must not trigger capture.
    await page.waitForTimeout(450);
    expect(await count(page)).toBe(scans);
    expect(await count(page, 'revision')).toBe(revision);
    expect(await snapshot(page)).toEqual(before);

    await page.getByRole('button', {name: 'Снять снимок', exact: true}).click();
    await expect.poll(async () => (await element(page, 'passive-row'))?.rects[0].y).toBe(oldY - 150);
});

test('DOM changes caused by virtualized scrolling still update the snapshot with polling disabled', async ({page}) => {
    await settings(page, 0);
    await page.getByTestId('observed-page').evaluate((root) => {
        root.insertAdjacentHTML('beforeend', `
            <div id="virtual-scroller" style="height:60px;overflow:auto">
                <div style="height:400px"><button id="virtual-row">Строка 1</button></div>
            </div>
        `);
        document.getElementById('virtual-scroller')!.addEventListener('scroll', () => {
            document.getElementById('virtual-row')!.textContent = 'Строка 2';
        }, {once: true});
    });
    await expect.poll(async () => (await element(page, 'virtual-row'))?.label).toBe('Строка 1');
    await page.locator('#virtual-scroller').evaluate((scroller) => { scroller.scrollTop = 150; });
    await expect.poll(async () => (await element(page, 'virtual-row'))?.label).toBe('Строка 2');
});

test('decorative hover on a real Taiga UI button does not rebuild the snapshot', async ({page}) => {
    await settings(page, 100);
    await page.mouse.move(20, 200);
    await page.waitForTimeout(700);
    const button = page.getByRole('button', {name: 'Добавить поле', exact: true});
    await button.evaluate((element) => {
        const probe = element as HTMLElement & {hoverTransitions: string[]};
        probe.hoverTransitions = [];
        element.addEventListener('transitionend', (event) => probe.hoverTransitions.push((event as TransitionEvent).propertyName));
    });
    const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    const before = await count(page);
    const revision = await count(page, 'revision');

    await button.hover();
    await expect.poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(background);
    await page.waitForTimeout(700);
    const transitions = await button.evaluate((element) => (element as HTMLElement & {hoverTransitions: string[]}).hoverTransitions);
    expect(transitions.length).toBeGreaterThan(0);
    expect(await count(page), `Hover transitions: ${transitions.join(', ')}`).toBe(before);
    expect(await count(page, 'revision')).toBe(revision);

    await page.mouse.move(20, 200);
    await page.waitForTimeout(700);
    expect(await count(page)).toBe(before);
});

test('hover visibility transitions still refresh controls without DOM mutations', async ({page}) => {
    await settings(page, 0);
    await page.mouse.move(20, 200);
    await page.getByTestId('observed-page').evaluate((root) => {
        const style = document.createElement('style');
        style.textContent = `
            #hover-fade-host { position:fixed; left:40px; top:250px; z-index:200; }
            #hover-fade-control { opacity:0; transition:opacity 180ms linear; }
            #hover-fade-host:hover #hover-fade-control { opacity:1; }
        `;
        document.head.append(style);
        root.insertAdjacentHTML('beforeend', `
            <div id="hover-fade-host">
                <button id="hover-fade-trigger">Показать действия</button>
                <button id="hover-fade-control">Действие</button>
            </div>
        `);
    });
    await expect.poll(async () => (await element(page, 'hover-fade-control'))?.visible).toBe(false);
    await page.locator('#hover-fade-trigger').hover();
    await expect.poll(async () => (await element(page, 'hover-fade-control'))?.visible).toBe(true);
    await page.mouse.move(20, 200);
    await expect.poll(async () => (await element(page, 'hover-fade-control'))?.visible).toBe(false);
});

test('menus inserted and removed on hover still update the page context', async ({page}) => {
    await settings(page, 0);
    await page.mouse.move(20, 200);
    await page.getByTestId('observed-page').evaluate((root) => {
        const host = document.createElement('div');
        host.id = 'hover-menu-host';
        host.style.cssText = 'position:fixed;left:40px;top:250px;z-index:200';
        host.innerHTML = '<button id="hover-menu-trigger">Меню</button>';
        host.addEventListener('mouseenter', () => host.insertAdjacentHTML('beforeend', '<button id="hover-menu-action">Открыть</button>'));
        host.addEventListener('mouseleave', () => document.getElementById('hover-menu-action')?.remove());
        root.append(host);
    });
    await expect.poll(async () => (await element(page, 'hover-menu-trigger'))?.label).toBe('Меню');
    await page.locator('#hover-menu-trigger').hover();
    await expect.poll(async () => (await element(page, 'hover-menu-action'))?.label).toBe('Открыть');
    await page.mouse.move(20, 200);
    await expect.poll(async () => await element(page, 'hover-menu-action')).toBeUndefined();
});

for (const wholeDocument of [false, true]) {
    test(`real wheel scrolling with Taiga UI page scrollbars does not trigger a capture (wholeDocument=${wholeDocument})`, async ({page}) => {
        await page.setViewportSize({width: 1440, height: 600});
        // Ensure both real Taiga UI root scrollbars exist, independently of the inspector's size.
        await page.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', '<div data-training-observer-ignore style="width:2000px;height:700px"></div>');
        });
        await settings(page, 100);
        if (wholeDocument) {
            await page.getByLabel('Вся страница').check();
            await page.getByRole('button', {name: 'Применить настройки'}).click();
            await expect.poll(async () => {
                const current = await snapshot(page);
                const root = current.nodes[current.rootId!];
                return root.kind === 'element' ? root.tagName : '';
            }).toBe('body');
        }
        await page.mouse.move(20, 200);
        await page.waitForTimeout(700);
        const before = await count(page);
        const revision = await count(page, 'revision');
        const top = await page.evaluate(() => window.scrollY);
        const thumb = page.locator('tui-scroll-controls [tuiScrollbar="vertical"]').first();
        await expect(thumb).toBeAttached();
        const style = await thumb.getAttribute('style');

        await page.mouse.wheel(0, 250);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(top);
        await expect.poll(() => thumb.getAttribute('style')).not.toBe(style);
        await page.waitForTimeout(700);
        expect(await count(page)).toBe(before);
        expect(await count(page, 'revision')).toBe(revision);

        const left = await page.evaluate(() => window.scrollX);
        const horizontalThumb = page.locator('tui-scroll-controls [tuiScrollbar="horizontal"]').first();
        const horizontalStyle = await horizontalThumb.getAttribute('style');
        await page.mouse.wheel(250, 0);
        await expect.poll(() => page.evaluate(() => window.scrollX)).toBeGreaterThan(left);
        await expect.poll(() => horizontalThumb.getAttribute('style')).not.toBe(horizontalStyle);
        await page.waitForTimeout(700);
        expect(await count(page)).toBe(before);
        expect(await count(page, 'revision')).toBe(revision);
        expect(Object.values((await snapshot(page)).nodes).some((node) =>
            node.kind === 'element' && (node.tagName === 'tui-scroll-controls' || 'tuiscrollbar' in node.attributes))).toBe(false);

        // Content still updates even while scroll decoration mutations occur in the same batch.
        await page.evaluate(() => {
            window.scrollBy(0, 100);
            document.getElementById('full-name')!.setAttribute('data-scroll-content', 'updated');
        });
        await expect.poll(async () => (await element(page, 'full-name'))?.attributes['data-scroll-content']).toBe('updated');
    });
}
