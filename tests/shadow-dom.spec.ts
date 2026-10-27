import {expect, type Page, test} from '@playwright/test';

import {
    type ControlSnapshot,
    type DomElementSnapshot,
    type DomSnapshot,
    type MicrofrontendSnapshot,
} from '../libs/training-observer/src';
import {installShadowControls} from './fixtures/shadow-controls';

test.use({trace: 'off'});

async function snapshot(page: Page): Promise<DomSnapshot> {
    return JSON.parse(await page.getByTestId('snapshot-json').innerText());
}

async function element(page: Page, id: string): Promise<DomElementSnapshot | undefined> {
    return Object.values((await snapshot(page)).nodes).find(
        (node): node is DomElementSnapshot =>
            node.kind === 'element' && node.attributes['id'] === id,
    );
}

async function controls(page: Page): Promise<ControlSnapshot[]> {
    return JSON.parse((await page.getByTestId('controls-json').textContent()) ?? '[]');
}

async function settings(page: Page, poll = 0): Promise<void> {
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => {
        details.open = true;
    });
    await page.getByLabel('Сверка свойств, мс').fill(String(poll));
    await page.getByRole('button', {name: 'Применить настройки'}).click();
    await expect(page.getByTestId('observation-status')).toHaveText(
        'Наблюдение включено',
    );
}

test.beforeEach(async ({page}) => {
    await page.goto('/controls');
    await expect(page.getByTestId('snapshot-json')).toBeVisible();
});

test('captures nested open roots, slots, labels and a consistent serializable graph', async ({
    page,
}) => {
    await settings(page);
    await installShadowControls(page);
    await expect
        .poll(async () => (await element(page, 'nested-action'))?.pointerActionable)
        .toBe(true);
    expect(await element(page, 'shadow-name')).toMatchObject({
        label: 'Shadow name',
        hitTest: 'hit',
        pointerActionable: true,
    });
    expect(await element(page, 'slotted-action')).toMatchObject({
        hitTest: 'hit',
        pointerActionable: true,
    });
    const current = await snapshot(page);

    expect(current.stats.nodeCount).toBe(Object.keys(current.nodes).length);
    expect(JSON.stringify(current)).not.toContain('shadow-private-value');

    for (const node of Object.values(current.nodes)) {
        if (node.kind === 'element') {
            for (const child of node.children) {
                expect(current.nodes[child].parentId).toBe(node.id);
            }
        }
    }

    expect((await element(page, 'nested-action'))?.path).toContain('/shadow-root/');
});

test('detects real occlusion, host opacity and inert across shadow roots', async ({
    page,
}) => {
    await settings(page);
    await installShadowControls(page);
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.pointerActionable)
        .toBe(true);
    await page.locator('#shadow-fixture').evaluate((host: HTMLElement) => {
        host.style.opacity = '0';
    });
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.visible)
        .toBe(false);
    await page.locator('#shadow-fixture').evaluate((host: HTMLElement) => {
        host.style.opacity = '1';
        host.inert = true;
    });
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.state.inert)
        .toBe(true);
    expect((await element(page, 'shadow-action'))?.pointerActionable).toBe(false);
    await page.locator('#shadow-fixture').evaluate((host: HTMLElement) => {
        host.inert = false;
        const button = host.shadowRoot!.querySelector('#shadow-action')!;
        const rect = button.getBoundingClientRect();
        const cover = document.createElement('div');

        cover.id = 'shadow-cover';
        cover.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:300;background:red`;
        document.body.append(cover);
    });
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.hitTest)
        .toBe('covered');
    await page.locator('#shadow-cover').evaluate((cover) => cover.remove());
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.pointerActionable)
        .toBe(true);
});

test('updates shadow mutations, nested roots and non-composed events without polling', async ({
    page,
}) => {
    await settings(page);
    await installShadowControls(page);
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.label)
        .toBe('Shadow action');
    await page.locator('#shadow-action').evaluate((button) => {
        button.firstChild!.textContent = 'Changed';
    });
    await expect
        .poll(async () => (await element(page, 'shadow-action'))?.label)
        .toBe('Changed');
    await page.locator('#shadow-name').evaluate((input: HTMLInputElement) => {
        input.value = 'Non-composed input';
        input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.state.value)
        .toBe('Non-composed input');
    await page.locator('#nested-host').evaluate((host) => {
        const nested = document.createElement('div');

        nested.attachShadow({mode: 'open'}).innerHTML = '<input id="late-shadow-input">';
        host.shadowRoot!.append(nested);
    });
    await expect
        .poll(async () => (await element(page, 'late-shadow-input'))?.tagName)
        .toBe('input');
    await page
        .locator('#late-shadow-input')
        .evaluate((input) => input.setAttribute('disabled', ''));
    await expect
        .poll(async () => (await element(page, 'late-shadow-input'))?.state.disabled)
        .toBe(true);
    await page.locator('#late-shadow-input').evaluate((input) => input.remove());
    await expect.poll(async () => element(page, 'late-shadow-input')).toBeUndefined();
});

test('polls silent property changes and discovers a root attached to an existing host', async ({
    page,
}) => {
    await settings(page, 100);
    await installShadowControls(page);
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.tagName)
        .toBe('input');
    await page.locator('#shadow-name').evaluate((input: HTMLInputElement) => {
        input.value = 'Silent update';
    });
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.state.value)
        .toBe('Silent update');
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML('beforeend', '<div id="late-host"></div>'),
        );
    await expect
        .poll(async () => (await element(page, 'late-host'))?.tagName)
        .toBe('div');
    await page.locator('#late-host').evaluate((host) => {
        host.attachShadow({mode: 'open'}).innerHTML =
            '<input id="attached-later" value="Late value">';
    });
    await expect
        .poll(async () => (await element(page, 'attached-later'))?.state.value)
        .toBe('Late value');
});

test('keeps references inside each component instance and excludes ignored hosts', async ({
    page,
}) => {
    await settings(page);
    await installShadowControls(page);
    await installShadowControls(
        page,
        '[data-testid="observed-page"]',
        'second-shadow-fixture',
    );
    await page.locator('#second-shadow-fixture').evaluate((host) => {
        host.shadowRoot!.querySelector('#name-label')!.textContent = 'Second name';
        host.shadowRoot!.querySelector('[role="option"]')!.textContent = 'Second choice';
    });
    await expect
        .poll(async () =>
            (await controls(page))
                .filter((control) => control.locatorHints.id === 'shadow-name')
                .map((control) => control.label),
        )
        .toEqual(['Shadow name', 'Second name']);
    expect(
        (await controls(page))
            .filter((control) => control.locatorHints.id === 'shadow-choice')
            .map((control) =>
                control.choice?.popup.options.map((option) => option.label),
            ),
    ).toEqual([['Local choice'], ['Second choice']]);
    await page
        .locator('#second-shadow-fixture')
        .evaluate((host) => host.setAttribute('data-training-observer-ignore', ''));
    await expect
        .poll(
            async () =>
                (await controls(page)).filter(
                    (control) => control.locatorHints.id === 'shadow-name',
                ).length,
        )
        .toBe(1);
});

test('releases shadow listeners, mutations and polling on stop', async ({page}) => {
    await settings(page, 100);
    await installShadowControls(page);
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.tagName)
        .toBe('input');
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    const before = await page.getByTestId('scan-count').innerText();

    await page.locator('#shadow-name').evaluate((input: HTMLInputElement) => {
        input.value = 'Stopped';
        input.setAttribute('data-update', 'stopped');
        input.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(350);
    expect(await page.getByTestId('scan-count').innerText()).toBe(before);
    await page.getByRole('button', {name: 'Начать наблюдение'}).click();
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.state.value)
        .toBe('Stopped');
});

test('manual capture connects a late shadow root when polling is disabled', async ({
    page,
}) => {
    await settings(page);
    await page
        .getByTestId('observed-page')
        .evaluate((root) =>
            root.insertAdjacentHTML('beforeend', '<div id="manual-host"></div>'),
        );
    await expect
        .poll(async () => (await element(page, 'manual-host'))?.tagName)
        .toBe('div');
    await page.locator('#manual-host').evaluate((host) => {
        host.attachShadow({mode: 'open'}).innerHTML = '<input id="manual-shadow-input">';
    });
    await page.getByRole('button', {name: 'Снять снимок'}).click();
    await expect
        .poll(async () => (await element(page, 'manual-shadow-input'))?.tagName)
        .toBe('input');
    await page.locator('#manual-shadow-input').evaluate((input: HTMLInputElement) => {
        input.value = 'Connected after capture';
        input.dispatchEvent(new Event('input'));
    });
    await expect
        .poll(async () => (await element(page, 'manual-shadow-input'))?.state.value)
        .toBe('Connected after capture');
});

test('keeps closed roots opaque and applies maxDepth inside open roots', async ({
    page,
}) => {
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    await installShadowControls(page);
    await page.getByTestId('observed-page').evaluate((root) => {
        const host = document.createElement('div');

        host.id = 'closed-host';
        host.attachShadow({mode: 'closed'}).innerHTML = '<input id="closed-input">';
        root.append(host);
    });
    await page.locator('.settings').evaluate((details: HTMLDetailsElement) => {
        details.open = true;
    });
    await page.getByLabel('Максимум уровней').fill('2');
    await page.getByRole('button', {name: 'Снять снимок'}).click();
    await expect
        .poll(async () => (await element(page, 'shadow-name'))?.tagName)
        .toBe('input');
    expect(await element(page, 'nested-action')).toBeUndefined();
    expect(await element(page, 'closed-host')).toBeDefined();
    expect(await element(page, 'closed-input')).toBeUndefined();
    expect((await snapshot(page)).stats.limitsReached).toContain('maxDepth');
});

test('confirms blur between fields of the same shadow host and when leaving it', async ({
    page,
}) => {
    const confirmations: ControlSnapshot[][] = [];
    let mounted = false;

    page.on('console', (message) => {
        if (message.text().startsWith('[Input inspector] 3.')) {
            mounted =
                JSON.parse(message.text().split('\n').slice(1).join('\n')).logical.after
                    .state.value === 'Ready';
        }

        if (message.text().startsWith('[Input inspector] 4.')) {
            confirmations.push(
                JSON.parse(message.text().split('\n').slice(1).join('\n')),
            );
        }
    });
    await page.goto('/input-inspector');
    await expect(page.locator('#inspected-name')).toBeVisible();
    await installShadowControls(page, 'app-input-inspector > div');
    // Wait for a published snapshot containing the newly mounted controls before editing them.
    await page.locator('#inspected-name').fill('Ready');
    await expect.poll(() => mounted).toBe(true);
    await page.locator('#shadow-name').fill('First answer');
    await page.locator('#shadow-note').focus();
    await expect
        .poll(
            () =>
                confirmations[confirmations.length - 1]?.find(
                    (control) => control.locatorHints.id === 'shadow-name',
                )?.state.value,
        )
        .toBe('First answer');
    await page.locator('#shadow-note').fill('Second answer');
    await page.locator('#inspected-name').focus();
    await expect
        .poll(
            () =>
                confirmations[confirmations.length - 1]?.find(
                    (control) => control.locatorHints.id === 'shadow-note',
                )?.state.value,
        )
        .toBe('Second answer');
});

test('updates shadow controls in a shared microfrontend without scanning siblings', async ({
    page,
}) => {
    await page.goto('/controls?fixture=microfrontends');
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    await installShadowControls(page, '#mf-profile');
    const areas = async (): Promise<MicrofrontendSnapshot[]> =>
        JSON.parse((await page.getByTestId('mf-json').textContent()) ?? '[]');

    await expect
        .poll(async () =>
            (await areas())
                .flatMap((area) => area.logicalControls)
                .some((control) => control.locatorHints.id === 'shadow-name'),
        )
        .toBe(true);
    await page.waitForTimeout(800);
    const before = await areas();

    await page.locator('#shadow-name').fill('Shared update');
    await expect
        .poll(
            async () =>
                (await areas())
                    .flatMap((area) => area.logicalControls)
                    .find((control) => control.locatorHints.id === 'shadow-name')?.state
                    .value,
        )
        .toBe('Shared update');

    for (const area of await areas()) {
        if (
            !area.logicalControls.some(
                (control) => control.locatorHints.id === 'shadow-name',
            )
        ) {
            expect(area.scanCount).toBe(
                before.find((previous) => previous.id === area.id)!.scanCount,
            );
        }
    }
});
