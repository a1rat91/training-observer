/** Воспроизводимый browser benchmark ядра: фиксированные размеры/число операций, без Angular/demo оптимизаций. */
/* eslint @typescript-eslint/explicit-member-accessibility: off -- Browser instrumentation is plain JavaScript. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {relative} from 'node:path';

import {chromium} from '@playwright/test';
import {build} from 'esbuild';

const label = process.argv[2] ?? 'current';
const revision = process.argv[3];

if (revision && !/^[a-f0-9]{7,40}$/.test(revision)) {
    throw new Error('Expected a commit hash');
}

if (!/^[a-z0-9-]+$/.test(label)) {
    throw new Error('Expected a simple report label');
}

const bundle = await build({
    entryPoints: ['libs/training-observer/src/index.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'ObserverLibrary',
    platform: 'browser',
    target: 'es2022',
    plugins: [
        {
            name: 'count-features',
            setup(builder) {
                builder.onLoad({filter: /libs\/training-observer\/.*\.ts$/}, async ({path}) => {
                    const source = revision
                        ? execFileSync('git', ['show', `${revision}:${relative(process.cwd(), path)}`], {
                              encoding: 'utf8',
                          })
                        : await readFile(path, 'utf8');

                    if (!path.endsWith('/dom/identity.ts')) {
                        return {loader: 'ts', contents: source};
                    }

                    const signature = 'export function features(element: Element, root: Element): IdentityFeatures {';

                    if (!source.includes(signature)) {
                        throw new Error('Instrumentation signature changed');
                    }

                    return {
                        loader: 'ts',
                        contents: source.replace(
                            signature,
                            `${
                                signature
                            }\n globalThis.__observationMetrics && globalThis.__observationMetrics.features++;`,
                        ),
                    };
                });
            },
        },
    ],
});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const cases = [];

try {
    for (const mode of ['record', 'runtime']) {
        for (const config of [
            {selected: 12, neighbor: 12, multiple: false},
            {selected: 12, neighbor: 1200, multiple: false},
            {selected: 120, neighbor: 1200, multiple: true},
        ]) {
            const page = await browser.newPage();

            await page.route('http://observation.test/**', (route) =>
                route.fulfill({contentType: 'text/html', body: '<main></main>'}),
            );
            await page.goto('http://observation.test/fixture');
            await page.addScriptTag({content: bundle.outputFiles[0].text});
            const cdp = await page.context().newCDPSession(page);

            await cdp.send('HeapProfiler.collectGarbage');
            const before = await cdp.send('Memory.getDOMCounters');
            const result = await page.evaluate(
                async ({mode, config}) => {
                    const lib = globalThis.ObserverLibrary;
                    const root = document.querySelector('main');
                    const fields = (prefix, count) =>
                        Array.from(
                            {length: count},
                            (_, index) =>
                                `<label>${prefix} ${index}<input id="${prefix}-${index}" aria-label="${prefix} ${index}"></label>`,
                        ).join('');

                    root.innerHTML = `<active-area>${fields('A', config.selected)}</active-area><second-area>${fields('B', config.multiple ? 12 : 0)}</second-area><neighbor-area><span>noise</span>${fields('N', config.neighbor)}</neighbor-area>`;
                    const definitions = [
                        {key: 'a', hostTag: 'active-area', observe: true},
                        {key: 'b', hostTag: 'second-area', observe: config.multiple},
                        {key: 'n', hostTag: 'neighbor-area', observe: false},
                    ];
                    const registry = new lib.AreaRegistry(definitions);
                    const metrics = {
                        queries: 0,
                        documentQueries: 0,
                        features: 0,
                        resolves: 0,
                        selectedReads: 0,
                        neighborReads: 0,
                    };

                    globalThis.__observationMetrics = metrics;
                    const addListener = Document.prototype.addEventListener;
                    const removeListener = Document.prototype.removeEventListener;
                    const listeners = [];
                    const capture = (options) => (typeof options === 'boolean' ? options : !!options?.capture);

                    Document.prototype.addEventListener = function (type, callback, options) {
                        if (
                            !listeners.some(
                                (entry) =>
                                    entry.target === this &&
                                    entry.type === type &&
                                    entry.callback === callback &&
                                    entry.capture === capture(options),
                            )
                        ) {
                            listeners.push({target: this, type, callback, capture: capture(options)});
                        }

                        return addListener.call(this, type, callback, options);
                    };

                    Document.prototype.removeEventListener = function (type, callback, options) {
                        const index = listeners.findIndex(
                            (entry) =>
                                entry.target === this &&
                                entry.type === type &&
                                entry.callback === callback &&
                                entry.capture === capture(options),
                        );

                        if (index >= 0) {
                            listeners.splice(index, 1);
                        }

                        return removeListener.call(this, type, callback, options);
                    };

                    const elementQuery = Element.prototype.querySelectorAll;

                    Element.prototype.querySelectorAll = function (selector) {
                        metrics.queries++;

                        return elementQuery.call(this, selector);
                    };

                    const documentQuery = Document.prototype.querySelectorAll;

                    Document.prototype.querySelectorAll = function (selector) {
                        metrics.documentQueries++;

                        return documentQuery.call(this, selector);
                    };

                    const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

                    Object.defineProperty(HTMLInputElement.prototype, 'value', {
                        ...value,
                        get() {
                            if (this.closest('neighbor-area')) {
                                metrics.neighborReads++;
                            } else {
                                metrics.selectedReads++;
                            }

                            return value.get.call(this);
                        },
                    });
                    const originalResolve = lib.ElementResolver.prototype.resolve;

                    lib.ElementResolver.prototype.resolve = function (...args) {
                        metrics.resolves++;

                        return originalResolve.apply(this, args);
                    };

                    const nativeClear = window.clearInterval.bind(window),
                        nativeInterval = window.setInterval.bind(window);
                    const intervals = new Set();

                    window.setInterval = (...args) => {
                        const id = nativeInterval(...args);

                        intervals.add(id);

                        return id;
                    };

                    window.clearInterval = (id) => {
                        intervals.delete(id);
                        nativeClear(id);
                    };

                    let observers = 0;
                    const NativeObserver = MutationObserver;

                    window.MutationObserver = class extends NativeObserver {
                        active = false;

                        observe(...args) {
                            if (!this.active) {
                                observers++;
                                this.active = true;
                            }

                            super.observe(...args);
                        }

                        disconnect() {
                            if (this.active) {
                                observers--;
                                this.active = false;
                            }

                            super.disconnect();
                        }
                    };
                    registry.start(root);
                    const ids = ['A-0', 'A-1', 'A-2'];
                    const scenario = {
                        kind: 'training-scenario',
                        version: 4,
                        id: 'load',
                        mode: {kind: 'dom-only'},
                        descriptors: ids.map((id) =>
                            lib.describeElement(document.querySelector(`#${CSS.escape(id)}`), registry.root('a'), id),
                        ),
                        areas: {definitions, targets: ids.map((id) => ({targetId: id, areaKey: 'a'}))},
                        startGroupId: 'g',
                        completion: {kind: 'pathname', value: '/never'},
                        groups: [
                            {
                                id: 'g',
                                title: 'Fields',
                                entry: {kind: 'visible', targetId: ids[0], expected: true},
                                transitions: [],
                                expectations: ids.map((id) => ({
                                    id,
                                    instruction: id,
                                    hint: null,
                                    optional: false,
                                    requires: [],
                                    when: null,
                                    action: {
                                        kind: 'input',
                                        targetId: id,
                                        value: {kind: 'raw-equals', value: 'accepted'},
                                    },
                                    completion: {
                                        kind: 'value',
                                        targetId: id,
                                        condition: {kind: 'raw-equals', value: 'accepted'},
                                    },
                                })),
                            },
                        ],
                    };
                    const session =
                        mode === 'record'
                            ? new lib.ElementRecorder(root, {
                                  areas: registry,
                                  valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
                                  acceptUntrustedEvents: true,
                              })
                            : new lib.ScenarioRuntime(root, scenario, {
                                  areas: registry,
                                  acceptUntrustedEvents: true,
                                  timeoutMs: 60000,
                              });

                    session.start();
                    const warmup = {...metrics};

                    Object.keys(metrics).forEach((key) => {
                        metrics[key] = 0;
                    });
                    const activeResources = {intervals: intervals.size, observers, documentListeners: listeners.length};
                    const durationStart = performance.now();

                    for (let index = 0; index < 12; index++) {
                        root.querySelector('neighbor-area span').textContent = String(index);
                        await new Promise((resolve) => setTimeout(resolve, 110));
                    }

                    const idle = {...metrics, durationMs: performance.now() - durationStart};

                    Object.keys(metrics).forEach((key) => {
                        metrics[key] = 0;
                    });
                    const latency = [];
                    const field = document.querySelector('#A-0');

                    for (let index = 0; index < 12; index++) {
                        const started = performance.now();

                        field.value = String(index);
                        field.dispatchEvent(new Event('input', {bubbles: true}));
                        field.dispatchEvent(new Event('blur'));
                        await new Promise((resolve) => setTimeout(resolve, 0));
                        latency.push(performance.now() - started);
                    }

                    const actions = {...metrics};
                    const sort = latency.toSorted((a, b) => a - b);

                    Object.keys(metrics).forEach((key) => {
                        metrics[key] = 0;
                    });

                    for (let index = 0; index < 2; index++) {
                        root.querySelector('active-area').outerHTML =
                            `<active-area><section>${fields('A', config.selected)}</section></active-area>`;
                        await new Promise((resolve) => setTimeout(resolve, 150));
                    }

                    const remount = {...metrics};

                    session.stop();
                    registry.stop();
                    root.replaceChildren();

                    // Remove instrumentation closures before GC: they share this fixture's scope.
                    Element.prototype.querySelectorAll = elementQuery;
                    Document.prototype.addEventListener = addListener;
                    Document.prototype.removeEventListener = removeListener;
                    Document.prototype.querySelectorAll = documentQuery;
                    Object.defineProperty(HTMLInputElement.prototype, 'value', value);
                    lib.ElementResolver.prototype.resolve = originalResolve;
                    window.setInterval = nativeInterval;
                    window.clearInterval = nativeClear;
                    window.MutationObserver = NativeObserver;
                    delete globalThis.__observationMetrics;

                    return {
                        warmup,
                        idle,
                        actions,
                        remount,
                        activeResources,
                        stoppedResources: {intervals: intervals.size, observers, documentListeners: listeners.length},
                        latency: {medianMs: sort[6], p95Ms: sort[11]},
                        committed: mode === 'record' ? session.snapshot().actions.length : session.snapshot().status,
                    };
                },
                {mode, config},
            );

            await cdp.send('HeapProfiler.collectGarbage');
            const after = await cdp.send('Memory.getDOMCounters');

            await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
            await cdp.send('HeapProfiler.collectGarbage');
            const settled = await cdp.send('Memory.getDOMCounters');

            cases.push({
                mode,
                ...config,
                ...result,
                retainedNodeDelta: after.nodes - before.nodes,
                settledNodeDelta: settled.nodes - before.nodes,
            });
            await page.close();
        }
    }
} finally {
    await browser.close();
}

await mkdir('docs/observation-benchmark', {recursive: true});
await writeFile(
    `docs/observation-benchmark/${label}.json`,
    `${JSON.stringify(
        {
            label,
            revision: execFileSync('git', ['rev-parse', revision ?? 'HEAD'], {encoding: 'utf8'}).trim(),
            workingTree: !revision,
            bundleSha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex'),
            fixtureSha256: createHash('sha256')
                .update(await readFile(new URL(import.meta.url)))
                .digest('hex'),
            browser: browser.version(),
            platform: `${process.platform}/${process.arch}`,
            date: new Date().toISOString(),
            rounds: 12,
            cases,
        },
        null,
        2,
    )}\n`,
);
console.info(`Saved ${cases.length} cases: ${label}`);
