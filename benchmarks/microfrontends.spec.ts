import {writeFile} from 'node:fs/promises';
import {expect, test, type CDPSession, type Page, type TestInfo} from '@playwright/test';

async function saveArtifact(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
    const path = testInfo.outputPath(name);
    await writeFile(path, JSON.stringify(value, null, 2));
    await testInfo.attach(name, {path, contentType: 'application/json'});
}

async function counters(page: Page): Promise<Record<string, number>> {
    return page.locator('.area-status').evaluateAll((rows) => Object.fromEntries(rows.map((row) =>
        [row.getAttribute('data-name')!, Number(row.getAttribute('data-scans'))])));
}

async function metrics(client: CDPSession): Promise<Record<string, number>> {
    const result = await client.send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.map((item) => [item.name, item.value]));
}

async function measure(client: CDPSession, action: () => Promise<void>) {
    const before = await metrics(client);
    const start = performance.now();
    await action();
    const after = await metrics(client);
    const milliseconds = (key: string): number => Math.round((after[key] - before[key]) * 1000);
    return {
        elapsedMs: Math.round(performance.now() - start),
        // Chrome main-thread time, including the small counter UI and test DOM reads.
        taskMs: milliseconds('TaskDuration'),
        scriptMs: milliseconds('ScriptDuration'),
        layoutMs: milliseconds('LayoutDuration'),
        styleMs: milliseconds('RecalcStyleDuration'),
    };
}

for (const {count, mixed} of [{count: 10, mixed: true}, {count: 100, mixed: false}, {count: 300, mixed: false}]) {
    test(`${count} dynamic areas retain isolated updates and release replaced roots`, async ({page}, testInfo) => {
        const client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');
        await page.goto(`/load?count=${count}&polling=0&mixed=${Number(mixed)}`);
        await expect(page.getByTestId('load-count')).toHaveText(String(count));
        const controls = mixed ? 470 : count * 5;
        await expect(page.getByTestId('load-controls')).toHaveText(String(controls));
        await page.waitForTimeout(1000);
        const report: Record<string, unknown> = {count, controls, fixture: mixed ? 'mixed' : 'uniform', browser: page.context().browser()!.version()};
        report['nodes'] = Number(await page.getByTestId('load-nodes').textContent());

        report['restart'] = await measure(client, async () => {
            await page.getByRole('button', {name: 'Перезапустить', exact: true}).click();
            await expect(page.getByTestId('load-scans')).toHaveText(String(count));
        });
        report['synchronousStartMs'] = Number((await page.getByTestId('load-start-ms').textContent())!.replaceAll(',', ''));
        await page.waitForTimeout(800);

        let before = await counters(page);
        report['idleWithoutPolling'] = await measure(client, () => page.waitForTimeout(1600));
        expect(await counters(page)).toEqual(before);

        await page.getByLabel('Сверка свойств, мс').fill('500');
        await page.getByRole('button', {name: 'Перезапустить', exact: true}).click();
        await page.waitForTimeout(800);
        before = await counters(page);
        report['idleWithPolling'] = await measure(client, () => page.waitForTimeout(1600));
        expect(await counters(page)).toEqual(before);

        report['singleAreaBurst'] = await measure(client, async () => {
            await page.locator('#load-1-0').evaluate((input: HTMLInputElement) => {
                input.value = 'Пакет';
                for (let i = 0; i < 200; i++) input.setAttribute('data-version', String(i));
                input.dispatchEvent(new Event('input', {bubbles: true}));
            });
            await expect(page.locator('.area-status[data-name="load-1"]')).toHaveAttribute('data-value', 'Пакет');
        });
        await page.waitForTimeout(800);
        expect(await counters(page)).toEqual({...before, 'load-1': before['load-1'] + 1});

        if (mixed) {
            before = await counters(page);
            report['largeAreaUpdate'] = await measure(client, async () => {
                await page.locator('#load-6-0').evaluate((input: HTMLInputElement) => {
                    input.value = 'Большая форма';
                    input.dispatchEvent(new Event('input', {bubbles: true}));
                });
                await expect(page.locator('.area-status[data-name="load-6"]')).toHaveAttribute('data-value', 'Большая форма');
            });
            await page.waitForTimeout(800);
            expect(await counters(page)).toEqual({...before, 'load-6': before['load-6'] + 1});
        }

        before = await counters(page);
        report['continuousSingleArea'] = await measure(client, async () => {
            await page.locator('#load-1-0').evaluate(async (input: HTMLInputElement) => {
                await new Promise<void>((resolve) => {
                    let tick = 0;
                    const timer = setInterval(() => {
                        input.value = `tick-${++tick}`;
                        input.setAttribute('data-version', String(tick));
                        if (tick === 20) { clearInterval(timer); resolve(); }
                    }, 25);
                });
            });
            await expect(page.locator('.area-status[data-name="load-1"]')).toHaveAttribute('data-value', 'tick-20');
        });
        await page.waitForTimeout(800);
        const continuous = await counters(page);
        const continuousScans = continuous['load-1'] - before['load-1'];
        expect(continuousScans).toBeGreaterThan(1);
        expect(continuousScans).toBeLessThan(20);
        expect(continuous).toEqual({...before, 'load-1': continuous['load-1']});
        report['continuousScans'] = continuousScans;

        before = await counters(page);
        report['allAreasBurst'] = await measure(client, async () => {
            await page.locator('[data-mf] input[tuiInput]').evaluateAll((inputs) => {
                for (const input of inputs) {
                    (input as HTMLInputElement).value = 'Массовое';
                    input.setAttribute('data-version', 'mass');
                }
            });
            await expect(page.locator('.area-status[data-value="Массовое"]')).toHaveCount(count);
        });
        await page.waitForTimeout(800);
        expect(await counters(page)).toEqual(Object.fromEntries(Object.entries(before).map(([name, scans]) => [name, scans + 1])));

        before = await counters(page);
        const replacementCount = Math.min(30, count);
        report['replacementCount'] = replacementCount;
        report['replaceRoots'] = await measure(client, async () => {
            await page.getByRole('button', {name: 'Заменить первые 30', exact: true}).click();
            await expect(page.locator(`.area-status[data-name="load-${count + replacementCount}"]`)).toHaveCount(1);
            await expect(page.getByTestId('load-count')).toHaveText(String(count));
        });
        await page.waitForTimeout(800);
        const replaced = await counters(page);
        for (let id = 1; id <= replacementCount; id++) expect(replaced[`load-${id}`]).toBeUndefined();
        for (let id = replacementCount + 1; id <= count; id++) expect(replaced[`load-${id}`]).toBe(before[`load-${id}`]);
        expect(Object.keys(replaced)).toHaveLength(count);

        await page.getByRole('button', {name: 'Остановить', exact: true}).click();
        before = await counters(page);
        report['stopped'] = await measure(client, async () => {
            await page.locator('[data-mf] input').evaluateAll((inputs) => {
                for (const input of inputs) (input as HTMLInputElement).value = 'После stop';
            });
            await page.waitForTimeout(1100);
        });
        expect(await counters(page)).toEqual(before);
        await expect(page.getByTestId('load-errors')).toHaveText('0');
        await saveArtifact(testInfo, 'load-results.json', report);
        console.log(JSON.stringify(report));
    });
}

test('CPU profile of simultaneous updates in 300 areas', async ({page}, testInfo) => {
    await page.goto('/load?count=300&polling=0');
    await expect(page.getByTestId('load-controls')).toHaveText('1500');
    await page.waitForTimeout(1000);
    const client = await page.context().newCDPSession(page);
    await client.send('Profiler.enable');
    await client.send('Profiler.start');
    await page.locator('[data-mf] input[tuiInput]').evaluateAll((inputs) => {
        for (const input of inputs) {
            (input as HTMLInputElement).value = 'Профиль CPU';
            input.setAttribute('data-version', 'profile');
        }
    });
    await expect(page.locator('.area-status[data-value="Профиль CPU"]')).toHaveCount(300);
    const {profile} = await client.send('Profiler.stop');
    await saveArtifact(testInfo, 'mass-update.cpuprofile', profile);

    // Exclusive sampled time: this locates candidates, not exact per-method timings.
    const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
    const sampled = new Map<string, number>();
    for (const [index, id] of (profile.samples ?? []).entries()) {
        const frame = frames.get(id)!;
        const name = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').at(-1) ?? ''}:${frame.lineNumber + 1}`;
        sampled.set(name, (sampled.get(name) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
    }
    const hottest = [...sampled].sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([frame, microseconds]) => ({frame, sampledMs: Math.round(microseconds / 1000)}));
    await saveArtifact(testInfo, 'cpu-summary.json', hottest);
    console.log(JSON.stringify({profile: hottest}));
});
