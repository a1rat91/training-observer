import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import less from 'less';
import {createActor, fromPromise, setup} from 'xstate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

process.chdir(root);
const require = createRequire(import.meta.url);
const output = resolve(process.env.SPIKE_REPORT_DIR ?? 'dist/spike-research');

await mkdir(output, {recursive: true});
const pkg = (name) =>
    JSON.parse(require('node:fs').readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
const packages = [
    'dom-to-locator',
    '@mizchi/selector-generator',
    '@medv/finder',
    'dom-accessibility-api',
    'rrweb',
    'xstate',
    'driver.js',
    '@taiga-ui/core',
    '@taiga-ui/kit',
    '@angular/core',
    '@playwright/test',
    'esbuild',
    'less',
];
const sourceHashes = Object.fromEntries(
    await Promise.all(
        ['fixture.mjs', 'libraries.mjs', 'run.mjs'].map(async (name) => [
            name,
            createHash('sha256')
                .update(await readFile(`scripts/spike-research/${name}`))
                .digest('hex'),
        ]),
    ),
);
const report = {
    sourceHashes,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    packages: Object.fromEntries(
        packages.map((name) => [name, {version: pkg(name).version, license: pkg(name).license}]),
    ),
    bundleSizes: {},
    rows: [],
    checks: {},
};

for (const entry of ['fixture', 'libraries']) {
    await build({
        entryPoints: [`scripts/spike-research/${entry}.mjs`],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        outfile: join(output, `${entry}.js`),
        logLevel: 'warning',
    });
}

// Standalone minified browser payload per library; fixture and source maps excluded.
for (const name of packages.slice(0, 7)) {
    const built = await build({
        stdin: {contents: `import * as lib from '${name}'; globalThis.measuredLibrary = lib;`, resolveDir: root},
        bundle: true,
        minify: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        logLevel: 'silent',
    });
    const bytes = built.outputFiles[0].contents;

    report.bundleSizes[name] = {minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length};
}

const theme = resolve('node_modules/@taiga-ui/core/styles/taiga-ui-theme.less');
const css = (await less.render(await readFile(theme, 'utf8'), {filename: theme})).css;
const rrwebRecordBundle = await build({
    stdin: {contents: "import {record} from 'rrweb'; globalThis.measuredRecord = record;", resolveDir: root},
    bundle: true,
    minify: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent',
});

report.bundleSizes['rrweb-record-only'] = {
    minifiedBytes: rrwebRecordBundle.outputFiles[0].contents.length,
    gzipBytes: gzipSync(rrwebRecordBundle.outputFiles[0].contents).length,
};
await writeFile(join(output, 'styles.css'), css + (await readFile('node_modules/driver.js/dist/driver.css', 'utf8')));
const html =
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><research-fixture></research-fixture><script type="module" src="/fixture.js"></script></body></html>';
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url, 'http://localhost').pathname;

        if (path === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);

            return;
        }

        const files = {'/fixture.js': 'fixture.js', '/libraries.js': 'libraries.js', '/styles.css': 'styles.css'};
        let file = files[path] ? join(output, files[path]) : null;

        if (path.startsWith('/assets/taiga-ui/icons/') && /^[\w./-]+$/.test(path) && !path.includes('..')) {
            file = resolve('node_modules/@taiga-ui/icons/src', path.slice('/assets/taiga-ui/icons/'.length));
        }

        if (!file || !existsSync(file)) {
            res.writeHead(404).end();

            return;
        }

        res.setHeader(
            'Content-Type',
            {css: 'text/css', svg: 'image/svg+xml', js: 'text/javascript'}[path.split('.').pop()],
        );
        res.end(await readFile(file));
    } catch (error) {
        res.writeHead(500).end(String(error));
    }
});

await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
});
const url = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
    browser = await chromium.launch({channel: process.env.SPIKE_BROWSER_CHANNEL ?? 'chrome', headless: true});
    report.browser = browser.version();
    const page = await browser.newPage({viewport: {width: 1400, height: 1100}});
    const errors = [];

    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url);
    await page.locator('input[tuiSelect]').waitFor();
    assert.deepEqual(errors, [], 'Angular fixture must bootstrap without errors');
    await page.addScriptTag({url: `${url}/libraries.js`, type: 'module'});
    await page.waitForFunction(() => !!window.researchLibraries);
    report.provenance = await page.evaluate(() => window.researchLibraries.provenance);
    const cases = [
        ['text', 'input[name=employee]'],
        ['email', 'input[name=email]'],
        ['select', 'input[tuiSelect]'],
        ['number', 'input[tuiInputNumber]'],
        ['checkbox', 'input[tuiCheckbox]'],
        ['switch', 'input[tuiSwitch]'],
        ['textarea', 'textarea[tuiTextarea]'],
        ['date', 'input[tuiInputDate]'],
        ['continue', 'form > button:first-of-type'],
        ['icon-button', 'button[aria-label="Открыть справку"]'],
        ['repeat-anna', 'fieldset:nth-of-type(1) button'],
        ['repeat-boris', 'fieldset:nth-of-type(2) button'],
        ['indistinguishable-a', 'section button:first-child'],
        ['indistinguishable-b', 'section button:last-child'],
    ];
    const libraries = ['dom-to-locator', 'mizchi', 'finder-default', 'finder-filtered'];
    const recorded = [];

    for (const [id, selector] of cases) {
        assert.equal(await page.locator(selector).count(), 1, `Fixture oracle: ${id}`);
        const entry = {
            id,
            oracleSelector: selector,
            fingerprint: await page.locator(selector).evaluate((el) => window.researchLibraries.fingerprint(el)),
            generated: {},
        };

        for (const library of libraries) {
            entry.generated[library] = await page
                .locator(selector)
                .evaluate((el, library) => window.researchLibraries.generate(library, el), library);
        }

        recorded.push(entry);
    }

    // Persist and reload plain JSON. No references from the recording document survive.
    await writeFile(join(output, 'recorded.json'), `${JSON.stringify(recorded, null, 2)}\n`);
    const saved = JSON.parse(await readFile(join(output, 'recorded.json'), 'utf8'));
    const snapshot = await page.content();

    report.recorded = saved;
    report.checks.recordedTargets = saved.length;

    for (const variant of [
        'baseline',
        'layout',
        'regenerated-ids',
        'renamed',
        'duplicate',
        'removed',
        'swap-indistinguishable',
        'css-trap',
        'semantic-trap',
    ]) {
        const pupil = await browser.newPage({viewport: {width: 1400, height: 1100}});

        // Rendered Taiga DOM on a fresh page without Angular handlers. Dynamic behavior is checked separately below.
        await pupil.setContent(
            snapshot
                .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                .replaceAll('href="/styles.css"', `href="${url}/styles.css"`),
        );
        const oracle = [];

        for (const entry of saved) {
            oracle.push(await pupil.locator(entry.oracleSelector).elementHandle());
        }

        await pupil.evaluate(
            ({variant, targets}) => {
                if (variant === 'layout') {
                    for (const target of targets) {
                        const wrapper = document.createElement('div');

                        target.replaceWith(wrapper);
                        wrapper.append(target);
                    }

                    for (const form of document.querySelectorAll('form')) {
                        [...form.children].reverse().forEach((child) => form.append(child));
                    }

                    for (const node of document.querySelectorAll('main *')) {
                        node.setAttribute('class', 'refactored-layout');
                    }

                    for (const button of document.querySelectorAll('main button')) {
                        const span = document.createElement('span');

                        while (button.firstChild) {
                            span.append(button.firstChild);
                        }

                        const icon = document.createElement('span');

                        icon.setAttribute('aria-hidden', 'true');
                        icon.textContent = '★';
                        button.append(icon, span);
                    }

                    const destination = document.createElement('article');

                    document.querySelector('main').append(destination);
                    document.querySelectorAll('fieldset').forEach((fieldset) => destination.append(fieldset));
                }

                if (variant === 'regenerated-ids') {
                    const mapping = new Map(
                        [...document.querySelectorAll('[id]')].map((node, i) => [node.id, `new-session-${i}`]),
                    );

                    for (const node of document.querySelectorAll('*')) {
                        if (node.id) {
                            node.id = mapping.get(node.id);
                        }

                        for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
                            if (node.hasAttribute(attr)) {
                                node.setAttribute(
                                    attr,
                                    node
                                        .getAttribute(attr)
                                        .split(' ')
                                        .map((id) => mapping.get(id) ?? id)
                                        .join(' '),
                                );
                            }
                        }
                    }
                }

                if (variant === 'renamed') {
                    targets[8].textContent = 'Продолжить оформление';
                }

                if (variant === 'duplicate') {
                    const form = document.querySelector('form');
                    const copy = form.cloneNode(true);
                    const ids = new Map([...copy.querySelectorAll('[id]')].map((node) => [node.id, `copy-${node.id}`]));

                    for (const node of copy.querySelectorAll('*')) {
                        if (node.id) {
                            node.id = ids.get(node.id);
                        }

                        for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
                            if (node.hasAttribute(attr)) {
                                node.setAttribute(
                                    attr,
                                    node
                                        .getAttribute(attr)
                                        .split(' ')
                                        .map((id) => ids.get(id) ?? id)
                                        .join(' '),
                                );
                            }
                        }
                    }

                    form.after(copy);
                }

                if (variant === 'removed') {
                    targets[8].remove();
                }

                if (variant === 'swap-indistinguishable') {
                    const [a, b] = targets.slice(-2);

                    a.parentElement.insertBefore(b, a);
                }

                if (variant === 'semantic-trap') {
                    const target = targets[8];
                    const decoy = target.cloneNode(true);

                    decoy.textContent = 'Продолжить удаление';
                    target.replaceWith(decoy);
                }

                if (variant === 'css-trap') {
                    const target = targets[8];
                    const decoy = target.cloneNode(true);

                    decoy.textContent = 'Удалить заявку';
                    target.replaceWith(decoy);
                    document.querySelector('main').append(target);
                }
            },
            {variant, targets: oracle},
        );

        for (const [index, entry] of saved.entries()) {
            for (const library of libraries) {
                const generated = entry.generated[library];
                const row = {variant, id: entry.id, library};

                report.rows.push({...row, ...(await queryGenerated(pupil, generated, oracle[index]))});
            }
        }

        await pupil.close();
        console.info(`Locator probe: ${variant} complete`);
    }

    report.summary = Object.fromEntries(
        [...new Set(report.rows.map((row) => row.variant))].map((variant) => [
            variant,
            Object.fromEntries(
                libraries.map((library) => {
                    const rows = report.rows.filter((row) => row.variant === variant && row.library === library);

                    return [
                        library,
                        Object.fromEntries(
                            ['correct', 'wrong', 'ambiguous', 'missing', 'generation-error', 'query-error'].map(
                                (outcome) => [outcome, rows.filter((row) => row.outcome === outcome).length],
                            ),
                        ),
                    ];
                }),
            ),
        ]),
    );
    assert.ok(
        report.rows.filter((row) => row.variant === 'baseline').every((row) => row.outcome === 'correct'),
        'Baseline must round-trip every locator to its target',
    );
    await writeFile(
        join(output, 'locator-results.json'),
        `${JSON.stringify({recorded: saved, rows: report.rows, summary: report.summary}, null, 2)}\n`,
    );
    // Real Taiga + rrweb behavior, not serialized HTML.
    await page.evaluate(() => {
        window.replayProbe = window.researchLibraries.startReplay();
        window.nativeProbe = [];

        for (const type of ['click', 'input', 'change']) {
            document.addEventListener(
                type,
                (event) => {
                    window.nativeProbe.push({
                        type,
                        tag: event.target.localName,
                        role: event.target.getAttribute?.('role'),
                        name: event.target.getAttribute?.('name'),
                        value: event.target.value ?? null,
                        text: event.target.textContent?.trim().slice(0, 60),
                    });
                },
                true,
            );
        }
    });
    await page.locator('input[name=employee]').fill('Ирина-Тест-Секрет');
    await page.locator('input[tuiSelect]').click();
    await page.waitForTimeout(100);
    await writeFile(join(output, 'dropdown-debug.html'), await page.content());
    await page.screenshot({path: join(output, 'dropdown-debug.png'), fullPage: true});
    const option = page.getByRole('option', {name: 'Angular', exact: true});

    await option.waitFor();
    report.checks.dropdown = await option.evaluate((el) => ({
        outsideForm: !el.closest('form'),
        name: window.researchLibraries.fingerprint(el),
        ownerMarkup: document.querySelector('input[tuiSelect]').outerHTML,
    }));
    report.checks.optionGenerators = {};

    for (const library of libraries) {
        report.checks.optionGenerators[library] = await option.evaluate(
            (el, library) => window.researchLibraries.generate(library, el),
            library,
        );
    }

    await option.click();
    await page.waitForFunction(() => document.querySelector('input[tuiSelect]').value === 'Angular');
    await page.getByRole('checkbox', {name: 'Согласие', exact: true}).check();
    await page.waitForTimeout(100); // Allows rrweb MutationObserver batches to flush; not a readiness heuristic.
    report.checks.rrweb = await page.evaluate(() => {
        const owner = document.querySelector('input[tuiSelect]');
        const courseMirrorId = window.researchLibraries.mirrorId(owner);

        window.replayProbe.stop();
        const events = window.replayProbe.events;

        return {
            courseMirrorId,
            eventCount: events.length,
            byteLength: new TextEncoder().encode(JSON.stringify(events)).length,
            eventsByType: events.reduce(
                (counts, event) => ({...counts, [event.type]: (counts[event.type] ?? 0) + 1}),
                {},
            ),
            incrementalBySource: events
                .filter((e) => e.type === 3)
                .reduce(
                    (counts, event) => ({...counts, [event.data.source]: (counts[event.data.source] ?? 0) + 1}),
                    {},
                ),
            inputEvents: events.filter((e) => e.type === 3 && e.data.source === 5).map((e) => e.data),
            nativeEvents: window.nativeProbe,
            selectedDisplay: document.querySelector('input[tuiSelect]').value,
            containsUnmaskedTypedValue: JSON.stringify(events).includes('Ирина-Тест-Секрет'),
        };
    });
    // A fresh recording after recreation assigns a different replay ID; IDs are not cross-session identity.
    report.checks.rrweb.mirrorLifecycle = await page.evaluate(async () => {
        const old = document.querySelector('input[name=employee]');
        const oldId = window.researchLibraries.mirrorId(old);
        const replay = window.researchLibraries.startReplay();
        const replacement = old.cloneNode(true);

        old.replaceWith(replacement);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const newId = window.researchLibraries.mirrorId(replacement);

        replay.stop();

        return {oldId, newId, oldDisconnected: !old.isConnected, changed: oldId !== newId && newId > 0};
    });
    assert.equal(report.checks.rrweb.mirrorLifecycle.changed, true);
    await page.evaluate(() => {
        window.activeDriver = window.researchLibraries.driver({allowClose: true, animate: false, showButtons: []});
        window.activeDriver.highlight({
            element: document.querySelector('input[name=employee]'),
            popover: {title: 'ФИО', description: 'Заранее заданная подсказка'},
        });
    });
    await page.locator('.driver-popover').waitFor();
    report.checks.driver = await page.evaluate(() => {
        const current = document.querySelector('input[name=employee]');
        const before = {
            activeElementMatches: window.activeDriver.getActiveElement() === current,
            targetClasses: current.className,
            popoverVisible: !!document.querySelector('.driver-popover'),
        };
        const replacement = current.cloneNode(true);

        current.replaceWith(replacement);
        const staleAfterReplace = window.activeDriver.getActiveElement() === current && !current.isConnected;

        // A re-rendered host element starts without the previous overlay's transient class.
        replacement.classList.remove('driver-active-element');
        window.activeDriver.highlight({element: replacement, popover: {title: 'ФИО', description: 'Подсказка'}});
        const reboundToReplacement = window.activeDriver.getActiveElement() === replacement;

        window.activeDriver.destroy();

        return {
            ...before,
            staleAfterReplace,
            reboundToReplacement,
            targetClassCleaned: !replacement.classList.contains('driver-active-element'),
            overlayRemoved: !document.querySelector('.driver-overlay'),
            popoverRemoved: !document.querySelector('.driver-popover'),
        };
    });
    report.checks.pageErrors = errors;
    assert.deepEqual(errors, [], 'Probe must not silently swallow fixture errors');
    assert.equal(report.checks.rrweb.selectedDisplay, 'Angular');
    assert.equal(report.checks.rrweb.containsUnmaskedTypedValue, false, 'Typed value must be masked');
    assert.equal(report.checks.driver.overlayRemoved, true);
    assert.equal(report.checks.driver.reboundToReplacement, true);
    assert.equal(report.checks.driver.targetClassCleaned, true);
    // XState probe: guards, delayed response, cancellation of an obsolete actor.
    const machine = setup({guards: {valid: ({event}) => event.valid === true}, actors: {}}).createMachine({
        initial: 'editing',
        states: {
            editing: {on: {SUBMIT: {guard: 'valid', target: 'waiting'}}},
            waiting: {on: {SUCCESS: 'done', FAILURE: 'editing', RESET: 'editing'}},
            done: {type: 'final'},
        },
    });
    const actor = createActor(machine).start();
    const trace = [actor.getSnapshot().value];

    for (const event of [
        {type: 'SUBMIT', valid: false},
        {type: 'SUBMIT', valid: true},
        {type: 'FAILURE'},
        {type: 'SUBMIT', valid: true},
        {type: 'SUCCESS'},
    ]) {
        actor.send(event);
        trace.push(actor.getSnapshot().value);
    }

    assert.deepEqual(trace, ['editing', 'editing', 'waiting', 'editing', 'waiting', 'done']);
    actor.stop();
    const deferred = [];
    const waitingMachine = setup({
        actors: {
            request: fromPromise(({signal}) => new Promise((resolve) => deferred.push({resolve, signal}))),
        },
    }).createMachine({
        initial: 'editing',
        states: {
            editing: {on: {SUBMIT: 'waiting'}},
            waiting: {invoke: {src: 'request', onDone: 'done'}, on: {RESET: 'editing'}},
            done: {type: 'final'},
        },
    });
    const waitingActor = createActor(waitingMachine).start();

    waitingActor.send({type: 'SUBMIT'});
    waitingActor.send({type: 'RESET'});
    assert.equal(deferred[0].signal.aborted, true);
    deferred[0].resolve('obsolete result');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(waitingActor.getSnapshot().value, 'editing');
    waitingActor.send({type: 'SUBMIT'});
    deferred[1].resolve('current result');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(waitingActor.getSnapshot().value, 'done');
    waitingActor.stop();
    report.checks.xstate = {
        guardAndFailureTrace: trace,
        obsoleteActorSignalAborted: true,
        lateResultIgnored: true,
        currentResultAccepted: true,
    };
    await page.screenshot({path: join(output, 'fixture.png'), fullPage: true});
    await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.info(
        JSON.stringify({comparisons: report.rows.length, checks: Object.keys(report.checks), output}, null, 2),
    );
} finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
}

async function queryGenerated(page, generated, oracle) {
    if (generated.error) {
        return {outcome: 'generation-error', error: generated.error};
    }

    try {
        const started = performance.now();
        const locator = page.locator(generated.selector);
        const count = await locator.count();
        let outcome = 'wrong';

        if (count === 0) {
            outcome = 'missing';
        }

        if (count > 1) {
            outcome = 'ambiguous';
        }

        if (count === 1 && (await locator.evaluate((element, expected) => element === expected, oracle))) {
            outcome = 'correct';
        }

        return {count, outcome, queryMs: performance.now() - started};
    } catch (error) {
        return {outcome: 'query-error', error: String(error)};
    }
}
