/** Смена физического root продолжает попытку, а явный start создаёт новую. */
import {Component, inject} from '@angular/core';
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    provideRecordingSession,
    provideTrainingSession,
    RecordingSession,
    TrainingSession,
} from '@training-observer/angular';
import {type TrainingScenario} from '@training-observer/contracts';
import {provideDomObservation, TrainingObserver} from '@training-observer/core';

const options = {
    root: '#replacement-procedure',
    screen: {
        root: {attribute: {name: 'data-procedure'}},
        identity: {kind: 'attribute' as const, name: 'data-screen'},
    },
    observation: {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0},
};

const scenario: TrainingScenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {
            key: 'A',
            task: 'Введите ответ',
            transitionMessage: 'Вернитесь',
            fields: [
                {
                    descriptor: {
                        kind: 'textbox',
                        label: 'Ответ',
                        role: 'textbox',
                        tagName: 'input',
                        context: [],
                    },
                    expected: 'Готово',
                    message: 'Исправьте ответ',
                    successMessage: 'Верно',
                    optional: false,
                },
            ],
        },
        {key: 'B', task: 'Откройте экран', transitionMessage: 'Вернитесь', fields: []},
    ],
};

@Component({
    template: `
        <section
            id="replacement-procedure"
            data-procedure
            data-screen="A"
        >
            <input aria-label="Ответ" />
        </section>
        <button id="replacement-stop">Остановить</button>
    `,
    providers: [provideRecordingSession(options), provideTrainingSession(options)],
})
class ReplacementOwner {
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

const fixtures = new Set<ComponentFixture<ReplacementOwner>>();

async function settle(fixture: ComponentFixture<ReplacementOwner>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    // MutationObserver вне Angular zone не входит в whenStable.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

async function owner(): Promise<ComponentFixture<ReplacementOwner>> {
    const fixture = TestBed.createComponent(ReplacementOwner);

    fixtures.add(fixture);
    await settle(fixture);
    fixture.componentInstance.recording.start();
    fixture.componentInstance.training.start(scenario);
    await settle(fixture);

    return fixture;
}

function answer(blur = true): void {
    const input = document.querySelector<HTMLInputElement>(
        '#replacement-procedure input',
    )!;

    input.focus();
    input.value = 'Готово';

    if (blur) {
        document.querySelector<HTMLButtonElement>('#replacement-stop')!.focus();
    }
}

function screen(key: string): HTMLElement {
    const root = document.createElement('section');

    root.id = 'replacement-procedure';
    root.setAttribute('data-procedure', '');
    root.setAttribute('data-screen', key);

    return root;
}

function replaceRoot(key: string): void {
    const oldRoot = document.querySelector('#replacement-procedure')!;

    oldRoot.replaceWith(screen(key));
    // Уничтожение view может очистить содержимое старого Element до observer callback.
    oldRoot.replaceChildren();
}

beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideDomObservation()]});
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

test('same-turn replacement retains the last blur even when the detached root is emptied', async () => {
    const fixture = await owner();
    const {recording, training} = fixture.componentInstance;

    // Ставим MutationObserver в очередь раньше focusout microtask.
    document.querySelector('#replacement-procedure')!.setAttribute('data-turn', '1');
    answer();
    replaceRoot('B');
    await settle(fixture);

    expect(recording.draft()?.events.map((event) => event.kind)).toEqual([
        'screen',
        'value',
        'screen',
    ]);
    expect(recording.draft()?.events[1]).toEqual(
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Готово'}),
    );
    expect(training.progress()).toEqual(
        expect.objectContaining({step: 2, status: 'complete'}),
    );
});

test('replacement preserves already published confirmations while the next root changes', async () => {
    const fixture = await owner();
    const {training} = fixture.componentInstance;

    answer();
    await settle(fixture);
    expect(training.progress()?.completedFields).toBe(1);
    replaceRoot('B');
    await settle(fixture);
    expect(training.progress()).toEqual(
        expect.objectContaining({step: 2, status: 'complete'}),
    );
});

test('Stop in the replacement turn includes the departing answer in its returned document', async () => {
    const fixture = await owner();
    const {recording} = fixture.componentInstance;

    answer();
    replaceRoot('B');
    const result = recording.stop();

    await settle(fixture);
    expect((await result).events).toEqual([
        expect.objectContaining({kind: 'screen', screenKey: 'A'}),
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Готово'}),
        expect.objectContaining({kind: 'screen', screenKey: 'B'}),
    ]);
});

test('remount after a missing-root turn retains the departure and keeps the observation gap', async () => {
    const fixture = await owner();
    const {recording, training} = fixture.componentInstance;
    const oldRoot = document.querySelector('#replacement-procedure')!;

    answer();
    oldRoot.remove();
    oldRoot.replaceChildren();
    await settle(fixture);
    expect(recording.screen().status).toBe('unavailable');
    expect(recording.draft()?.complete).toBe(false);
    expect(recording.draft()?.events[1]).toEqual(
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Готово'}),
    );
    fixture.nativeElement.append(screen('B'));
    await settle(fixture);
    expect(training.progress()).toEqual(
        expect.objectContaining({step: 2, status: 'complete'}),
    );
});

test('replacement does not confirm an edited field without focusout', async () => {
    const fixture = await owner();
    const {recording, training} = fixture.componentInstance;

    answer(false);
    replaceRoot('B');
    await settle(fixture);
    expect(recording.confirmedControls()).toEqual({});
    expect(recording.draft()?.events.map((event) => event.kind)).toEqual([
        'screen',
        'screen',
    ]);
    expect(training.progress()?.step).toBe(1);
});

test('a new attempt cancels pending evidence from the previous root', async () => {
    const fixture = await owner();
    const {training} = fixture.componentInstance;

    answer();
    replaceRoot('B');
    training.start(scenario);
    await settle(fixture);
    expect(training.progress()?.step).toBe(1);
    expect(training.progress()?.status).toBe('active');
});

test('explicit core start resets history and an isolated capture never adopts another root', async () => {
    const fixture = await owner();
    const observer = TestBed.inject(TrainingObserver);
    const root = document.querySelector('#replacement-procedure')!;
    const other = screen('B');

    other.id = 'isolated-procedure';
    fixture.nativeElement.append(other);
    observer.start(root, options.observation);
    answer();
    await Promise.resolve();
    observer.flush();
    const confirmed = observer.confirmedControls();
    const snapshot = observer.snapshot();

    expect(Object.values(confirmed).map((control) => control.state.value)).toEqual([
        'Готово',
    ]);
    observer.capture(other);
    expect(observer.confirmedControls()).toBe(confirmed);
    expect(observer.snapshot()).toBe(snapshot);
    observer.start(other);
    expect(observer.confirmedControls()).toEqual({});
    await settle(fixture);
});

test('core continuation retains its options through a null root and validates before retirement', async () => {
    const fixture = await owner();
    const observer = TestBed.inject(TrainingObserver);
    const root = document.querySelector('#replacement-procedure')!;

    observer.start(root, {...options.observation, maxNodes: 1});
    const snapshot = observer.snapshot();

    expect(() => observer.reconnect(root, {batchDelayMs: -1})).toThrow();
    expect(observer.isObserving()).toBe(true);
    expect(observer.snapshot()).toBe(snapshot);
    observer.reconnect(null);
    observer.reconnect(root);
    expect(observer.snapshot()?.stats.nodeCount).toBe(1);
    expect(observer.snapshot()?.stats.truncated).toBe(true);
    await settle(fixture);
});

test.each([
    {maxNodes: 0},
    {maxNodes: 1.5},
    {maxDepth: -1},
    {maxDepth: 101},
    {ignoreSelector: '['},
    {boundarySelector: '['},
])(
    'invalid null-root options %j preserve the active session and its settings',
    async (invalid) => {
        const fixture = await owner();
        const observer = TestBed.inject(TrainingObserver);
        const root = document.querySelector('#replacement-procedure')!;

        observer.start(root, {...options.observation, maxNodes: 2});
        const snapshot = observer.snapshot();

        answer();
        expect(() => observer.reconnect(null, invalid)).toThrow();
        expect(observer.isObserving()).toBe(true);
        expect(observer.snapshot()).toBe(snapshot);
        expect(observer.confirmedControls()).toEqual({});
        await Promise.resolve();
        observer.flush();
        expect(
            Object.values(observer.confirmedControls()).map(
                (control) => control.state.value,
            ),
        ).toEqual(['Готово']);
        observer.reconnect(null);
        observer.reconnect(root);
        expect(observer.isObserving()).toBe(true);
        expect(observer.snapshot()?.stats.nodeCount).toBe(2);
        expect(observer.snapshot()?.stats.truncated).toBe(false);
        await settle(fixture);
    },
);
