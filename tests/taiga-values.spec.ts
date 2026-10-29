import {expect, type Page, test} from '@playwright/test';

import {type ControlSnapshot} from '../libs/training-observer/models/src/control-snapshot';

async function controls(page: Page): Promise<readonly ControlSnapshot[]> {
    return JSON.parse(
        (await page.getByTestId('taiga-controls-json').textContent()) ?? '[]',
    );
}

async function value(page: Page, id: string): Promise<ControlSnapshot['state']['value']> {
    return (await controls(page)).find((control) => control.locatorHints.id === id)?.state
        .value;
}

test('real Taiga date/time and both multi-select renderings publish displayed values without extra native duplicates', async ({
    page,
}) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/taiga-values');
    await expect.poll(async () => value(page, 'taiga-date')).toBe('29.10.2026');
    await expect.poll(async () => value(page, 'taiga-time')).toBe('12:30');
    await expect
        .poll(async () => value(page, 'taiga-multiple'))
        .toEqual(['First, with comma', 'Second']);
    await expect
        .poll(async () => value(page, 'taiga-tags'))
        .toEqual(['First, with comma', 'Second']);
    await expect.poll(async () => (await controls(page)).length).toBe(5);
    const captured = await controls(page);

    expect(
        captured.find((control) => control.locatorHints.id === 'taiga-time')?.state
            .readOnly,
    ).toBe(true);
    expect(
        captured.find((control) => control.locatorHints.id === 'taiga-password')?.state,
    ).toMatchObject({redacted: true});
    expect(
        captured.find((control) => control.locatorHints.id === 'taiga-password')?.state
            .value,
    ).toBeUndefined();
    await expect(page.getByTestId('taiga-controls-json')).not.toContainText(
        'not-for-snapshots',
    );
    expect(errors).toEqual([]);
});

test('real Taiga model updates, disabling and clearing refresh snapshots without polling', async ({
    page,
}) => {
    await page.goto('/taiga-values');
    await expect
        .poll(async () => value(page, 'taiga-multiple'))
        .toEqual(['First, with comma', 'Second']);
    await page.getByRole('button', {name: 'Обновить значения', exact: true}).click();
    await expect.poll(async () => value(page, 'taiga-date')).toBe('30.10.2026');
    await expect.poll(async () => value(page, 'taiga-time')).toBe('15:45');
    await expect
        .poll(async () => value(page, 'taiga-multiple'))
        .toEqual(['Updated, with comma', 'Third']);
    await expect
        .poll(async () => value(page, 'taiga-tags'))
        .toEqual(['Updated, with comma', 'Third']);
    await page.getByRole('button', {name: 'Переключить блокировку', exact: true}).click();
    await expect
        .poll(
            async () =>
                (await controls(page)).find(
                    (control) => control.locatorHints.id === 'taiga-multiple',
                )?.state.disabled,
        )
        .toBe(true);
    await page.getByRole('button', {name: 'Очистить значения', exact: true}).click();
    await expect.poll(async () => value(page, 'taiga-multiple')).toEqual([]);
    await expect.poll(async () => value(page, 'taiga-tags')).toEqual([]);
    await expect.poll(async () => value(page, 'taiga-date')).toBe('');
    await expect.poll(async () => value(page, 'taiga-time')).toBe('');
});

test('an actual calendar dropdown adds no calendar controls to the observed field snapshots', async ({
    page,
}) => {
    await page.goto('/taiga-values');
    await expect.poll(async () => value(page, 'taiga-date')).toBe('29.10.2026');
    await page.locator('#taiga-date').click();
    await expect(page.locator('tui-calendar')).toBeVisible();
    await expect.poll(async () => (await controls(page)).length).toBe(5);
    expect((await controls(page)).map((control) => control.locatorHints.id)).toEqual([
        'taiga-date',
        'taiga-time',
        'taiga-multiple',
        'taiga-tags',
        'taiga-password',
    ]);
});
