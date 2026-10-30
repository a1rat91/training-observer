/** Blur belongs to its departing screen even when the next screen reuses the same native input. */
import {Component, inject} from '@angular/core';
import {
    type ComponentFixture,
    fakeAsync,
    flushMicrotasks,
    TestBed,
    tick,
} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {type TrainingScenario} from '@training-observer/contracts';
import {
    type ControlAdapter,
    provideControlAdapters,
    provideDomObservation,
    provideScreenAdapters,
    readScreenState,
    type ScreenAdapter,
    type ScreenStateOptions,
    TrainingObserver,
} from '@training-observer/core';
import {provideRecordingSession, RecordingSession} from '@training-observer/recording';
import {provideTrainingSession, TrainingSession} from '@training-observer/runtime';

const screenOptions: ScreenStateOptions = {
    root: {attribute: {name: 'data-confirmation-screen'}},
    identity: {kind: 'attribute', name: 'data-screen-key'},
};

const observation = {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0};
const adapter: ScreenAdapter = {
    id: 'local-confirmation-screen',
    read(snapshot, controls) {
        const screen = readScreenState(snapshot, controls, screenOptions);

        return screen.reason === 'root-missing' ? null : screen;
    },
};

const template = `
    <section id="confirmation-screen" data-confirmation-screen data-screen-key="A">
        <input id="confirmation-answer" aria-label="Ответ" />
    </section>
    <button id="confirmation-outside">Продолжить</button>
`;

@Component({
    template,
    providers: [
        provideRecordingSession({
            root: '#confirmation-screen',
            screen: screenOptions,
            observation,
        }),
    ],
})
class RecordingOwner {
    public readonly recording = inject(RecordingSession);
}

@Component({
    template,
    providers: [
        provideTrainingSession({
            root: '#confirmation-screen',
            screen: screenOptions,
            observation,
        }),
    ],
})
class TrainingOwner {
    public readonly training = inject(TrainingSession);
}

@Component({
    template,
    providers: [provideDomObservation(), provideScreenAdapters(adapter)],
})
class AdapterOwner {
    public readonly observer = inject(TrainingObserver);
}

@Component({template, providers: [provideDomObservation()]})
class UnclaimedOwner {
    public readonly observer = inject(TrainingObserver);
}

const popupAdapter: ControlAdapter = {
    id: 'confirmation-popup',
    match: ({target}) =>
        target.attributes['id'] === 'confirmation-answer'
            ? {status: 'match', kind: 'combobox'}
            : null,
};

@Component({
    template: `
        <section id="confirmation-screen">
            <input
                id="confirmation-answer"
                aria-controls="confirmation-popup"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-label="Ответ"
                role="combobox"
                value="Вариант"
            />
        </section>
        <div
            id="confirmation-popup"
            role="listbox"
        >
            <button
                id="confirmation-option"
                aria-selected="true"
                role="option"
            >
                Вариант
            </button>
        </div>
        <button id="confirmation-outside">Продолжить</button>
    `,
    providers: [provideDomObservation(), provideControlAdapters(popupAdapter)],
})
class PopupOwner {
    public readonly observer = inject(TrainingObserver);
}

let fixture: ComponentFixture<unknown>;

function input(): HTMLInputElement {
    return document.querySelector<HTMLInputElement>('#confirmation-answer')!;
}

function root(): HTMLElement {
    return document.querySelector<HTMLElement>('#confirmation-screen')!;
}

function outside(): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>('#confirmation-outside')!;
}

function replaceScreen(): void {
    root().setAttribute('data-screen-key', 'B');
    input().value = 'Предзаполнено на B';
}

function recording(): RecordingSession {
    const owner = TestBed.createComponent(RecordingOwner);

    fixture = owner;
    owner.detectChanges();
    owner.componentInstance.recording.start();

    return owner.componentInstance.recording;
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
});

afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
});

test.each(['blur', 'focusout'] as const)(
    'the %s handler can reuse the input for B without changing its departing A answer',
    fakeAsync((eventType: 'blur' | 'focusout') => {
        const session = recording();

        input().focus();
        input().value = 'Ответ на A';
        input().addEventListener(eventType, replaceScreen, {once: true});
        outside().focus();
        flushMicrotasks();
        tick(1);
        expect(session.draft()?.events).toEqual([
            expect.objectContaining({kind: 'screen', screenKey: 'A', visit: 1}),
            expect.objectContaining({
                kind: 'value',
                screenKey: 'A',
                visit: 1,
                value: 'Ответ на A',
            }),
            expect.objectContaining({kind: 'screen', screenKey: 'B', visit: 2}),
        ]);
        expect(session.controls()[0]?.state.value).toBe('Предзаполнено на B');
    }),
);

test.each(['blur', 'focusout'] as const)(
    'same-screen formatting in the %s handler still confirms the settled value',
    fakeAsync((eventType: 'blur' | 'focusout') => {
        const session = recording();

        input().focus();
        input().value = '  ответ  ';
        input().addEventListener(
            eventType,
            () => {
                input().value = input().value.trim().toUpperCase();
            },
            {once: true},
        );
        outside().focus();
        flushMicrotasks();
        tick(1);
        expect(session.draft()?.events).toEqual([
            expect.objectContaining({kind: 'screen', screenKey: 'A'}),
            expect.objectContaining({kind: 'value', screenKey: 'A', value: 'ОТВЕТ'}),
        ]);
    }),
);

test('synthetic focusout remains supported without a preceding native blur event', fakeAsync(() => {
    const session = recording();

    input().value = 'Ответ на A';
    input().addEventListener('focusout', replaceScreen, {once: true});
    input().dispatchEvent(
        new FocusEvent('focusout', {bubbles: true, relatedTarget: outside()}),
    );
    flushMicrotasks();
    tick(1);
    expect(session.draft()?.events[1]).toEqual(
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Ответ на A'}),
    );
}));

test('explicit session screen rules also override the confirmation context supplied by registered adapters', fakeAsync(() => {
    const read = jest.fn(() => ({
        schemaVersion: 1 as const,
        status: 'ready' as const,
        reason: 'ready' as const,
        key: 'fixed-adapter-context',
        rootNodeId: 'fixed-adapter-root',
        controls: [],
    }));

    TestBed.configureTestingModule({
        providers: [provideScreenAdapters({id: 'unused-confirmation-adapter', read})],
    });
    const session = recording();

    input().focus();
    input().value = 'Ответ на A';
    input().addEventListener('blur', replaceScreen, {once: true});
    outside().focus();
    flushMicrotasks();
    tick(1);
    expect(session.draft()?.events[1]).toEqual(
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Ответ на A'}),
    );
    expect(read).not.toHaveBeenCalled();
}));

test.each(['blur', 'focusout'] as const)(
    'training checks the old screen answer before the %s handler reuses its input',
    fakeAsync((eventType: 'blur' | 'focusout') => {
        const owner = TestBed.createComponent(TrainingOwner);

        fixture = owner;
        owner.detectChanges();
        const scenario: TrainingScenario = {
            kind: 'training-state-scenario',
            version: 1,
            steps: [
                {
                    key: 'A',
                    task: '',
                    transitionMessage: 'Вернитесь на A',
                    fields: [
                        {
                            descriptor: {
                                kind: 'textbox',
                                label: 'Ответ',
                                tagName: 'input',
                                role: 'textbox',
                                context: [],
                            },
                            expected: 'Ответ на A',
                            optional: false,
                            message: 'Неверный ответ',
                        },
                    ],
                },
                {key: 'B', task: '', transitionMessage: '', fields: []},
            ],
        };

        const {training} = owner.componentInstance;

        training.start(scenario);
        owner.detectChanges();
        input().focus();
        input().value = 'Ответ на A';
        input().addEventListener(eventType, replaceScreen, {once: true});
        outside().focus();
        flushMicrotasks();
        tick(1);
        expect(training.progress()).toEqual(
            expect.objectContaining({step: 2, status: 'complete'}),
        );
    }),
);

test('local screen adapters reach the session and an in-handler capture cannot consume the pending departure', fakeAsync(() => {
    const owner = TestBed.createComponent(AdapterOwner);

    fixture = owner;
    owner.detectChanges();
    const {observer} = owner.componentInstance;

    observer.start(root(), observation);
    input().focus();
    input().value = 'Ответ на A';
    input().addEventListener(
        'blur',
        () => {
            replaceScreen();
            observer.capture();
            expect(observer.confirmedControls()).toEqual({});
        },
        {once: true},
    );
    outside().focus();
    flushMicrotasks();
    observer.flush();
    tick(1);
    expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe(
        'Ответ на A',
    );
    expect(observer.logicalControls()[0]?.state.value).toBe('Предзаполнено на B');
}));

test('redacted departures never expose their captured value', fakeAsync(() => {
    const session = recording();

    input().type = 'password';
    input().focus();
    input().value = 'секрет';
    outside().focus();
    flushMicrotasks();
    tick(1);
    expect(session.confirmedControls()).toEqual({});
    expect(session.draft()?.events).toHaveLength(1);
    expect(JSON.stringify(session.snapshot())).not.toContain('секрет');
}));

test('an unclaimed screen preserves settled formatting without screen configuration', fakeAsync(() => {
    const owner = TestBed.createComponent(UnclaimedOwner);

    fixture = owner;
    owner.detectChanges();
    const {observer} = owner.componentInstance;

    observer.start(root(), observation);
    input().focus();
    input().value = '  ответ  ';
    input().addEventListener(
        'blur',
        () => {
            input().value = input().value.trim().toUpperCase();
        },
        {once: true},
    );
    outside().focus();
    flushMicrotasks();
    observer.flush();
    tick(1);
    expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe('ОТВЕТ');
}));

test('native blur into an owned popup remains internal focus and confirms only when leaving the popup', fakeAsync(() => {
    const owner = TestBed.createComponent(PopupOwner);

    fixture = owner;
    owner.detectChanges();
    const {observer} = owner.componentInstance;

    observer.start(root(), observation);
    input().focus();
    document.querySelector<HTMLButtonElement>('#confirmation-option')!.focus();
    flushMicrotasks();
    observer.flush();
    expect(observer.confirmedControls()).toEqual({});
    outside().focus();
    flushMicrotasks();
    observer.flush();
    tick(1);
    expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe('Вариант');
}));

test('departure A is confirmed if B reuses and refocuses its input synchronously', fakeAsync(() => {
    const session = recording();
    const answer = input();

    answer.focus();
    answer.value = 'Ответ на A';
    outside().addEventListener(
        'focus',
        () => {
            replaceScreen();
            answer.focus();
        },
        {once: true},
    );
    outside().focus();
    expect(document.activeElement).toBe(answer);
    flushMicrotasks();
    tick(1);
    expect(session.draft()?.events).toEqual([
        expect.objectContaining({kind: 'screen', screenKey: 'A', visit: 1}),
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'Ответ на A'}),
        expect.objectContaining({kind: 'screen', screenKey: 'B', visit: 2}),
    ]);
}));

test.each([true, false])(
    'returning before the batch does not confirm an unfinished edit (input event: %s)',
    fakeAsync((dispatchInput: boolean) => {
        const session = recording();
        const answer = input();

        answer.focus();
        answer.value = 'Подтвержденный ответ';
        outside().focus();
        flushMicrotasks();
        answer.focus();
        answer.value = 'Новое незавершенное редактирование';

        if (dispatchInput) {
            answer.dispatchEvent(new Event('input', {bubbles: true}));
        }

        tick(1);
        expect(session.draft()?.events).toEqual([
            expect.objectContaining({kind: 'screen', screenKey: 'A', visit: 1}),
            expect.objectContaining({
                kind: 'value',
                screenKey: 'A',
                value: 'Подтвержденный ответ',
            }),
        ]);
    }),
);

test('a second real blur confirms the resumed edit before the first batch', fakeAsync(() => {
    const session = recording();

    input().focus();
    input().value = 'Первый ответ';
    outside().focus();
    flushMicrotasks();
    input().focus();
    input().value = 'Последний подтвержденный ответ';
    outside().focus();
    flushMicrotasks();
    tick(1);
    expect(session.draft()?.events[1]).toEqual(
        expect.objectContaining({
            kind: 'value',
            screenKey: 'A',
            value: 'Последний подтвержденный ответ',
        }),
    );
}));

test('same-screen formatting may emit an input event after the departure microtask', fakeAsync(() => {
    const session = recording();

    input().focus();
    input().value = '  ответ  ';
    input().addEventListener(
        'blur',
        () => {
            queueMicrotask(() => {
                input().value = input().value.trim().toUpperCase();
                input().dispatchEvent(new Event('input', {bubbles: true}));
            });
        },
        {once: true},
    );
    outside().focus();
    flushMicrotasks();
    tick(1);
    expect(session.draft()?.events[1]).toEqual(
        expect.objectContaining({kind: 'value', screenKey: 'A', value: 'ОТВЕТ'}),
    );
}));

test('a null-relatedTarget transfer into the same popup still cancels confirmation', fakeAsync(() => {
    const owner = TestBed.createComponent(PopupOwner);

    fixture = owner;
    owner.detectChanges();
    const {observer} = owner.componentInstance;

    observer.start(root(), observation);
    input().focus();
    input().dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    document.querySelector<HTMLButtonElement>('#confirmation-option')!.focus();
    flushMicrotasks();
    observer.flush();
    tick(1);
    expect(observer.confirmedControls()).toEqual({});
}));

test('a real popup departure after an internal transfer confirms before the same batch', fakeAsync(() => {
    const owner = TestBed.createComponent(PopupOwner);

    fixture = owner;
    owner.detectChanges();
    const {observer} = owner.componentInstance;

    observer.start(root(), observation);
    input().focus();
    input().dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    document.querySelector<HTMLButtonElement>('#confirmation-option')!.focus();
    flushMicrotasks();
    outside().focus();
    flushMicrotasks();
    observer.flush();
    tick(1);
    expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe('Вариант');
}));

test.each([true, false])(
    'retiring a refocused reused input preserves its captured A answer (missing root: %s)',
    fakeAsync((missingRoot: boolean) => {
        const owner = TestBed.createComponent(AdapterOwner);

        fixture = owner;
        owner.detectChanges();
        const {observer} = owner.componentInstance;

        observer.start(root(), observation);
        input().focus();
        input().value = 'Ответ на A';
        outside().addEventListener(
            'focus',
            () => {
                replaceScreen();
                input().focus();
            },
            {once: true},
        );
        outside().focus();
        flushMicrotasks();
        const oldRoot = root();
        const replacement = oldRoot.cloneNode(true) as HTMLElement;

        if (missingRoot) {
            oldRoot.remove();
            observer.reconnect(null);
            expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe(
                'Ответ на A',
            );
            fixture.nativeElement.append(replacement);
        } else {
            oldRoot.replaceWith(replacement);
        }

        observer.reconnect(replacement);
        expect(Object.values(observer.confirmedControls())[0]?.state.value).toBe(
            'Ответ на A',
        );
        tick(1);
    }),
);
