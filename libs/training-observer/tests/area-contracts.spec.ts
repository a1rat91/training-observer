import {AreaRegistry} from '../src/areas';
import {
    bindRecordingAreas,
    bindScenarioAreas,
    type LegacyScenario as Scenario,
    parseRecording,
    parseScenario,
    type Recording,
    serializeRecording,
    serializeScenario,
} from '../src/contracts';
import {ElementRecorder} from '../src/recording';
import {describeElement} from '../src/recording/element-description';
import {TargetResolver} from '../src/resolution';
import {Conditions, ScenarioRuntime} from '../src/runtime';
import {draftLegacyScenario} from '../src/runtime/legacy-authoring';

const definitions = [
    {key: 'search', hostTag: 'search-mf', observe: true},
    {key: 'player', hostTag: 'player-mf', observe: true},
    {key: 'neighbor', hostTag: 'neighbor-mf', observe: false},
];

const policy = {mode: 'capture' as const, sensitive: 'redact' as const, normalizers: []};
let root: HTMLElement;
let areas: AreaRegistry;
let recorder: ElementRecorder | undefined;
let runtime: ScenarioRuntime | undefined;

beforeEach(() => {
    jest.useFakeTimers();
    root = document.createElement('main');
    root.innerHTML =
        '<search-mf><button>Открыть</button></search-mf><player-mf><label>Имя<input></label><h2>Готово</h2></player-mf><neighbor-mf><label>Имя<input></label><h2>Готово</h2></neighbor-mf>';
    document.body.append(root);
    areas = new AreaRegistry(definitions);
    areas.start(root);
});
afterEach(() => {
    runtime?.stop();
    runtime = undefined;
    recorder?.stop();
    recorder = undefined;
    areas.stop();
    root.remove();
    jest.useRealTimers();
});

function recording(): Recording {
    recorder = new ElementRecorder(root, {
        areas,
        valuePolicy: policy,
        acceptUntrustedEvents: true,
    });
    recorder.start();
    root.querySelector('button')!.click();
    recorder.stop();

    return parseRecording(recorder.export());
}

function scenario(): Scenario {
    const log = recording();
    const finish = describeElement(
        root.querySelector('player-mf h2')!,
        areas.root('player')!,
        'finish',
        {includeStatic: true},
    );

    const result = parseScenario(
        serializeScenario(draftLegacyScenario(log, finish, 'player')),
    );

    if (result.version === 4) {
        throw new Error('Expected v3');
    }

    return result;
}

it('round-trips selected areas and target ownership, including an area disabled after recording', () => {
    const log = recording();

    expect(log.version).toBe(3);
    areas.setObserved('search', false);
    const saved = parseRecording(recorder!.export());

    if (saved.version !== 3) {
        throw new Error('expected v3');
    }

    expect(saved.areas.targets).toHaveLength(saved.descriptors.length);
    expect(saved.areas.definitions.find((entry) => entry.key === 'search')!.observe).toBe(
        true,
    );
    expect(JSON.stringify(saved)).not.toContain('generation');
    expect(areas.snapshots().find((entry) => entry.key === 'search')!.observe).toBe(
        false,
    );
});

it.each([
    'missing-target',
    'duplicate-target',
    'unknown-area',
    'unknown-target',
    'duplicate-area',
    'selector',
    'extra-field',
    'disabled',
])('rejects malformed bindings: %s', (mutation) => {
    const log = recording();

    if (log.version !== 3) {
        throw new Error('expected v3');
    }

    switch (mutation) {
        case 'disabled':
            log.areas.definitions[0] = {...log.areas.definitions[0]!, observe: false};
            break;
        case 'duplicate-area':
            log.areas.definitions.push(log.areas.definitions[0]!);
            break;
        case 'duplicate-target':
            log.areas.targets.push(log.areas.targets[0]!);
            break;
        case 'extra-field':
            Object.assign(log.areas.targets[0]!, {generation: 1});
            break;
        case 'missing-target':
            log.areas.targets.pop();
            break;
        case 'selector':
            log.areas.definitions[0] = {
                ...log.areas.definitions[0]!,
                hostTag: 'main input',
            };
            break;
        case 'unknown-area':
            log.areas.targets[0]!.areaKey = 'absent';
            break;
        case 'unknown-target':
            log.areas.targets[0]!.targetId = 'absent';
            break;
    }

    expect(() => serializeRecording(log)).toThrow();
});

it('keeps v2 readable and requires explicit, complete migration for scoped resolution', () => {
    const current = recording();

    if (current.version !== 3) {
        throw new Error('expected v3');
    }

    const {areas: bindings, ...content} = current;
    const legacy = parseRecording(JSON.stringify({...content, version: 2}));

    expect(legacy.version).toBe(2);
    expect(() => new TargetResolver(legacy, root, {}, areas)).toThrow('явной привязки');
    const migrated = bindRecordingAreas(legacy, bindings);

    expect(migrated).toEqual(current);
    expect(legacy.version).toBe(2);
    const value = scenario();

    if (value.version !== 3) {
        throw new Error('expected v3');
    }

    const {areas: scenarioBindings, ...scenarioContent} = value;

    expect(bindScenarioAreas({...scenarioContent, version: 2}, scenarioBindings)).toEqual(
        value,
    );
});

it('resolves imported descriptors only inside their MF and reacquires a new instance', () => {
    const log = recording();
    const descriptor = log.descriptors.find(
        (entry) => entry.fingerprint.features.label === 'Имя',
    )!;

    const resolver = new TargetResolver(log, root, {}, areas);

    expect(resolver.resolve(descriptor).element).toBe(
        root.querySelector('player-mf input'),
    );
    root.querySelector('player-mf')!.remove();
    expect(resolver.resolve(descriptor).report.status).toBe('broken');
    root.insertAdjacentHTML(
        'beforeend',
        '<player-mf><div><label>Имя<span><input></span></label></div></player-mf>',
    );
    expect(resolver.resolve(descriptor).element).toBe(
        root.querySelector('player-mf input'),
    );
    root.insertAdjacentHTML(
        'beforeend',
        '<player-mf><label>Имя<input></label></player-mf>',
    );
    expect(resolver.areaStatus(descriptor.id)).toBe('ambiguous');
    expect(resolver.resolve(descriptor).report.status).toBe('broken');
});

it('refuses mismatched integration configuration and never enables excluded areas', () => {
    const log = recording();
    const other = new AreaRegistry([
        {...definitions[0]!, hostTag: 'neighbor-mf'},
        ...definitions.slice(1),
    ]);

    expect(() => new TargetResolver(log, root, {}, other)).toThrow('не соответствует');
    const resolver = new TargetResolver(log, root, {}, areas);

    areas.setObserved('search', false);
    expect(resolver.resolve(log.descriptors[0]!).report.status).toBe('broken');
    expect(() => new TargetResolver(log, root)).toThrow('AreaRegistry');
});

it('missing area is unknown even for expected invisibility; a neighbor cannot prove completion', () => {
    const value = scenario();

    root.querySelector('player-mf')!.remove();
    const conditions = new Conditions(value, root, {}, areas);

    expect(conditions.evaluate(value.completion)).toBe('unknown');
    expect(
        conditions.evaluate({kind: 'visible', targetId: 'finish', expected: false}),
    ).toBe('unknown');
});

it('preserves search intent while the player mounts and evaluates completion in the player area', () => {
    const value = scenario();

    root.querySelector('player-mf')!.remove();
    runtime = new ScenarioRuntime(root, value, {areas, acceptUntrustedEvents: true});
    runtime.start();
    root.querySelector('button')!.click();
    expect(runtime.snapshot().status).toBe('confirming');
    root.insertAdjacentHTML('beforeend', '<player-mf><h2>Готово</h2></player-mf>');
    areas.snapshots();
    jest.advanceTimersByTime(100);
    expect(runtime.snapshot().status).toBe('completed');
});

it('invalidates a confirmed click when its owner is remounted before completion', () => {
    const value = scenario();

    root.querySelector('player-mf')!.remove();
    runtime = new ScenarioRuntime(root, value, {areas, acceptUntrustedEvents: true});
    runtime.start();
    root.querySelector('button')!.click();
    root.querySelector('search-mf')!.outerHTML =
        '<search-mf><button>Открыть</button></search-mf>';
    root.insertAdjacentHTML('beforeend', '<player-mf><h2>Готово</h2></player-mf>');
    areas.snapshots();
    jest.advanceTimersByTime(100);
    expect(runtime.snapshot().completedSteps).toBe(0);
    root.querySelector('button')!.click();
    expect(runtime.snapshot().status).toBe('completed');
});

it('waits for the action MF and clears its absence diagnostic when it mounts', () => {
    const value = scenario();

    root.querySelector('search-mf')!.remove();
    runtime = new ScenarioRuntime(root, value, {areas, acceptUntrustedEvents: true});
    runtime.start();
    expect(runtime.snapshot()).toMatchObject({
        status: 'waiting',
        message: 'Ожидаем появления микрофронта.',
    });
    root.insertAdjacentHTML(
        'beforeend',
        '<search-mf><button>Открыть</button></search-mf>',
    );
    areas.snapshots();
    expect(runtime.snapshot()).toMatchObject({status: 'ready', message: ''});
});
