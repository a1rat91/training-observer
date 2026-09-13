import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import less from 'less';
import {targets, variants, expected, mutate} from './matrix.mjs';
import {classify, csv, percentile, summarize} from './metrics.mjs';

const output = resolve('dist/spike-benchmark');
await mkdir(output, {recursive: true});
for (const [name, path] of Object.entries({
    fixture: 'scripts/spike-benchmark/fixture.mjs',
    browser: 'scripts/spike-benchmark/browser.mjs',
    libraries: 'scripts/spike-research/libraries.mjs',
})) {
    await build({
        entryPoints: [path],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        outfile: `${output}/${name}.js`,
        logLevel: 'warning',
    });
}
const theme = resolve('node_modules/@taiga-ui/core/styles/taiga-ui-theme.less');
await writeFile(`${output}/styles.css`, (await less.render(await readFile(theme, 'utf8'), {filename: theme})).css);
const html =
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><research-fixture></research-fixture><script type="module" src="/fixture.js"></script></body></html>';
const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') return res.setHeader('Content-Type', 'text/html; charset=utf-8').end(html);
    const allowed = ['/fixture.js', '/browser.js', '/libraries.js', '/styles.css'];
    try {
        const file = allowed.includes(pathname)
            ? `${output}${pathname}`
            : /^\/assets\/taiga-ui\/icons\/[\w-]+\.svg$/.test(pathname)
              ? resolve('node_modules/@taiga-ui/icons/src', pathname.split('/').pop())
              : null;
        if (!file) return res.writeHead(404).end();
        res.setHeader(
            'Content-Type',
            pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript',
        );
        res.end(await readFile(file));
    } catch (error) {
        res.writeHead(500).end(String(error));
    }
});
await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
});
const url = `http://127.0.0.1:${server.address().port}`;
const libraries = ['resolver-v2', 'finder-default', 'finder-filtered', 'dom-to-locator', 'mizchi'];
const rows = [];
let browser;
try {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
    const errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(error.message);
    });
    await page.goto(url);
    await page.locator('input[name=quantity]').waitFor();
    await inject(page);
    const recorded = [];
    for (const target of targets) {
        const locator = page.locator(target.selector);
        assert.equal(await locator.count(), 1, `Oracle fixture: ${target.id}`);
        const generated = {};
        for (const library of libraries) {
            generated[library] = await locator.evaluate((element, library) => {
                if (library !== 'resolver-v2') return window.researchLibraries.generate(library, element);
                try {
                    return window.benchmark.describe(element, document.querySelector('main'));
                } catch (error) {
                    return {error: String(error)};
                }
            }, library);
        }
        recorded.push({id: target.id, generated});
        console.info(`Recorded: ${target.id}`);
    }
    assert.deepEqual(errors, [], 'Live Angular/Taiga fixture has no errors');
    const provenance = await page.evaluate(() => window.researchLibraries.provenance);
    await writeFile(`${output}/recorded.json`, JSON.stringify(recorded, null, 2) + '\n');
    const saved = JSON.parse(await readFile(`${output}/recorded.json`, 'utf8'));
    const snapshot = (await page.content())
        .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replaceAll('href="/styles.css"', `href="${url}/styles.css"`);
    await page.close();
    // Recording document destroyed. Only JSON and rendered HTML cross into fresh documents.
    for (const variant of variants) {
        const pupil = await browser.newPage({viewport: {width: 1440, height: 1100}});
        await pupil.route(`${url}/`, (route) => route.fulfill({contentType: 'text/html', body: snapshot}));
        await pupil.goto(url);
        await pupil.addScriptTag({url: `${url}/browser.js`, type: 'module'});
        await pupil.waitForFunction(() => !!window.benchmark);
        const elements = [];
        for (const target of targets) elements.push(await pupil.locator(target.selector).elementHandle());
        await pupil.evaluate(mutate, {variant, elements});
        for (const [index, target] of targets.entries()) {
            for (const library of libraries) {
                const generated = saved[index].generated[library];
                const expectation = expected(target, variant);
                const row = {variant, id: target.id, split: target.split, library, expected: expectation};
                if (generated.error) {
                    rows.push({...row, outcome: 'generation-error', error: generated.error});
                    continue;
                }
                try {
                    if (library === 'resolver-v2') {
                        const result = await pupil.evaluate(
                            ({descriptor, oracle}) => {
                                const result = window.benchmark.resolve(descriptor, document.querySelector('main'));
                                return {
                                    report: result.report,
                                    same: result.element === oracle,
                                    durationMs: result.durationMs,
                                    queriedControlCount: result.queriedControlCount,
                                };
                            },
                            {descriptor: generated.descriptor, oracle: elements[index]},
                        );
                        const outcome =
                            result.report.status === 'resolved'
                                ? classify({count: 1, same: result.same, eligible: expectation === 'eligible'})
                                : result.report.status;
                        rows.push({
                            ...row,
                            outcome,
                            ...result,
                            strategy: result.report.strategy,
                            reason: result.report.reason,
                        });
                    } else {
                        const start = performance.now();
                        const locator = pupil.locator(generated.selector);
                        const count = await locator.count();
                        const same =
                            count === 1 && (await locator.evaluate((node, oracle) => node === oracle, elements[index]));
                        rows.push({
                            ...row,
                            count,
                            same,
                            durationMs: performance.now() - start,
                            outcome: classify({count, same, eligible: expectation === 'eligible'}),
                        });
                    }
                } catch (error) {
                    rows.push({...row, outcome: 'query-error', error: String(error)});
                }
            }
        }
        await pupil.close();
        console.info(`Benchmark: ${variant} (${targets.length} × ${libraries.length})`);
    }
    const hashes = {};
    for (const file of [
        'scripts/spike-benchmark/matrix.mjs',
        'scripts/spike-benchmark/fixture.mjs',
        'scripts/spike-benchmark/browser.mjs',
        'scripts/spike-benchmark/run.mjs',
        'scripts/spike-benchmark/metrics.mjs',
        'libs/training-observer/src/resolution/resolver.ts',
        'libs/training-observer/src/recording/dom.ts',
        'libs/training-observer/src/dom/identity.ts',
    ]) {
        hashes[file] = createHash('sha256')
            .update(await readFile(file))
            .digest('hex');
    }
    const packages = {};
    for (const name of [
        '@angular/core',
        '@taiga-ui/core',
        '@taiga-ui/kit',
        '@medv/finder',
        '@mizchi/selector-generator',
        'dom-to-locator',
        'dom-accessibility-api',
        '@playwright/test',
    ])
        packages[name] = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version;
    const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        node: process.version,
        browser: browser.version(),
        packages,
        hashes,
        provenance,
        thresholds: {threshold: 0.9, margin: 0.12, tuning: 'None; stage-6 defaults frozen before this matrix'},
        timing: {
            resolver: 'In-page synchronous call; queriedControlCount computed after timer',
            generators: 'In-page generation',
            otherQueries:
                'Playwright round trip including count and identity comparison; not comparable to in-page resolver latency',
        },
        targets,
        variants,
        recorded: saved,
        rows,
        summary: Object.fromEntries(
            libraries.map((library) => [library, summarize(rows.filter((row) => row.library === library))]),
        ),
        byVariant: Object.fromEntries(
            variants.map((variant) => [
                variant,
                Object.fromEntries(
                    libraries.map((library) => [
                        library,
                        summarize(rows.filter((row) => row.variant === variant && row.library === library)),
                    ]),
                ),
            ]),
        ),
        bySplit: Object.fromEntries(
            ['development', 'held-out'].map((split) => [
                split,
                Object.fromEntries(
                    libraries.map((library) => [
                        library,
                        summarize(rows.filter((row) => row.split === split && row.library === library)),
                    ]),
                ),
            ]),
        ),
        generation: Object.fromEntries(
            libraries.map((library) => {
                const entries = saved.map((row) => row.generated[library]);
                return [
                    library,
                    {
                        medianMs: percentile(
                            entries.map((row) => row.durationMs),
                            0.5,
                        ),
                        p95Ms: percentile(
                            entries.map((row) => row.durationMs),
                            0.95,
                        ),
                        medianBytes: percentile(
                            entries.map((row) => row.bytes ?? new TextEncoder().encode(JSON.stringify(row)).length),
                            0.5,
                        ),
                        p95Bytes: percentile(
                            entries.map((row) => row.bytes ?? new TextEncoder().encode(JSON.stringify(row)).length),
                            0.95,
                        ),
                    },
                ];
            }),
        ),
    };
    await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
    await writeFile(`${output}/results.csv`, csv(rows));
    console.info(JSON.stringify(report.summary, null, 2));
    // Explicit limitations remain in the report, never silently dropped from the denominator.
    const unexpected = rows.filter(
        (row) => row.library === 'resolver-v2' && row.outcome === 'wrong' && row.variant !== 'same-dom-new-entity',
    );
    assert.deepEqual(
        unexpected,
        [],
        'Resolver silently accepted a wrong target outside the indistinguishable entity replacement limit',
    );
    assert.equal(
        rows.some((row) => row.outcome === 'query-error' || row.outcome === 'generation-error'),
        false,
        'No hidden generator/query failures',
    );
} finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
}
async function inject(page) {
    for (const name of ['browser', 'libraries']) await page.addScriptTag({url: `${url}/${name}.js`, type: 'module'});
    await page.waitForFunction(() => !!window.benchmark && !!window.researchLibraries);
}
