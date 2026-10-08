/** Offline smoke of copied build artifacts in temporary consumers, without workspace aliases or npm install. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import typescript from 'typescript';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const installedModules = join(repository, 'node_modules');
const keep = process.argv.includes('--keep');
const packages = [
    ['@training-observer/core', 'training-observer'],
    ['@training-observer/contracts', 'training-contracts'],
    ['@training-observer/recording', 'training-recording'],
    ['@training-observer/runtime', 'training-runtime'],
    ['@training-observer/angular', 'training-angular'],
];
const purePackages = packages.filter(([name]) =>
    ['core', 'contracts', 'recording', 'runtime'].includes(name.split('/')[1]),
);

assert.ok(
    process.argv.slice(2).every((argument) => argument === '--keep'),
    'Usage: node scripts/verify-packages.mjs [--keep]',
);

async function readJson(filename) {
    return JSON.parse(await readFile(filename, 'utf8'));
}

function run(arguments_, cwd) {
    const environment = {...process.env, CI: 'true', NG_CLI_ANALYTICS: 'false'};

    delete environment.NODE_PATH;
    const result = spawnSync(process.execPath, arguments_, {
        cwd,
        env: environment,
        stdio: 'inherit',
    });

    if (result.error) {
        throw result.error;
    }

    assert.equal(result.status, 0, `Command failed: node ${arguments_.join(' ')}`);
}

async function copyPackages(consumer, entries) {
    for (const [name, directory] of entries) {
        const destination = join(consumer, 'node_modules', name);

        await mkdir(dirname(destination), {recursive: true});
        await cp(join(repository, 'dist', directory), destination, {
            recursive: true,
            dereference: true,
        });
    }
}

async function linkHostDependencies(consumer) {
    const destination = join(consumer, 'node_modules');

    await mkdir(destination, {recursive: true});

    for (const entry of await readdir(installedModules, {withFileTypes: true})) {
        if (entry.name.startsWith('.') || entry.name === '@training-observer') {
            continue;
        }

        await symlink(join(installedModules, entry.name), join(destination, entry.name));
    }
}

async function verifyPureConsumer(directory) {
    await copyPackages(directory, purePackages);
    await cp(join(installedModules, 'tslib'), join(directory, 'node_modules', 'tslib'), {
        recursive: true,
        dereference: true,
    });
    assert.deepEqual((await readdir(join(directory, 'node_modules'))).sort(), ['@training-observer', 'tslib']);
    assert.deepEqual((await readdir(join(directory, 'node_modules', '@training-observer'))).sort(), [
        'contracts',
        'core',
        'recording',
        'runtime',
    ]);
    await writeFile(
        join(directory, 'verify.mjs'),
        `import assert from 'node:assert/strict';
import {ControlType, ScreenStatus} from '@training-observer/core/models';
import {parseScenario, parseStateRecording} from '@training-observer/contracts';
import {StateRecorder, compileScenario, removeRecordedEvent} from '@training-observer/recording';
import {ScenarioRuntime, matchControl} from '@training-observer/runtime';

for (const name of ['@angular/common', '@angular/core', 'rxjs']) {
    assert.throws(() => import.meta.resolve(name), {code: 'ERR_MODULE_NOT_FOUND'});
}

const descriptor = {
    kind: ControlType.Textbox,
    label: 'Имя',
    tagName: 'input',
    role: 'textbox',
    context: [],
};
const control = {
    id: 'field',
    kind: ControlType.Textbox,
    visible: true,
    locatorHints: descriptor,
    state: {value: 'Анна'},
};
const screen = {status: ScreenStatus.Ready, reason: 'ready', key: 'A', controls: [control]};
const recorder = new StateRecorder();
recorder.start(screen, {});
recorder.observe(screen, {field: control});
const recording = parseStateRecording(JSON.stringify(recorder.stop()));
assert.equal(recording.events.length, 2);
const scenario = parseScenario(JSON.stringify(compileScenario(recording)));
assert.equal(new ScenarioRuntime(scenario).update(screen, {}).status, 'complete');
assert.equal(matchControl(descriptor, [control]).status, 'matched');
assert.equal(removeRecordedEvent(recording, 2).events.length, 1);
console.log('PASS: pure ESM consumer has only core/contracts/recording/runtime and tslib; core/models imports without Angular/RxJS or workspace aliases.');
`,
    );
    run([join(directory, 'verify.mjs')], directory);
}

async function verifyAngularConsumer(parent, cli) {
    run(
        [
            cli,
            'new',
            'package-consumer',
            '--directory=angular-consumer',
            '--skip-install',
            '--skip-git',
            '--skip-tests',
            '--minimal',
            '--package-manager=npm',
            '--routing=false',
            '--ssr=false',
            '--style=css',
            '--inline-template',
            '--inline-style',
            '--interactive=false',
        ],
        parent,
    );
    const directory = join(parent, 'angular-consumer');

    await linkHostDependencies(directory);
    await copyPackages(directory, packages);
    const configPath = join(directory, 'tsconfig.json');
    const parsedConfig = typescript.parseConfigFileTextToJson(configPath, await readFile(configPath, 'utf8'));

    assert.equal(parsedConfig.error, undefined, 'Generated consumer tsconfig must be valid.');
    const config = parsedConfig.config;

    assert.equal(config.compilerOptions.paths, undefined, 'Consumer must not use aliases.');
    assert.equal(config.extends, undefined, 'Consumer must not inherit a workspace config.');
    assert.equal(config.compilerOptions.baseUrl, undefined, 'Consumer must not inherit the workspace baseUrl.');
    const workspace = await readJson(join(directory, 'angular.json'));

    workspace.cli = {...workspace.cli, analytics: false, cache: {enabled: false}};
    await writeFile(join(directory, 'angular.json'), JSON.stringify(workspace, null, 2));
    await writeFile(
        join(directory, 'src', 'app', 'app.component.ts'),
        `import {DOCUMENT} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, inject, type Signal} from '@angular/core';
import {provideRecordingSession, provideTrainingSession, RecordingSession, TrainingSession, type ScreenStateOptions} from '@training-observer/angular';
import {provideDomObservation, TrainingObserver} from '@training-observer/core';
import {ControlType, type DomSnapshot} from '@training-observer/core/models';
import {compileScenario} from '@training-observer/recording';

const screen: ScreenStateOptions = {
    root: {tagName: 'section', attribute: {name: 'id', value: 'procedure'}},
    identity: {kind: 'attribute', name: 'data-screen'},
    ready: {name: 'data-ready', value: 'true'},
};

@Component({
    selector: 'observation-probe',
    standalone: true,
    providers: [provideDomObservation()],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<p>Контролов: {{ observer.logicalControls().length }}; снимок: {{ snapshot()?.rootId }}</p><section id="procedure" data-screen="A" data-ready="true" aria-label="Процедура"><input aria-label="Имя" /></section>',
})
class ObservationProbeComponent {
    protected readonly observer = inject(TrainingObserver);
    protected readonly snapshot: Signal<DomSnapshot | null> = this.observer.snapshot;
    protected readonly kind = ControlType.Textbox;
    private readonly document = inject(DOCUMENT);

    constructor() {
        afterNextRender(() => {
            const root = this.document.querySelector('section');
            if (root) this.observer.start(root);
        });
    }
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [ObservationProbeComponent],
    providers: [
        provideRecordingSession({root: '#procedure', screen}),
        provideTrainingSession({root: '#procedure', screen}),
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<observation-probe /><p>Запись: {{ recording.controls().length }}; прохождение: {{ training.progress()?.status }}; снимок: {{ snapshot()?.rootId }}</p><button (click)="recording.start()">Записать</button><button (click)="finish()">Пройти</button>',
})
export class AppComponent {
    protected readonly recording = inject(RecordingSession);
    protected readonly training = inject(TrainingSession);
    protected readonly snapshot: Signal<DomSnapshot | null> = this.recording.snapshot;

    protected async finish(): Promise<void> {
        const subscription = this.training.feedback$.subscribe((feedback) => console.log(feedback));
        const recording = await this.recording.stop();
        this.training.start(compileScenario(recording));
        this.recording.highlight(null);
        this.training.stop();
        subscription.unsubscribe();
    }
}
`,
    );
    run([cli, 'build', '--configuration=production', '--progress=false'], directory);
    console.log(
        'PASS: Angular 19 CLI AOT compilation and linking consumed copied artifacts, public observation/recording/training providers and readonly snapshots.',
    );
}

let temporary;
let completed = false;

try {
    const angular = await readJson(join(installedModules, '@angular', 'core', 'package.json'));
    const cli = await readJson(join(installedModules, '@angular', 'cli', 'package.json'));

    assert.equal(angular.version.split('.')[0], '19', 'The verification host requires Angular 19.');
    assert.equal(cli.version.split('.')[0], '19', 'Use the installed Angular 19 CLI.');

    for (const [name, directory] of packages) {
        const manifest = await readJson(join(repository, 'dist', directory, 'package.json'));

        assert.equal(manifest.name, name, `Build ${directory} before verification.`);
        assert.ok(manifest.exports?.['.'], `${name} is missing its public package export.`);

        if (name === '@training-observer/core') {
            assert.ok(manifest.exports?.['./models'], 'Core is missing its public models entry point.');

            for (const dependency of ['@angular/common', '@angular/core', 'rxjs']) {
                assert.ok(manifest.peerDependencies?.[dependency], `Core must declare ${dependency} as a peer.`);
                assert.equal(
                    manifest.dependencies?.[dependency],
                    undefined,
                    `Core must not require ${dependency} as a runtime dependency.`,
                );
                assert.equal(
                    manifest.peerDependenciesMeta?.[dependency]?.optional,
                    true,
                    `Core must keep ${dependency} optional for pure consumers.`,
                );
            }
        } else if (name === '@training-observer/angular') {
            for (const dependency of ['@angular/common', '@angular/core', 'rxjs']) {
                assert.ok(manifest.peerDependencies?.[dependency], `Angular facade must declare ${dependency}.`);
                assert.notEqual(
                    manifest.peerDependenciesMeta?.[dependency]?.optional,
                    true,
                    `Angular facade must require its ${dependency} peer.`,
                );
            }
        }
    }

    temporary = await mkdtemp(
        join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'training-package-consumers-'),
    );
    console.log(`Offline build-artifact consumers: ${temporary}`);
    console.log(`Host: Node ${process.versions.node}; Angular ${angular.version}; CLI ${cli.version}.`);
    await verifyPureConsumer(join(temporary, 'pure-consumer'));
    await verifyAngularConsumer(temporary, join(installedModules, '@angular', 'cli', 'bin', 'ng.js'));
    completed = true;
    console.log(
        'This verifies copied build artifacts and existing host dependencies; it does not verify npm registry installation or peer dependency resolution.',
    );
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    if (temporary && completed && !keep) {
        await rm(temporary, {recursive: true, force: true});
    } else if (temporary) {
        console.log(`Consumer files retained at ${temporary}`);
    }
}
