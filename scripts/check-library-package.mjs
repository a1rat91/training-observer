import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import ts from 'typescript';

// Проверяем собранный пакет как внешний потребитель: без workspace paths и доступа к src.
await mkdir('tmp', {recursive: true});
const directory = await mkdtemp(resolve('tmp/package-consumer-'));

try {
    await mkdir(`${directory}/node_modules/@training-observer`, {recursive: true});
    await symlink(resolve('dist/training-observer'), `${directory}/node_modules/@training-observer/core`);
    await writeFile(`${directory}/package.json`, '{"type":"module"}');
    await writeFile(
        `${directory}/consumer.mjs`,
        `
        import assert from 'node:assert/strict';
        import {createRequire} from 'node:module';
        import {AreaRegistry, ElementRecorder, ElementResolver, ScenarioRuntime, describeElement, parseScenario} from '@training-observer/core';
        assert.equal(typeof globalThis.document, 'undefined');
        for (const value of [AreaRegistry, ElementRecorder, ElementResolver, ScenarioRuntime, describeElement, parseScenario]) assert.equal(typeof value, 'function');
        assert.throws(() => createRequire(import.meta.url).resolve('@training-observer/core/src/recording'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    `,
    );
    execFileSync(process.execPath, [`${directory}/consumer.mjs`], {stdio: 'inherit'});
    const source = `${directory}/consumer.ts`;

    await writeFile(
        source,
        `
        import {AreaRegistry, describeElement, ElementResolver, ScenarioRuntime, type GroupedScenario, type AreaDefinition} from '@training-observer/core';
        import {AreaRegistryService} from '@training-observer/core/angular';
        declare const root: HTMLElement;
        declare const service: AreaRegistryService;
        const areas: AreaDefinition[] = [{key: 'player', hostTag: 'procedure-mf', observe: true}];
        const registry: AreaRegistry = service.connect(root, areas);
        registry.accepts('player', root);
        declare const scenario: GroupedScenario;
        const runtime = new ScenarioRuntime(root, scenario, {areas: registry});
        runtime.snapshot().expectations?.map((expectation) => expectation.status);
        runtime.skip('optional-expectation');
        new ElementResolver().resolve(describeElement(root, root, 'target', {includeStatic: true}), root);
    `,
    );
    const program = ts.createProgram([source], {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
    });
    const errors = ts.getPreEmitDiagnostics(program);

    assert.equal(
        errors.length,
        0,
        ts.formatDiagnosticsWithColorAndContext(errors, {
            getCurrentDirectory: () => process.cwd(),
            getCanonicalFileName: (file) => file,
            getNewLine: () => '\n',
        }),
    );
    console.info('Package consumer: Node import, closed exports, core and Angular typings passed.');
} finally {
    await rm(directory, {recursive: true, force: true});
}
