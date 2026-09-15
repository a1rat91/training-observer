import {expect, type Page, test} from '@playwright/test';

import {type MicrofrontendSnapshot} from '../libs/training-observer/src';

test.use({trace: 'off'});

async function areas(page: Page): Promise<MicrofrontendSnapshot[]> {
    return JSON.parse((await page.getByTestId('mf-json').textContent()) ?? '[]');
}

async function area(page: Page, name: string): Promise<MicrofrontendSnapshot> {
    return (await areas(page)).find((item) => item.name === name)!;
}

async function scans(page: Page): Promise<Record<string, number>> {
    return Object.fromEntries(
        (await areas(page)).map((item) => [item.id, item.scanCount]),
    );
}

async function settle(page: Page): Promise<void> {
    // Longer than animation completion and one property reconciliation interval.
    await page.waitForTimeout(800);
}

test.beforeEach(async ({page}) => {
    await page.goto('/controls?fixture=microfrontends');
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    await settle(page);
});

test('discovers separate nested areas with complete references and no duplicated nested controls', async ({
    page,
}) => {
    const profile = await area(page, 'profile');
    const address = await area(page, 'address');

    expect(address.parentId).toBe(profile.id);
    expect(profile.logicalControls.map((control) => control.locatorHints.id)).toEqual([
        'mf-name',
    ]);
    expect(JSON.stringify(profile.snapshot)).not.toContain('mf-city');
    expect(address.logicalControls.map((control) => control.locatorHints.id)).toEqual([
        'mf-city',
    ]);

    for (const item of await areas(page)) {
        expect(item.error).toBeNull();
        const snapshot = item.snapshot!;

        for (const node of Object.values(snapshot.nodes)) {
            if (node.kind === 'element') {
                for (const id of node.children) {
                    expect(snapshot.nodes[id]?.parentId).toBe(node.id);
                }
            }
        }
    }
});

test('native properties, attributes and input in a nested area never scan its parent or sibling', async ({
    page,
}) => {
    const before = await scans(page);
    const address = await area(page, 'address');

    await page.locator('#mf-city').fill('Казань');
    await page.locator('#mf-city').evaluate((input: HTMLInputElement) => {
        input.value = 'Тула';
        input.setAttribute('data-updated', 'true');
    });
    await expect
        .poll(async () => (await area(page, 'address')).logicalControls[0].state.value)
        .toBe('Тула');
    await settle(page);

    for (const item of await areas(page)) {
        if (item.id !== address.id) {
            expect(item.scanCount).toBe(before[item.id]);
        }
    }

    await page.locator('#mf-city').evaluate((input: HTMLInputElement) => {
        input.value = 'Омск';
    });
    await expect
        .poll(async () => (await area(page, 'address')).logicalControls[0].state.value)
        .toBe('Омск');
    expect((await area(page, 'profile')).scanCount).toBe(
        before[(await area(page, 'profile')).id],
    );
});

test('mutations outside every area and observer UI do not scan areas', async ({page}) => {
    const before = await scans(page);

    await page.evaluate(() => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="unowned">Снаружи<input value="a"></div>',
        );
        document.querySelector('#unowned')!.setAttribute('data-counter', '1');
    });
    await page.getByRole('button', {name: /employment ·/}).click();
    await settle(page);
    expect(await scans(page)).toEqual(before);
});

test('a real Taiga dropdown belongs only to the employment area', async ({page}) => {
    // Taiga lazily installs shared styles on first open. Those may affect every area.
    await page.locator('#mf-department').click();
    await expect(
        page.getByRole('option', {name: 'Разработка', exact: true}),
    ).toBeVisible();
    await page.locator('#mf-department').press('Escape');
    await expect(page.getByRole('option')).toHaveCount(0);
    await settle(page);
    const before = await scans(page);

    await page.locator('#mf-department').click();
    await expect
        .poll(
            async () =>
                (await area(page, 'employment')).logicalControls[0].choice?.popup.options
                    .length,
        )
        .toBe(3);
    expect((await area(page, 'employment')).snapshot!.relatedRootIds).toHaveLength(1);
    expect((await area(page, 'profile')).snapshot!.relatedRootIds).toEqual([]);
    await page.getByRole('option', {name: 'Поддержка', exact: true}).click();
    await expect
        .poll(
            async () =>
                (await area(page, 'employment')).logicalControls[0].choice?.displayValue,
        )
        .toBe('Поддержка');
    await settle(page);

    for (const name of ['profile', 'address']) {
        const item = await area(page, name);

        expect(item.scanCount).toBe(before[item.id]);
    }
});

test('an asynchronously mounted popup and its silent properties update only its owner', async ({
    page,
}) => {
    await page
        .locator('#mf-profile')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<input id="async-trigger" tuiInput role="combobox" aria-expanded="true" aria-haspopup="dialog" aria-controls="async-popup">',
            ),
        );
    await expect
        .poll(
            async () =>
                (await area(page, 'profile')).logicalControls.find(
                    (control) => control.locatorHints.id === 'async-trigger',
                )?.popup?.status,
        )
        .toBe('unresolved');
    const sibling = await area(page, 'employment');

    await page.evaluate(() =>
        document.body.insertAdjacentHTML(
            'beforeend',
            '<div id="async-popup" role="dialog"><input id="async-value" value="Первый"></div>',
        ),
    );
    await expect
        .poll(
            async () =>
                (await area(page, 'profile')).logicalControls.find(
                    (control) => control.locatorHints.id === 'async-value',
                )?.state.value,
        )
        .toBe('Первый');
    await page.locator('#async-value').evaluate((input: HTMLInputElement) => {
        input.value = 'Без события';
    });
    await expect
        .poll(
            async () =>
                (await area(page, 'profile')).logicalControls.find(
                    (control) => control.locatorHints.id === 'async-value',
                )?.state.value,
        )
        .toBe('Без события');
    await page.locator('#async-popup').evaluate((node) => node.remove());
    await expect
        .poll(async () => (await area(page, 'profile')).snapshot!.relatedRootIds)
        .toEqual([]);
    expect((await area(page, 'employment')).scanCount).toBe(sibling.scanCount);
});

test('duplicate names, mount/unmount and replacement keep instance identity separate', async ({
    page,
}) => {
    const original = await area(page, 'profile');

    await page.getByRole('button', {name: 'Добавить микрофронт', exact: true}).click();
    await expect(page.getByTestId('mf-count')).toHaveText('4');
    const duplicates = (await areas(page)).filter((item) => item.name === 'profile');

    expect(new Set(duplicates.map((item) => item.id)).size).toBe(2);
    const extraId = duplicates.find((item) => item.id !== original.id)!.id;

    await page.getByRole('button', {name: 'Удалить дополнительный', exact: true}).click();
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    expect((await areas(page)).some((item) => item.id === extraId)).toBe(false);
    const addressId = (await area(page, 'address')).id;

    await page
        .locator('#mf-address')
        .evaluate((node) => node.replaceWith(node.cloneNode(true)));
    await expect.poll(async () => (await area(page, 'address')).id).not.toBe(addressId);
    expect((await area(page, 'address')).scanCount).toBe(1);
    expect((await area(page, 'profile')).id).toBe(original.id);
});

test('adding and removing a data-mf marker transfers content between parent and child', async ({
    page,
}) => {
    await page
        .locator('#mf-profile')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<div id="new-boundary"><input id="transferred" value="Вложенное поле"></div>',
            ),
        );
    await expect
        .poll(async () =>
            (await area(page, 'profile')).logicalControls.some(
                (control) => control.locatorHints.id === 'transferred',
            ),
        )
        .toBe(true);
    await page
        .locator('#new-boundary')
        .evaluate((root) => root.setAttribute('data-mf', 'transfer'));
    await expect(page.getByTestId('mf-count')).toHaveText('4');
    await expect
        .poll(async () =>
            (await area(page, 'profile')).logicalControls.some(
                (control) => control.locatorHints.id === 'transferred',
            ),
        )
        .toBe(false);
    expect((await area(page, 'transfer')).logicalControls[0].state.value).toBe(
        'Вложенное поле',
    );
    await page
        .locator('#new-boundary')
        .evaluate((root) => root.removeAttribute('data-mf'));
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    await expect
        .poll(async () =>
            (await area(page, 'profile')).logicalControls.some(
                (control) => control.locatorHints.id === 'transferred',
            ),
        )
        .toBe(true);
});

test('moving a regular control updates both owners', async ({page}) => {
    await page.evaluate(() =>
        document
            .querySelector('#mf-address')!
            .append(document.querySelector('#mf-comment')!),
    );
    await expect
        .poll(async () =>
            (await area(page, 'address')).logicalControls.some(
                (control) => control.locatorHints.id === 'mf-comment',
            ),
        )
        .toBe(true);
    await expect
        .poll(async () =>
            (await area(page, 'employment')).logicalControls.some(
                (control) => control.locatorHints.id === 'mf-comment',
            ),
        )
        .toBe(false);
});

test('ignore boundaries remove descendant registrations and allow rediscovery', async ({
    page,
}) => {
    await page
        .locator('#mf-profile')
        .evaluate((root) => root.setAttribute('data-training-observer-ignore', ''));
    await expect(page.getByTestId('mf-count')).toHaveText('1');
    await page
        .locator('#mf-profile')
        .evaluate((root) => root.removeAttribute('data-training-observer-ignore'));
    await expect(page.getByTestId('mf-count')).toHaveText('3');
    expect((await area(page, 'address')).parentId).toBe((await area(page, 'profile')).id);
});

test('external labels and common ancestor styles invalidate dependent areas', async ({
    page,
}) => {
    await page.evaluate(() => {
        document.body.insertAdjacentHTML(
            'beforeend',
            '<span id="external-mf-label">Исходная подпись</span>',
        );
        document
            .querySelector('#mf-comment')!
            .setAttribute('aria-labelledby', 'external-mf-label');
    });
    await expect
        .poll(
            async () =>
                (await area(page, 'employment')).logicalControls.find(
                    (control) => control.locatorHints.id === 'mf-comment',
                )?.label,
        )
        .toBe('Исходная подпись');
    const before = await scans(page);

    await page.locator('#external-mf-label').evaluate((node) => {
        node.textContent = 'Новая подпись';
    });
    await expect
        .poll(
            async () =>
                (await area(page, 'employment')).logicalControls.find(
                    (control) => control.locatorHints.id === 'mf-comment',
                )?.label,
        )
        .toBe('Новая подпись');
    expect((await area(page, 'profile')).scanCount).toBe(
        before[(await area(page, 'profile')).id],
    );
    await page.locator('.examples').evaluate((node: HTMLElement) => {
        node.style.opacity = '0';
    });
    await expect
        .poll(async () =>
            (await areas(page)).every((item) =>
                item.logicalControls.every((control) => !control.visible),
            ),
        )
        .toBe(true);
});

test('shared stylesheet insertion and delayed load refresh all areas', async ({page}) => {
    let releaseStyles!: () => void;
    const ready = new Promise<void>((resolve) => {
        releaseStyles = resolve;
    });

    await page.route('**/mf-delayed.css', async (route) => {
        await ready;
        await route.fulfill({contentType: 'text/css', body: '.examples { opacity: 0; }'});
    });
    const before = await scans(page);

    await page.evaluate(() => {
        const link = document.createElement('link');

        link.rel = 'stylesheet';
        link.href = '/mf-delayed.css';
        document.head.append(link);
    });
    await expect
        .poll(async () =>
            (await areas(page)).every((item) => item.scanCount > before[item.id]),
        )
        .toBe(true);
    // Complete loading after the insertion batch, without any further DOM mutation.
    await settle(page);
    expect(
        (await areas(page)).every((item) =>
            item.logicalControls.some((control) => control.visible),
        ),
    ).toBe(true);
    releaseStyles();
    await expect
        .poll(async () =>
            (await areas(page)).every((item) =>
                item.logicalControls.every((control) => !control.visible),
            ),
        )
        .toBe(true);
});

test('polling can be disabled while delegated input still works; stop retains snapshots', async ({
    page,
}) => {
    await page.getByLabel('Сверка свойств, мс').fill('0');
    await page.getByRole('button', {name: 'Применить интервал', exact: true}).click();
    await settle(page);
    await page.locator('#mf-city').evaluate((input: HTMLInputElement) => {
        input.value = 'Без события';
    });
    await settle(page);
    expect((await area(page, 'address')).logicalControls[0].state.value).toBe('Москва');
    await page.locator('#mf-city').dispatchEvent('input');
    await expect
        .poll(async () => (await area(page, 'address')).logicalControls[0].state.value)
        .toBe('Без события');
    await page.getByRole('button', {name: 'Остановить области', exact: true}).click();
    const before = await areas(page);

    await page.locator('#mf-city').fill('После остановки');
    await page.getByRole('button', {name: 'Добавить микрофронт', exact: true}).click();
    await settle(page);
    expect(await areas(page)).toEqual(before);
    await page
        .getByRole('button', {name: 'Начать наблюдение областей', exact: true})
        .click();
    await expect(page.getByTestId('mf-count')).toHaveText('4');
    expect((await area(page, 'address')).logicalControls[0].state.value).toBe(
        'После остановки',
    );
});

test('DestroyRef releases property reads for a still-connected external area', async ({
    page,
}) => {
    await page.evaluate(() => {
        const root = document.createElement('section');

        root.setAttribute('data-mf', 'lifecycle');
        const input = document.createElement('input');

        input.id = 'lifecycle-input';
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!;

        const probe = input as HTMLInputElement & {reads: number};

        probe.reads = 0;
        Object.defineProperty(input, 'value', {
            configurable: true,
            get() {
                probe.reads++;

                return descriptor.get!.call(input);
            },
            set(value: string) {
                descriptor.set!.call(input, value);
            },
        });
        root.append(input);
        document.body.append(root);
    });
    await expect(page.getByTestId('mf-count')).toHaveText('4');
    await page
        .locator('tui-doc-navigation nav')
        .getByRole('link', {name: 'Контролы', exact: true})
        .click();
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    await page.locator('#lifecycle-input').evaluate((input: HTMLInputElement) => {
        input.value = 'После destroy';
    });
    const reads = await page
        .locator('#lifecycle-input')
        .evaluate((input) => (input as HTMLInputElement & {reads: number}).reads);

    await page.waitForTimeout(1200);
    expect(
        await page
            .locator('#lifecycle-input')
            .evaluate((input) => (input as HTMLInputElement & {reads: number}).reads),
    ).toBe(reads);
});
