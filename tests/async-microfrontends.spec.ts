import {expect, type Page, test} from '@playwright/test';

import {type MicrofrontendSnapshot} from '../libs/training-observer/src';

// Tracing itself reads input properties and would interfere with the polling leak probe.
test.use({trace: 'off'});

async function areas(page: Page): Promise<MicrofrontendSnapshot[]> {
    return JSON.parse((await page.getByTestId('async-mf-json').textContent()) ?? '[]');
}

async function area(
    page: Page,
    name: string,
): Promise<MicrofrontendSnapshot | undefined> {
    return (await areas(page)).find((item) => item.name === name);
}

function rootAttribute(item: MicrofrontendSnapshot, name: string): string | undefined {
    const snapshot = item.snapshot;
    const root = snapshot?.rootId ? snapshot.nodes[snapshot.rootId] : undefined;

    return root?.kind === 'element' ? root.attributes[name] : undefined;
}

async function settle(page: Page): Promise<void> {
    // Let deferred capture and one native-property reconciliation interval finish.
    await page.waitForTimeout(800);
}

async function expectUnchanged(
    page: Page,
    before: readonly MicrofrontendSnapshot[],
    names: readonly string[],
): Promise<void> {
    for (const name of names) {
        const previous = before.find((item) => item.name === name)!;
        const current = (await area(page, name))!;

        expect(current.id).toBe(previous.id);
        expect(current.scanCount).toBe(previous.scanCount);
        expect(current.revision).toBe(previous.revision);
    }
}

test.beforeEach(async ({page}) => {
    await page.goto('/microfrontends');
    await expect(page.getByTestId('async-mf-count')).toHaveText('3');
    await expect(page.getByTestId('async-mf-ready-count')).toHaveText('3');
    await settle(page);
});

test('staged mount publishes loading roots and later controls in the same instances', async ({
    page,
}) => {
    await page
        .getByRole('button', {name: 'Повторить загрузку всех', exact: true})
        .click();
    await expect(page.getByTestId('async-mf-count')).toHaveText('0');
    await expect(page.locator('#async-mf-profile')).toHaveAttribute('aria-busy', 'true');
    await expect
        .poll(async () => (await area(page, 'profile'))?.logicalControls.length)
        .toBe(0);
    const loading = (await area(page, 'profile'))!;

    expect(rootAttribute(loading, 'data-microfrontend-name')).toBe('profile');
    expect(rootAttribute(loading, 'data-load-state')).toBe('loading');
    expect(rootAttribute(loading, 'aria-busy')).toBe('true');
    await expect(page.getByTestId('async-mf-count')).toHaveText('3');
    await expect(page.getByTestId('async-mf-ready-count')).toHaveText('3');
    const ready = (await area(page, 'profile'))!;

    expect(ready.id).toBe(loading.id);
    expect(ready.revision).toBeGreaterThan(loading.revision);
    expect(rootAttribute(ready, 'data-load-state')).toBe('ready');
    expect(rootAttribute(ready, 'aria-busy')).toBe('false');
    expect(ready.logicalControls.map((control) => control.locatorHints.id)).toEqual([
        'async-profile-name',
        'async-profile-department',
    ]);
});

test('input and silent property changes update only the owning microfrontend', async ({
    page,
}) => {
    const expectedIds = {
        profile: ['async-profile-name', 'async-profile-department'],
        employment: [
            'async-employment-comment',
            'async-employment-days',
            'async-employment-practice',
        ],
        review: ['async-review-comment', 'async-review-approved'],
    };

    for (const [name, ids] of Object.entries(expectedIds)) {
        const item = (await area(page, name))!;

        expect(item.error).toBeNull();
        expect(item.logicalControls.map((control) => control.locatorHints.id)).toEqual(
            ids,
        );
    }

    const beforeInput = await areas(page);

    await page.locator('#async-profile-name').fill('Изменение profile');
    await expect
        .poll(
            async () =>
                (await area(page, 'profile'))?.logicalControls.find(
                    (control) => control.locatorHints.id === 'async-profile-name',
                )?.state.value,
        )
        .toBe('Изменение profile');
    await settle(page);
    expect((await area(page, 'profile'))!.revision).toBeGreaterThan(
        beforeInput.find((item) => item.name === 'profile')!.revision,
    );
    await expectUnchanged(page, beforeInput, ['employment', 'review']);

    const beforeProperty = await areas(page);

    await page.locator('#async-employment-days').evaluate((input: HTMLInputElement) => {
        input.value = '17';
    });
    await expect
        .poll(
            async () =>
                (await area(page, 'employment'))?.logicalControls.find(
                    (control) => control.locatorHints.id === 'async-employment-days',
                )?.state.value,
        )
        .toBe('17');
    await settle(page);
    await expectUnchanged(page, beforeProperty, ['profile', 'review']);
});

test('disabled state and dynamically inserted fields refresh the existing owner', async ({
    page,
}) => {
    const before = await areas(page);
    const original = (await area(page, 'profile'))!;

    await page.getByRole('button', {name: 'Заблокировать profile', exact: true}).click();
    await expect
        .poll(async () =>
            (await area(page, 'profile'))?.logicalControls.every(
                (control) => control.state.disabled,
            ),
        )
        .toBe(true);
    await page.getByRole('button', {name: 'Разблокировать profile', exact: true}).click();
    await page.getByRole('button', {name: 'Добавить поле profile', exact: true}).click();
    await expect
        .poll(async () =>
            (await area(page, 'profile'))?.logicalControls.some(
                (control) => control.locatorHints.id === 'async-profile-details',
            ),
        )
        .toBe(true);
    await settle(page);
    expect((await area(page, 'profile'))!.id).toBe(original.id);
    expect((await area(page, 'profile'))!.revision).toBeGreaterThan(original.revision);
    await expectUnchanged(page, before, ['employment', 'review']);
    await page.getByRole('button', {name: 'Убрать поле profile', exact: true}).click();
    await expect
        .poll(async () =>
            (await area(page, 'profile'))?.logicalControls.some(
                (control) => control.locatorHints.id === 'async-profile-details',
            ),
        )
        .toBe(false);
});

test('remount replaces instance identity and cancellation prevents stale loading callbacks', async ({
    page,
}) => {
    const original = (await area(page, 'profile'))!;
    const before = await areas(page);

    await page.getByRole('button', {name: 'Перезагрузить profile', exact: true}).click();
    await expect
        .poll(async () => (await area(page, 'profile'))?.id)
        .not.toBe(original.id);
    await expect(page.locator('#async-mf-profile')).toHaveAttribute('aria-busy', 'true');
    await expect
        .poll(async () => (await area(page, 'profile'))?.logicalControls.length)
        .toBe(0);
    await page.getByRole('button', {name: 'Удалить profile', exact: true}).click();
    await expect.poll(async () => area(page, 'profile')).toBeUndefined();
    // The cancelled ready callback was scheduled 900 ms after mounting.
    await page.waitForTimeout(1100);
    await expect(page.locator('#async-mf-profile')).toHaveCount(0);
    expect(await area(page, 'profile')).toBeUndefined();
    await expectUnchanged(page, before, ['employment', 'review']);

    await page.getByRole('button', {name: 'Загрузить profile', exact: true}).click();
    await expect(page.getByTestId('async-mf-ready-count')).toHaveText('3');
    const replacement = (await area(page, 'profile'))!;

    expect(replacement.id).not.toBe(original.id);
    expect((await areas(page)).some((item) => item.id === original.id)).toBe(false);
    expect(replacement.logicalControls).toHaveLength(2);

    await page
        .getByRole('button', {name: 'Повторить загрузку всех', exact: true})
        .click();
    await page.getByRole('button', {name: 'Удалить review', exact: true}).click();
    await expect(page.getByTestId('async-mf-ready-count')).toHaveText('2');
    // Includes the cancelled review mount (1600 ms) and its ready delay (900 ms).
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('async-mf-count')).toHaveText('2');
    await expect(page.locator('#async-mf-review')).toHaveCount(0);
});

test('new markers separate nested ownership while a name attribute alone stays inside its owner', async ({
    page,
}) => {
    const profile = (await area(page, 'profile'))!;

    await page
        .locator('#async-mf-profile')
        .evaluate((root) =>
            root.insertAdjacentHTML(
                'beforeend',
                '<div id="async-nested-root" data-microfrontend data-microfrontend-name="nested"><input id="async-nested-field" aria-label="Вложенное поле" value="Вложенное"></div><div data-microfrontend-name="name-only"><input id="async-name-only-field" aria-label="Обычное поле" value="Обычное"></div>',
            ),
        );
    await expect(page.getByTestId('async-mf-count')).toHaveText('4');
    const nested = (await area(page, 'nested'))!;

    expect(nested.parentId).toBe(profile.id);
    expect(nested.logicalControls.map((control) => control.locatorHints.id)).toEqual([
        'async-nested-field',
    ]);
    await expect
        .poll(async () =>
            (await area(page, 'profile'))?.logicalControls.map(
                (control) => control.locatorHints.id,
            ),
        )
        .toEqual([
            'async-profile-name',
            'async-profile-department',
            'async-name-only-field',
        ]);
    expect(await area(page, 'name-only')).toBeUndefined();

    await page
        .locator('#async-nested-root')
        .evaluate((root) => root.setAttribute('data-microfrontend-name', 'renamed'));
    await expect.poll(async () => (await area(page, 'renamed'))?.id).toBe(nested.id);
    expect(await area(page, 'nested')).toBeUndefined();
    await page
        .locator('#async-nested-root')
        .evaluate((root) => root.removeAttribute('data-microfrontend'));
    await expect(page.getByTestId('async-mf-count')).toHaveText('3');
    await expect
        .poll(async () =>
            (await area(page, 'profile'))?.logicalControls.some(
                (control) => control.locatorHints.id === 'async-nested-field',
            ),
        )
        .toBe(true);
});

test('stop freezes snapshots during loading, restart captures readiness, and destroy releases polling', async ({
    page,
}) => {
    await page.getByRole('button', {name: 'Перезагрузить profile', exact: true}).click();
    await expect
        .poll(async () => {
            const item = await area(page, 'profile');

            return item ? rootAttribute(item, 'aria-busy') : undefined;
        })
        .toBe('true');
    await page.getByRole('button', {name: 'Остановить наблюдение', exact: true}).click();
    const stopped = await areas(page);

    await expect(page.locator('#async-mf-profile')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#async-profile-name').fill('Пока наблюдение остановлено');
    await settle(page);
    expect(await areas(page)).toEqual(stopped);
    await page.getByRole('button', {name: 'Начать наблюдение', exact: true}).click();
    await expect
        .poll(
            async () =>
                (await area(page, 'profile'))?.logicalControls.find(
                    (control) => control.locatorHints.id === 'async-profile-name',
                )?.state.value,
        )
        .toBe('Пока наблюдение остановлено');

    await page.evaluate(() => {
        const root = document.createElement('div');
        const input = document.createElement('input');
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!;

        const probe = input as HTMLInputElement & {reads: number};

        root.setAttribute('data-microfrontend', '');
        root.setAttribute('data-microfrontend-name', 'lifecycle');
        input.id = 'async-lifecycle-input';
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
    await expect(page.getByTestId('async-mf-count')).toHaveText('4');
    await page
        .locator('tui-doc-navigation nav')
        .getByRole('link', {name: 'Контролы', exact: true})
        .click();
    await page.getByRole('button', {name: 'Остановить', exact: true}).click();
    const reads = await page
        .locator('#async-lifecycle-input')
        .evaluate((input) => (input as HTMLInputElement & {reads: number}).reads);

    await page.waitForTimeout(1200);
    expect(
        await page
            .locator('#async-lifecycle-input')
            .evaluate((input) => (input as HTMLInputElement & {reads: number}).reads),
    ).toBe(reads);
});
