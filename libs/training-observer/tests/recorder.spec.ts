import {parseRecording, type ValuePolicy} from '../src/contracts';
import {ElementRecorder, normalizeValue} from '../src/recording';

const policy: ValuePolicy = {
    mode: 'capture',
    sensitive: 'redact',
    normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
};

let recorder: ElementRecorder;
let root: HTMLElement;

function setup(html: string, trustedSimulation = true, valuePolicy = policy): void {
    document.body.innerHTML = `<main>${html}</main><aside><button>Панель</button></aside>`;
    root = document.querySelector('main')!;
    recorder = new ElementRecorder(root, {
        valuePolicy,
        acceptUntrustedEvents: trustedSimulation,
    });
    recorder.start();
}

function event(element: Element, type: string): void {
    element.dispatchEvent(new Event(type, {bubbles: true, composed: true}));
}

function enter(value: string): HTMLInputElement {
    const input = root.querySelector('input')!;

    input.value = value;
    event(input, 'input');
    jest.advanceTimersByTime(0);

    return input;
}

function advance(): void {
    jest.advanceTimersByTime(500);
}

beforeEach(() => {
    jest.useFakeTimers();
});
afterEach(() => {
    recorder?.stop();
    jest.useRealTimers();
    document.body.innerHTML = '';
});

test('input bursts coalesce; blur commits before a button destroys the form', () => {
    setup('<label>Имя<input></label><button><span>Далее</span></button>');
    enter('А');
    const input = enter('Анна');

    event(input, 'blur');
    root.querySelector('button')!.addEventListener('click', () => root.replaceChildren());
    root.querySelector('span')!.click();
    advance();
    const report = parseRecording(recorder.export());

    expect(report.actions.map((action) => action.kind)).toEqual(['input', 'click']);
    expect(report.actions[0]).toMatchObject({
        value: {status: 'captured', raw: 'Анна'},
        commit: 'blur',
    });
    expect(report.states.some((state) => !state.connected)).toBe(true);
});

test('programmatic events and property changes are states, never user actions', () => {
    setup('<label>Имя<input></label>', false);
    enter('Сервер');
    advance();
    expect(recorder.snapshot().actions).toEqual([]);
    root.querySelector('input')!.value = 'Без события';
    advance();
    const atCompatValue = recorder.snapshot().states;

    expect(atCompatValue[atCompatValue.length - 1]).toMatchObject({
        source: 'property-observer',
        value: {raw: 'Без события'},
    });
});

test('native checkbox and select produce one select each, no click duplicates', () => {
    setup(
        '<label>Да<input type="checkbox"></label><label>Курс<select><option>A</option><option>B</option></select></label>',
    );
    root.querySelector('input')!.click();
    const select = root.querySelector('select')!;

    select.value = 'B';
    event(select, 'change');
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual([
        'select',
        'select',
    ]);
    expect(recorder.snapshot().actions[1]).toMatchObject({value: {raw: ['B']}});
});

test('IME intermediate text is not committed by idle timer', () => {
    setup('<label>Имя<input></label>');
    event(root.querySelector('input')!, 'compositionstart');
    enter('ni');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(0);
    const input = enter('你');

    event(input, 'compositionend');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(0);
    event(input, 'blur');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
    expect(recorder.snapshot().actions[0]).toMatchObject({value: {raw: '你'}});
});

test('unfinished composition is diagnosed on stop', () => {
    setup('<label>Имя<input></label>');
    event(root.querySelector('input')!, 'compositionstart');
    enter('ni');
    recorder.stop();
    expect(recorder.snapshot().actions).toHaveLength(0);
    expect(recorder.snapshot().diagnostics).toEqual(
        expect.arrayContaining([
            expect.objectContaining({code: 'composition-cancelled'}),
        ]),
    );
});

for (const mode of ['omit', 'capture'] as const) {
    test(`policy ${mode} never persists secrets`, () => {
        setup('<label>Секрет<input type="password"></label>', true, {...policy, mode});
        event(enter('secret-value'), 'blur');
        advance();
        const report = recorder.export();

        expect(report).not.toContain('secret-value');
        expect(parseRecording(report).actions[0]).toMatchObject({
            value: {status: 'redacted'},
        });
    });
}

test('omit policy excludes ordinary values from actions and snapshots', () => {
    setup('<label>Имя<input></label>', true, {...policy, mode: 'omit'});
    event(enter('private-value'), 'blur');
    advance();
    expect(recorder.export()).not.toContain('private-value');
    expect(recorder.snapshot().actions[0]).toMatchObject({value: {status: 'omitted'}});
});

test('portal selection survives synchronous removal and requires confirmed owner value', () => {
    setup('<label>Курс<input role="combobox" aria-controls="popup"></label>');
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup" role="listbox"><button role="option">Angular</button></div>',
    );
    const option = document.querySelector<HTMLElement>('[role="option"]')!;

    option.addEventListener('click', () => {
        root.querySelector('input')!.value = 'Angular';
        option.parentElement!.remove();
    });
    option.click();
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
    expect(recorder.snapshot().actions[0]).toMatchObject({
        kind: 'select',
        commit: 'confirmed-selection',
        value: {raw: 'Angular'},
    });
    expect(recorder.snapshot().diagnostics).toEqual([]);
});

test('two owners cause explicit refusal', () => {
    setup(
        '<input aria-label="A" role="combobox" aria-controls="popup"><input aria-label="B" role="combobox" aria-controls="popup">',
    );
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup"><button role="option">Angular</button></div>',
    );
    document.querySelector<HTMLElement>('[role="option"]')!.click();
    advance();
    expect(recorder.snapshot().actions).toEqual([]);
    expect(recorder.snapshot().diagnostics?.[0]?.code).toBe('ambiguous-owner');
});

test('option click alone does not prove selection', () => {
    setup('<input aria-label="Курс" role="combobox" aria-controls="popup">');
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup"><button role="option">Angular</button></div>',
    );
    document.querySelector<HTMLElement>('[role="option"]')!.click();
    jest.advanceTimersByTime(1200);
    expect(recorder.snapshot().actions).toEqual([]);
    expect(recorder.snapshot().diagnostics?.[0]?.code).toBe('unconfirmed-selection');
});

test('same DOM node receives a new descriptor when context changes; earlier descriptor is immutable', () => {
    setup('<fieldset><legend>Первый экран</legend><button>Далее</button></fieldset>');
    root.querySelector('button')!.click();
    root.querySelector('legend')!.textContent = 'Второй экран';
    root.querySelector('button')!.click();
    const report = parseRecording(recorder.export());
    const ids = report.actions.map((action) =>
        action.kind === 'click' ? action.targetId : '',
    );

    expect(ids[0]).not.toBe(ids[1]);
    expect(
        report.descriptors.find((descriptor) => descriptor.id === ids[0])?.scope
            .context[0]?.name,
    ).toBe('Первый экран');
    expect(
        report.descriptors.find((descriptor) => descriptor.id === ids[1])?.scope
            .context[0]?.name,
    ).toBe('Второй экран');
});

test('new controls discovered after replacement; side panel excluded; restart cleans listeners', () => {
    setup('<button>A</button>');
    document
        .querySelector('aside button')!
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));
    root.innerHTML = '<label>Новое поле<input></label>';
    advance();
    event(enter('value'), 'blur');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
    recorder.stop();
    enter('ignored');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
    recorder.start();
    event(enter('next'), 'blur');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
    recorder.stop();
    expect(jest.getTimerCount()).toBe(0);
});

test.each([
    ['1 234,50', 1234.5],
    ['0', 0],
    ['-2,5', -2.5],
])('strict decimal normalization %s', (raw, value) => {
    expect(normalizeValue(raw, 'decimal-comma-v1')).toEqual({
        rule: 'decimal-comma-v1',
        value,
    });
});
test.each(['1,', '1 23', '1.2', '1e3', ''])(
    'reject partial/unsupported numeric format %s',
    (raw) => {
        expect(normalizeValue(raw, 'decimal-comma-v1')).toBeUndefined();
    },
);
test('date normalization rejects impossible dates', () => {
    expect(normalizeValue('29.02.2027', 'date-dmy-v1')).toBeUndefined();
    expect(normalizeValue('29.02.2028', 'date-dmy-v1')).toEqual({
        rule: 'date-dmy-v1',
        value: '2028-02-29',
    });
});

test('a confirmed dropdown selection precedes an immediate next click without waiting for polling', () => {
    setup(
        '<input aria-label="Курс" role="combobox" aria-controls="popup"><button>Далее</button>',
    );
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup"><button role="option">Angular</button></div>',
    );
    document.querySelector<HTMLElement>('[role="option"]')!.click();
    jest.advanceTimersByTime(0);
    // Async formatting becomes visible after the capture microtask, before the next intent.
    root.querySelector('input')!.value = 'Angular';
    root.querySelector('button')!.click();
    expect(recorder.snapshot().actions.map((action) => action.kind)).toEqual([
        'select',
        'click',
    ]);
});

test('navigation is observed without patching history, and stop removes the observer', () => {
    setup('<button>Далее</button>');
    const originalPush = history.pushState;

    history.pushState({}, '', '/next');
    advance();
    expect(recorder.snapshot().actions).toEqual([
        expect.objectContaining({kind: 'navigation', pathname: '/next'}),
    ]);
    expect(history.pushState).toBe(originalPush);
    recorder.stop();
    history.replaceState({}, '', '/workflow');
    advance();
    expect(recorder.snapshot().actions).toHaveLength(1);
});

test('post-event formatting is captured but subsequent server updates do not overwrite user input', () => {
    setup('<label>Стоимость<input tuiinputnumber></label>');
    const input = root.querySelector('input')!;

    input.addEventListener('input', () => {
        input.value = '1 000';
    });
    enter('1000');
    event(input, 'blur');
    jest.advanceTimersByTime(0);
    input.value = '2 000';
    advance();
    expect(recorder.snapshot().actions[0]).toMatchObject({
        value: {raw: '1 000', normalized: {value: 1000}},
    });
    const atCompatValue = recorder.snapshot().states;

    expect(atCompatValue[atCompatValue.length - 1]).toMatchObject({
        value: {raw: '2 000'},
    });
});

test('capacity stops recording with a serializable diagnostic', () => {
    setup('<button>Далее</button>');

    for (let index = 0; index < 1001; index++) {
        root.querySelector('button')!.click();
    }

    expect(recorder.running).toBe(false);
    expect(parseRecording(recorder.export()).diagnostics?.[0]?.code).toBe(
        'capacity-reached',
    );
    expect(recorder.snapshot().actions).toHaveLength(1000);
    expect(jest.getTimerCount()).toBe(0);
});

test('programmatic checkbox click does not turn its trusted native change into a user action', () => {
    setup('<label>Да<input type="checkbox"></label>', false);
    root.querySelector('input')!.click();
    advance();
    expect(recorder.snapshot().actions).toEqual([]);
    const atCompatValue = recorder.snapshot().states;

    expect(atCompatValue[atCompatValue.length - 1]).toMatchObject({value: {raw: true}});
});
