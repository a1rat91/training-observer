import {readFile} from 'node:fs/promises';

import {expect, test} from '@playwright/test';

// Report route stays independent of the executable measurement suite.
test('benchmark route shows measured results and downloads the full report', async ({
    page,
}) => {
    await page.goto('/spike/benchmark');
    await expect(
        page.getByRole('heading', {
            name: 'Benchmark восстановления элементов',
            exact: true,
        }),
    ).toBeVisible();
    const table = page.getByRole('table', {name: 'Сравнение методов', exact: true});

    await expect(table).toContainText('resolver-v2');
    await expect(table).toContainText('368/369');
    await expect(
        page.getByRole('table', {name: 'Динамическая процедура', exact: true}),
    ).toContainText('after-replace');
    const pending = page.waitForEvent('download');

    await page.getByRole('link', {name: 'Полный JSON', exact: true}).click();
    const report = JSON.parse(await readFile(await (await pending).path(), 'utf8')) as {
        rows: unknown[];
        dynamic: {rows: unknown[]};
    };

    expect(report.rows).toHaveLength(2380);
    expect(report.dynamic.rows.length).toBeGreaterThan(0);
    await page.screenshot({
        path: test.info().outputPath('benchmark.png'),
        fullPage: true,
    });
});
