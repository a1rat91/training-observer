/** Проверяет публичную Angular-интеграцию: хозяину не нужны observer, engines или ручная синхронизация снимков. */
import {Component, inject, signal, type Type} from '@angular/core';
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
    type TrainingIntegrationOptions,
    TrainingSession,
} from '@training-observer/angular';
import {type StateRecording, type TrainingScenario} from '@training-observer/contracts';
import {type TrainingFeedback} from '@training-observer/runtime';

const fixtures = new Set<ComponentFixture<unknown>>();
const integration = (root: string): TrainingIntegrationOptions => ({
    root,
    screen: {
        root: {attribute: {name: 'data-procedure'}},
        identity: {kind: 'attribute', name: 'data-screen-key'},
        loading: {name: 'aria-busy', value: 'true'},
    },
    observation: {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0},
});

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
                    successMessage: 'Верно',
                    optional: false,
                },
            ],
        },
    ],
};

@Component({
    selector: 'test-training-owner-a',
    template: `
        @if (mounted()) {
            <section
                id="procedure-a"
                data-procedure
                [attr.data-screen-key]="key()"
            >
                <input
                    id="answer-a"
                    aria-label="Имя"
                />
            </section>
        }
        <button id="stop-a">Остановить</button>
    `,
    providers: [
        provideRecordingSession(integration('#procedure-a')),
        provideTrainingSession(integration('#procedure-a')),
    ],
})
class OwnerA {
    public readonly mounted = signal(true);
    public readonly key = signal('A');
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

@Component({
    selector: 'test-training-owner-b',
    template: `
        <section
            id="procedure-b"
            data-procedure
            data-screen-key="A"
        >
            <input
                id="answer-b"
                aria-label="Имя"
            />
        </section>
        <button id="stop-b">Остановить</button>
    `,
    providers: [
        provideRecordingSession(integration('#procedure-b')),
        provideTrainingSession(integration('#procedure-b')),
    ],
})
class OwnerB {
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

function owner<T>(type: Type<T>): ComponentFixture<T> {
    const fixture = TestBed.createComponent(type);

    fixtures.add(fixture);
    fixture.detectChanges();

    return fixture;
}

function element<T extends HTMLElement>(id: string): T {
    return document.querySelector<T>(`#${id}`)!;
}

/** Настоящий уход фокуса моделирует действие ученика или фокус кнопки остановки. */
function answer(suffix: string, value: string): void {
    const input = element<HTMLInputElement>(`answer-${suffix}`);

    input.focus();
    input.value = value;
    element<HTMLButtonElement>(`stop-${suffix}`).focus();
}

async function settle<T>(fixture: ComponentFixture<T>): Promise<void> {
    await fixture.whenStable();
    // MutationObserver вне Angular zone не входит в whenStable; завершаем текущий DOM turn.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    // JSDOM не раскладывает элементы; реальную геометрию проверяет browser suite.
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

test('recording starts with a fresh baseline and consumes one blur without host synchronization', fakeAsync(() => {
    const fixture = owner(OwnerA);
    const {recording} = fixture.componentInstance;

    answer('a', 'Старый ответ');
    flushMicrotasks();
    tick(1);
    expect(Object.values(recording.confirmedControls())).toHaveLength(1);
    recording.start();
    expect(recording.draft()?.events.map((event) => event.kind)).toEqual(['screen']);
    answer('a', 'Анна');
    flushMicrotasks();
    tick(1);
    fixture.detectChanges();
    flushMicrotasks();
    expect(recording.draft()?.events.filter((event) => event.kind === 'value')).toEqual([
        expect.objectContaining({visit: 1, screenKey: 'A', value: 'Анна'}),
    ]);
    expect(recording.error()).toBeNull();
}));

test('local owners and recording/training in one owner keep independent observations', async () => {
    const a = owner(OwnerA);
    const b = owner(OwnerB);

    // DOMTestComponentRenderer удаляет предыдущий host при создании второго fixture.
    document.body.append(a.nativeElement);
    await settle(a);
    await settle(b);
    const recordA = a.componentInstance.recording;
    const recordB = b.componentInstance.recording;
    const training = a.componentInstance.training;

    expect(recordA).not.toBe(recordB);
    recordA.start();
    recordB.start();
    answer('a', 'Первый ответ');
    await settle(a);
    training.start(scenario);
    a.detectChanges();
    await settle(a);
    expect(
        Object.values(recordA.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Первый ответ']);
    expect(recordB.confirmedControls()).toEqual({});
    expect(recordB.draft()?.events.map((event) => event.kind)).toEqual(['screen']);
    training.stop();
    answer('a', 'Второй ответ');
    answer('b', 'Ответ соседа');
    await settle(a);
    expect(
        recordA
            .draft()
            ?.events.filter((event) => event.kind === 'value')
            .map((event) => event.value),
    ).toEqual(['Первый ответ', 'Второй ответ']);
    expect(
        recordB
            .draft()
            ?.events.filter((event) => event.kind === 'value')
            .map((event) => event.value),
    ).toEqual(['Ответ соседа']);
});

test('stop waits for rendering and includes the pending departure blur in its returned document', fakeAsync(() => {
    const fixture = owner(OwnerA);
    const {recording} = fixture.componentInstance;
    let result: StateRecording | undefined;

    recording.start();
    answer('a', 'Последний ответ');
    void recording.stop().then((document) => {
        result = document;
    });
    expect(recording.stopping()).toBe(true);
    fixture.detectChanges();
    flushMicrotasks();
    expect(result).toEqual(
        expect.objectContaining({
            complete: true,
            events: [
                expect.objectContaining({kind: 'screen', screenKey: 'A'}),
                expect.objectContaining({kind: 'value', value: 'Последний ответ'}),
            ],
        }),
    );
    expect(recording.recording()).toBe(false);
    expect(recording.stopping()).toBe(false);
}));

test('training publishes each new feedback once and starts another attempt with a fresh blur baseline', fakeAsync(() => {
    const fixture = owner(OwnerA);
    const {training} = fixture.componentInstance;
    const feedback: TrainingFeedback[] = [];

    training.feedback$.subscribe((message) => {
        feedback.push(message);
    });
    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(training.progress()?.status).toBe('active');
    answer('a', 'Неверно');
    flushMicrotasks();
    tick(1);
    expect(feedback).toEqual([{kind: 'error', message: 'Введите Анна'}]);
    fixture.detectChanges();
    flushMicrotasks();
    expect(feedback).toHaveLength(1);
    answer('a', 'Анна');
    flushMicrotasks();
    tick(1);
    expect(training.progress()?.status).toBe('complete');
    expect(feedback.map((message) => message.kind)).toEqual(['error', 'success']);
    element<HTMLInputElement>('answer-a').value = 'Начало новой попытки';
    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    expect(training.progress()?.status).toBe('active');
    expect(training.progress()?.completedFields).toBe(0);
    answer('a', 'Неверно');
    flushMicrotasks();
    tick(1);
    expect(feedback.map((message) => message.kind)).toEqual([
        'error',
        'success',
        'error',
    ]);
}));

test('a selector root can appear after construction and remount without consumer observer management', async () => {
    const fixture = TestBed.createComponent(OwnerA);

    fixtures.add(fixture);
    fixture.componentInstance.mounted.set(false);
    fixture.detectChanges();
    await settle(fixture);
    const {recording} = fixture.componentInstance;

    expect(recording.screen().status).toBe('unavailable');
    fixture.componentInstance.mounted.set(true);
    fixture.detectChanges();
    await settle(fixture);
    expect(recording.error()).toBeNull();
    expect(recording.screen()).toEqual(
        expect.objectContaining({status: 'ready', key: 'A'}),
    );
    const firstRoot = recording.screen().rootNodeId;

    recording.start();
    fixture.componentInstance.mounted.set(false);
    fixture.detectChanges();
    await settle(fixture);
    expect(recording.screen().status).toBe('unavailable');
    fixture.componentInstance.mounted.set(true);
    fixture.detectChanges();
    await settle(fixture);
    expect(recording.screen()).toEqual(
        expect.objectContaining({status: 'ready', key: 'A'}),
    );
    expect(recording.screen().rootNodeId).not.toBe(firstRoot);
});

test('destroy completes feedback and cancels pending work before either facade can restart', fakeAsync(() => {
    const fixture = owner(OwnerA);
    const {recording, training} = fixture.componentInstance;
    const feedback: TrainingFeedback[] = [];
    let completed = false;

    training.feedback$.subscribe({
        next: (message) => {
            feedback.push(message);
        },
        complete: () => {
            completed = true;
        },
    });
    recording.start();
    training.start(scenario);
    fixture.detectChanges();
    flushMicrotasks();
    answer('a', 'Отменённый ответ');
    fixtures.delete(fixture);
    fixture.destroy();
    const stoppedDraft = recording.draft();

    flushMicrotasks();
    tick(20);
    expect(completed).toBe(true);
    expect(feedback).toEqual([]);
    expect(recording.draft()).toEqual(stoppedDraft);
    expect(() => recording.start()).toThrow(/destroyed/i);
    expect(() => training.start(scenario)).toThrow(/destroyed/i);
}));
