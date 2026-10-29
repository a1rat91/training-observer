/** Сеансы используют зарегистрированный адаптер экрана без конфигурации на странице. */
import {
    Component,
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
    signal,
} from '@angular/core';
import {
    type ComponentFixture,
    fakeAsync,
    flushMicrotasks,
    TestBed,
    tick,
} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    provideRecordingSession,
    provideTrainingSession,
    RecordingSession,
    TrainingSession,
} from '@training-observer/angular';
import {type TrainingScenario} from '@training-observer/contracts';
import {
    DOM_OBSERVATION_OPTIONS,
    DOM_SNAPSHOT_OPTIONS,
    provideScreenAdapters,
    readScreenState,
    SCREEN_ADAPTERS,
    type ScreenAdapter,
} from '@training-observer/core';
import {type ScreenStateOptions} from '@training-observer/core/models';

const screenOptions: ScreenStateOptions = {
    root: {attribute: {name: 'data-session-screen'}},
    identity: {kind: 'attribute', name: 'block-id'},
};

const adapter: ScreenAdapter = {
    id: 'test-procedure-player',
    rootSelector: '[data-session-screen]',
    read: (snapshot, controls) => readScreenState(snapshot, controls, screenOptions),
};

const fixtures = new Set<ComponentFixture<unknown>>();

@Component({
    template: `
        <section
            data-session-screen
            [attr.block-id]="key()"
        >
            <input
                id="adapter-answer"
                aria-label="Имя"
            />
        </section>
        <button id="adapter-stop">Остановить</button>
    `,
    providers: [provideRecordingSession(), provideTrainingSession()],
})
class AdaptedOwner {
    public readonly key = signal('A');
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

@Component({
    template: '<section data-session-screen block-id="explicit"></section>',
    providers: [
        provideRecordingSession({screen: screenOptions}),
        provideTrainingSession({screen: screenOptions}),
    ],
})
class ConfiguredOwner {
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

const scenario: TrainingScenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {
            key: 'A',
            task: 'Введите имя',
            transitionMessage: 'Вернитесь к первому экрану',
            fields: [
                {
                    descriptor: {
                        kind: 'textbox',
                        label: 'Имя',
                        role: 'textbox',
                        tagName: 'input',
                        context: [],
                    },
                    expected: 'Анна',
                    message: 'Введите Анна',
                    optional: false,
                },
            ],
        },
    ],
};

function owner(): ComponentFixture<AdaptedOwner> {
    const fixture = TestBed.createComponent(AdaptedOwner);

    fixtures.add(fixture);
    fixture.detectChanges();

    return fixture;
}

async function settle<T>(fixture: ComponentFixture<T>): Promise<void> {
    await fixture.whenStable();

    // MutationObserver и следующий capture работают вне Angular zone, в отдельных turn.
    for (let turn = 0; turn < 2; turn++) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
            provideScreenAdapters(adapter),
            {
                provide: DOM_OBSERVATION_OPTIONS,
                useFactory: () => ({
                    ...inject(DOM_SNAPSHOT_OPTIONS),
                    includeText: false,
                    batchDelayMs: 0,
                    propertyCheckIntervalMs: 0,
                }),
            },
        ],
    });
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
});

afterEach(() => {
    for (const fixture of fixtures) {
        fixture.destroy();
    }

    fixtures.clear();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
});

test('a configless recording records adapted block changes as existing screen visits', async () => {
    const fixture = owner();
    const {recording, key} = fixture.componentInstance;

    await settle(fixture);
    expect(recording.screen().key).toBe('A');
    recording.start();
    const initialScans = recording.scanCount();

    key.set('B');
    fixture.detectChanges();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('section').getAttribute('block-id')).toBe(
        'B',
    );
    expect(recording.scanCount()).toBeGreaterThan(initialScans);
    expect(recording.screen().key).toBe('B');
    key.set('A');
    fixture.detectChanges();
    await settle(fixture);
    fixture.nativeElement.querySelector('section').setAttribute('data-other', 'change');
    await settle(fixture);
    expect(recording.draft()?.events).toEqual([
        expect.objectContaining({kind: 'screen', screenKey: 'A', visit: 1}),
        expect.objectContaining({kind: 'screen', screenKey: 'B', visit: 2}),
        expect.objectContaining({kind: 'screen', screenKey: 'A', visit: 3}),
    ]);
    expect(recording.error()).toBeNull();
});

test('a configless training session evaluates blur confirmations from the adapted screen', fakeAsync(() => {
    const fixture = owner();
    const {training} = fixture.componentInstance;

    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(training.progress()?.status).toBe('active');
    const input = document.querySelector<HTMLInputElement>('#adapter-answer')!;

    input.focus();
    input.value = 'Анна';
    document.querySelector<HTMLButtonElement>('#adapter-stop')!.focus();
    flushMicrotasks();
    tick(1);
    expect(training.progress()?.status).toBe('complete');
    expect(training.error()).toBeNull();
}));

test('explicit screen options take priority over registered adapters for both sessions', async () => {
    const read = jest.spyOn(adapter, 'read');
    const fixture = TestBed.createComponent(ConfiguredOwner);

    fixtures.add(fixture);
    fixture.detectChanges();
    await settle(fixture);
    expect(fixture.componentInstance.recording.screen().key).toBe('explicit');
    expect(fixture.componentInstance.training.screen().key).toBe('explicit');
    expect(read).not.toHaveBeenCalled();
});

test('a configless session without a registered adapter reports an unavailable screen', async () => {
    TestBed.overrideProvider(SCREEN_ADAPTERS, {useValue: []});
    const fixture = owner();

    await settle(fixture);
    expect(fixture.componentInstance.recording.screen()).toEqual(
        expect.objectContaining({
            status: 'unavailable',
            reason: 'adapter-missing',
            controls: [],
        }),
    );
    expect(fixture.componentInstance.training.screen().reason).toBe('adapter-missing');
    expect(() => fixture.componentInstance.recording.start()).toThrow(/готового экрана/);
});

test('a child injector inherits screen adapters without changing its parent registration', () => {
    const childAdapter: ScreenAdapter = {...adapter, id: 'child-screen'};
    const parent = TestBed.inject(EnvironmentInjector);
    const child = createEnvironmentInjector(
        [provideScreenAdapters(childAdapter)],
        parent,
    );

    try {
        expect(child.get(SCREEN_ADAPTERS)).toEqual([adapter, childAdapter]);
        expect(parent.get(SCREEN_ADAPTERS)).toEqual([adapter]);
    } finally {
        child.destroy();
    }
});
