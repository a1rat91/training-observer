import {ElementRecorder, parseRecording} from '../src';

let root: HTMLElement;
let recorder: ElementRecorder;
let field: HTMLInputElement;

function send(type: string): void {
    field.dispatchEvent(new Event(type, {bubbles: true}));
    jest.advanceTimersByTime(0);
}

function input(value: string): void {
    field.value = value;
    send('input');
}

beforeEach(() => {
    jest.useFakeTimers();
    root = document.createElement('main');
    root.innerHTML = '<label>Имя<input></label><button>Далее</button>';
    document.body.append(root);
    field = root.querySelector('input')!;
    recorder = new ElementRecorder(root, {
        valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
        acceptUntrustedEvents: true,
    });
    recorder.start();
});
afterEach(() => {
    recorder.stop();
    root.remove();
    jest.useRealTimers();
});

it('slow typing and native change remain drafts; only blur emits the final value once', () => {
    input('А');
    jest.advanceTimersByTime(2000);
    input('Ан');
    jest.advanceTimersByTime(2000);
    input('Анна');
    send('change');
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.hasUncommittedInput).toBe(true);
    send('blur');
    send('change');
    send('blur');
    expect(parseRecording(recorder.export()).actions).toEqual([
        expect.objectContaining({
            kind: 'input',
            commit: 'blur',
            value: {status: 'captured', raw: 'Анна'},
        }),
    ]);
    expect(recorder.hasUncommittedInput).toBe(false);
});

it('no-op editing is deduplicated but changing a previously committed value is a new action', () => {
    input('Анна');
    send('blur');
    send('focus');
    send('blur');
    input('Анна');
    send('blur');
    expect(recorder.snapshot().actions).toHaveLength(1);
    input('Аннаа');
    input('Анна');
    send('blur');
    expect(recorder.snapshot().actions).toHaveLength(1);
    input('Борис');
    send('blur');
    expect(recorder.snapshot().actions).toHaveLength(2);
});

it('a click with no blur does not implicitly confirm focused text', () => {
    input('Анна');
    root.querySelector('button')!.click();
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual(['click']);
    expect(recorder.hasUncommittedInput).toBe(true);
    send('blur');
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual([
        'click',
        'input',
    ]);
});

it.each(['stop', 'navigation', 'remove'])(
    '%s cancels a draft without an input action',
    (operation) => {
        input('Анна');

        if (operation === 'stop') {
            recorder.stop();
        }

        if (operation === 'navigation') {
            history.pushState({}, '', '/another');
        }

        if (operation === 'remove') {
            field.remove();
        }

        jest.advanceTimersByTime(500);
        expect(
            recorder.snapshot().actions.some((action) => action.kind === 'input'),
        ).toBe(false);
        expect(recorder.snapshot().diagnostics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: 'unsupported-control'}),
            ]),
        );

        if (operation === 'navigation') {
            history.replaceState({}, '', '/workflow');
        }
    },
);

it('Enter without blur leaves the input unconfirmed', () => {
    input('Анна');
    field.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    jest.advanceTimersByTime(2000);
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.hasUncommittedInput).toBe(true);
});

it('includes synchronous blur formatting and keeps later property updates in states', () => {
    field.addEventListener('blur', () => {
        field.value = field.value.trim();
    });
    input('  Анна  ');
    send('blur');
    field.value = 'Сервер';
    jest.advanceTimersByTime(100);
    expect(recorder.snapshot().actions[0]).toMatchObject({value: {raw: 'Анна'}});
    const atCompatValue = recorder.snapshot().states;

    expect(atCompatValue[atCompatValue.length - 1]).toMatchObject({
        value: {raw: 'Сервер'},
    });
});

it('does not attribute a programmatic replacement before blur to the user', () => {
    input('Анна');
    field.value = 'Сервер';
    send('change');
    send('blur');
    expect(recorder.snapshot().actions).toHaveLength(0);
});

it('unfinished IME on blur cannot be resurrected by a late compositionend', () => {
    send('compositionstart');
    input('ni');
    send('blur');
    field.value = '你';
    send('compositionend');
    jest.advanceTimersByTime(500);
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.snapshot().diagnostics).toEqual(
        expect.arrayContaining([
            expect.objectContaining({code: 'composition-cancelled'}),
        ]),
    );
});

it('search input blur is an input action, never proof of a selected option', () => {
    field.setAttribute('role', 'combobox');
    recorder.stop();
    recorder.start();
    input('Ang');
    send('blur');
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual(['input']);
});

it('a confirmed option supersedes an unblurred search draft and creates only select', () => {
    field.setAttribute('role', 'combobox');
    field.setAttribute('aria-controls', 'choices');
    root.insertAdjacentHTML(
        'beforeend',
        '<div id="choices"><button role="option">Angular</button></div>',
    );
    const option = root.querySelector<HTMLElement>('[role="option"]')!;

    option.addEventListener('click', () => {
        field.value = 'Angular';
    });
    recorder.stop();
    recorder.start();
    input('Ang');
    option.click();
    jest.advanceTimersByTime(0);
    send('blur');
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual(['select']);
    expect(recorder.snapshot().diagnostics).toEqual([]);
});

it.each(['textarea', 'contenteditable'])(
    '%s uses the same blur boundary as a text input',
    (kind) => {
        recorder.stop();
        root.innerHTML =
            kind === 'textarea'
                ? '<label>Комментарий<textarea></textarea></label>'
                : '<div contenteditable="true" role="textbox" aria-label="Комментарий"></div>';
        recorder.start();
        const element = root.firstElementChild!.matches('label')
            ? root.querySelector('textarea')!
            : root.firstElementChild!;

        if (element instanceof HTMLTextAreaElement) {
            element.value = 'Текст';
        } else {
            element.textContent = 'Текст';
        }

        element.dispatchEvent(new Event('input', {bubbles: true}));
        jest.advanceTimersByTime(1000);
        expect(recorder.snapshot().actions).toHaveLength(0);
        element.dispatchEvent(new Event('blur'));
        jest.advanceTimersByTime(0);
        expect(recorder.snapshot().actions[0]).toMatchObject({
            kind: 'input',
            commit: 'blur',
            value: {raw: 'Текст'},
        });
    },
);

it.each([
    ['150 000', true],
    ['200 000', false],
])(
    'allows delayed numeric formatting only when meaning is preserved: %s',
    (formatted, accepted) => {
        recorder.stop();
        field.setAttribute('tuiinputnumber', '');
        recorder = new ElementRecorder(root, {
            valuePolicy: {
                mode: 'capture',
                sensitive: 'redact',
                normalizers: ['decimal-comma-v1'],
            },
            acceptUntrustedEvents: true,
        });
        recorder.start();
        input('150000');
        field.value = formatted;
        send('change');
        send('blur');
        expect(recorder.snapshot().actions).toHaveLength(accepted ? 1 : 0);

        if (accepted) {
            expect(recorder.snapshot().actions[0]).toMatchObject({
                value: {raw: formatted, normalized: {value: 150000}},
            });
        }
    },
);
