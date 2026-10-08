/** Проверяет отмену действий между созданием владельца, рендером и DestroyRef. */
import {Component, inject} from '@angular/core';
import {
    type ComponentFixture,
    fakeAsync,
    flushMicrotasks,
    TestBed,
    tick,
} from '@angular/core/testing';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideServerRendering, renderApplication} from '@angular/platform-server';
import {expect} from '@jest/globals';
import {
    provideRecordingSession,
    provideTrainingSession,
    RecordingSession,
    type TrainingIntegrationOptions,
    TrainingSession,
} from '@training-observer/angular';
import {type StateRecording, type TrainingScenario} from '@training-observer/contracts';

const fixtures = new Set<ComponentFixture<LifecycleOwner>>();
const integration: TrainingIntegrationOptions = {
    root: '#lifecycle-procedure',
    screen: {
        root: {attribute: {name: 'data-procedure'}},
        identity: {kind: 'attribute', name: 'data-screen-key'},
    },
    observation: {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0},
};

const scenario: TrainingScenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {key: 'A', task: 'Откройте экран', transitionMessage: 'Вернитесь', fields: []},
    ],
};

@Component({
    selector: 'test-training-lifecycle-owner',
    template: `
        <section
            id="lifecycle-procedure"
            data-procedure
            data-screen-key="A"
        >
            <input
                id="lifecycle-answer"
                aria-label="Имя"
            />
        </section>
        <button id="lifecycle-stop">Остановить</button>
        <p>{{ recording.screen().status }} / {{ training.screen().status }}</p>
    `,
    providers: [
        provideRecordingSession(integration),
        provideTrainingSession(integration),
    ],
})
class LifecycleOwner {
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

function createOwner(): ComponentFixture<LifecycleOwner> {
    const fixture = TestBed.createComponent(LifecycleOwner);

    fixtures.add(fixture);

    return fixture;
}

function destroyOwner(fixture: ComponentFixture<LifecycleOwner>): void {
    fixtures.delete(fixture);
    fixture.destroy();
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    // В JSDOM геометрии нет; браузерные проверки используют настоящий layout.
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

test('stop before the first render cancels automatic observation until explicit start', fakeAsync(() => {
    const fixture = createOwner();
    const {training} = fixture.componentInstance;

    training.stop();
    fixture.detectChanges();
    flushMicrotasks();
    tick(1);
    expect(training.screen()).toEqual(
        expect.objectContaining({status: 'unavailable', reason: 'no-snapshot'}),
    );
    expect(training.progress()).toBeNull();
    document
        .querySelector<HTMLInputElement>('#lifecycle-answer')!
        .setAttribute('value', 'Позже');
    flushMicrotasks();
    tick(20);
    expect(training.screen().reason).toBe('no-snapshot');

    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(training.screen()).toEqual(
        expect.objectContaining({status: 'ready', key: 'A'}),
    );
    expect(training.progress()?.status).toBe('complete');
}));

test('destroy rejects a pending recording stop and cancels the queued blur and render', fakeAsync(() => {
    const fixture = createOwner();

    fixture.detectChanges();
    const {recording} = fixture.componentInstance;
    const input = document.querySelector<HTMLInputElement>('#lifecycle-answer')!;
    const button = document.querySelector<HTMLButtonElement>('#lifecycle-stop')!;
    let result: StateRecording | undefined;
    let failure: unknown;

    recording.start();
    input.focus();
    input.value = 'Отменённый ответ';
    button.focus();
    void recording.stop().then(
        (document) => {
            result = document;
        },
        (error: unknown) => {
            failure = error;
        },
    );
    const draft = recording.draft();

    expect(recording.stopping()).toBe(true);
    destroyOwner(fixture);
    flushMicrotasks();
    tick(20);
    expect(result).toBeUndefined();
    expect(failure).toEqual(
        expect.objectContaining({message: expect.stringMatching(/destroyed/i)}),
    );
    expect(recording.draft()).toEqual(draft);
    expect(recording.stopping()).toBe(false);
    expect(() => recording.start()).toThrow(/destroyed/i);
}));

test('server rendering uses public providers without DOM observation and disposes queued startup', async () => {
    let owner: LifecycleOwner | undefined;
    let stopped: Promise<StateRecording> | undefined;
    let feedbackCompleted = false;
    let feedbackCount = 0;
    const html = await renderApplication(
        async (context) => {
            const application = await bootstrapApplication(
                LifecycleOwner,
                {providers: [provideServerRendering()]},
                context,
            );

            owner = application.components[0].instance as LifecycleOwner;
            owner.training.feedback$.subscribe({
                next: () => {
                    feedbackCount++;
                },
                complete: () => {
                    feedbackCompleted = true;
                },
            });
            owner.training.start(scenario);
            const recording = owner.recording;

            expect(() => recording.start()).toThrow(/готового экрана/i);
            stopped = recording.stop();

            return application;
        },
        {
            document: '<test-training-lifecycle-owner></test-training-lifecycle-owner>',
            url: 'http://localhost/lifecycle',
            allowedHosts: ['localhost'],
        },
    );

    expect(html).toContain('unavailable / unavailable');
    expect(owner?.recording.snapshot()).toBeNull();
    expect(owner?.training.progress()).toBeNull();
    expect(owner?.recording.error()).toBeNull();
    expect(owner?.training.error()).toBeNull();
    expect(await stopped).toEqual(expect.objectContaining({events: []}));
    expect(feedbackCount).toBe(0);
    expect(feedbackCompleted).toBe(true);
});
