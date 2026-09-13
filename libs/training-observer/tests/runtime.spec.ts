import {type ElementDescriptor, type LegacyScenario as Scenario} from '../src/contracts';
import {OBSERVABLES} from '../src/dom/identity';
import {ElementRecorder} from '../src/recording';
import {describe} from '../src/recording/dom';
import {Conditions, draftScenario, ScenarioRuntime} from '../src/runtime';

let root: HTMLElement;
let runtime: ScenarioRuntime | undefined;
const policy = {mode: 'capture' as const, sensitive: 'redact' as const, normalizers: []};

function target(html: string, selector: string, id: string): ElementDescriptor {
    root.innerHTML = html;

    return describe(root.querySelector(selector)!, root, id, OBSERVABLES);
}

function scenario(): Scenario {
    const button = target('<button>Начать</button>', 'button', 'start');
    const input = target('<label>Имя<input></label>', 'input', 'name');
    const finish = target('<h2>Готово</h2>', 'h2', 'finish');

    return {
        kind: 'training-scenario',
        version: 2,
        id: 'test',
        mode: {kind: 'dom-only'},
        descriptors: [button, input, finish],
        startStepId: 'start',
        completion: {kind: 'visible', targetId: 'finish', expected: true},
        steps: [
            {
                id: 'start',
                instruction: 'Начните',
                hint: 'Нажмите кнопку',
                optional: false,
                action: {kind: 'click', targetId: 'start'},
                completion: {kind: 'visible', targetId: 'name', expected: true},
                branches: [],
                nextStepId: 'input',
            },
            {
                id: 'input',
                instruction: 'Введите имя',
                hint: 'Анна',
                optional: false,
                action: {kind: 'input', targetId: 'name'},
                completion: {
                    kind: 'value',
                    targetId: 'name',
                    condition: {kind: 'raw-equals', value: 'Анна'},
                },
                branches: [],
                nextStepId: null,
            },
        ],
    };
}

function start(value: Scenario): void {
    runtime = new ScenarioRuntime(root, value, {
        acceptUntrustedEvents: true,
        timeoutMs: 2000,
    });
    runtime.start();
}

function enter(value: string): void {
    const input = root.querySelector('input')!;

    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    jest.advanceTimersByTime(0);
    input.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(500);
}

beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<main></main>';
    root = document.querySelector('main')!;
});
afterEach(() => {
    runtime?.stop();
    runtime = undefined;
    jest.useRealTimers();
    document.body.replaceChildren();
});

test('click arms completion; delayed fields advance only after actual append; global completion is independent', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button>';
    start(value);
    root.querySelector('button')!.click();
    expect(runtime!.snapshot()).toMatchObject({status: 'confirming', stepId: 'start'});
    jest.advanceTimersByTime(500);
    expect(runtime!.snapshot().stepId).toBe('start');
    root.innerHTML = '<label>Имя<input></label>';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().stepId).toBe('input');
    enter('Борис');
    expect(runtime!.snapshot()).toMatchObject({
        stepId: 'input',
        message: 'Значение не соответствует заданию.',
    });
    enter('Анна');
    expect(runtime!.snapshot().status).toBe('finalizing');
    root.innerHTML = '<h2>Готово</h2>';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().status).toBe('completed');
    expect(jest.getTimerCount()).toBe(0);
});

test('an already satisfied value does not replace the required user action', () => {
    const value = scenario();

    value.startStepId = 'input';
    root.innerHTML = '<label>Имя<input value="Анна"></label>';
    start(value);
    jest.advanceTimersByTime(500);
    expect(runtime!.snapshot()).toMatchObject({status: 'ready', completedSteps: 0});
});

test('pre-removal click is matched before application handler destroys the target', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button>';
    start(value);
    root.querySelector('button')!.addEventListener('click', () => {
        root.innerHTML = '<label>Имя<input></label>';
    });
    root.querySelector('button')!.click();
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().stepId).toBe('input');
});

test('duplicates are ambiguous and synthetic script updates do not complete a step', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button><button>Начать</button>';
    start(value);
    expect(runtime!.snapshot().status).toBe('ambiguous');
    root.querySelector('button')!.click();
    root.innerHTML = '<label>Имя<input value="Анна"></label>';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().stepId).toBe('start');
});

test('missing target waits then times out; retry is explicit', () => {
    const value = scenario();

    root.innerHTML = '';
    start(value);
    expect(runtime!.snapshot().status).toBe('waiting');
    jest.advanceTimersByTime(2100);
    expect(runtime!.snapshot().status).toBe('timedOut');
    root.innerHTML = '<button>Начать</button>';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().status).toBe('timedOut');
    runtime!.retry();
    expect(runtime!.snapshot().status).toBe('ready');
});

test('stop cancels old waits; a late backend-like mutation cannot finish the run', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button>';
    start(value);
    root.querySelector('button')!.click();
    runtime!.stop();
    root.innerHTML = '<label>Имя<input value="Анна"></label><h2>Готово</h2>';
    jest.advanceTimersByTime(500);
    expect(runtime!.snapshot().status).toBe('stopped');
    expect(jest.getTimerCount()).toBe(0);
});

test('optional skip changes the step and cancels the old pending action', () => {
    const value = scenario();

    value.steps[0]!.optional = true;
    root.innerHTML = '<button>Начать</button>';
    start(value);
    root.querySelector('button')!.click();
    runtime!.skip();
    expect(runtime!.snapshot().stepId).toBe('input');
    root.innerHTML = '<label>Имя<input value="Анна"></label>';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().completedSteps).toBe(1);
});

test('two matching branches are ambiguous; no first-wins fallback', () => {
    const value = scenario();

    value.startStepId = 'input';
    const condition = value.steps[1]!.completion;

    value.steps[1]!.branches = [
        {when: condition, nextStepId: 'start'},
        {when: condition, nextStepId: 'input'},
    ];
    root.innerHTML = '<label>Имя<input></label>';
    start(value);
    enter('Анна');
    expect(runtime!.snapshot()).toMatchObject({
        status: 'ambiguous',
        stepId: 'input',
        completedSteps: 0,
    });
});

test('a single matching branch changes step; missing values are unknown, not false', () => {
    const value = scenario();

    value.startStepId = 'input';
    value.steps[1]!.branches = [{when: value.steps[1]!.completion, nextStepId: 'start'}];
    root.innerHTML = '<label>Имя<input></label>';
    start(value);
    enter('Анна');
    expect(runtime!.snapshot().stepId).toBe('start');
    root.innerHTML = '';
    expect(new Conditions(value, root).evaluate(value.steps[1]!.completion)).toBe(
        'unknown',
    );
});

test('read-only disabled field can be checked as a condition without becoming an actionable target', () => {
    const value = scenario();

    root.innerHTML = '<label>Имя<input disabled value="Анна"></label>';
    expect(new Conditions(value, root).evaluate(value.steps[1]!.completion)).toBe('true');
    value.startStepId = 'input';
    start(value);
    expect(runtime!.snapshot().status).toBe('waiting');
});

test('authoring draft requires explicit final evidence and captures expected values', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button><label>Имя<input></label>';
    const recorder = new ElementRecorder(root, {
        valuePolicy: policy,
        acceptUntrustedEvents: true,
    });

    recorder.start();
    root.querySelector('button')!.click();
    enter('Анна');
    recorder.stop();
    const draft = draftScenario(recorder.snapshot(), value.descriptors[2]!);

    if ('groups' in draft) {
        throw new Error('Expected legacy draft');
    }

    expect(draft.steps[1]!.completion).toMatchObject({
        kind: 'value',
        condition: {value: 'Анна'},
    });
    expect(draft.completion).toEqual({
        kind: 'visible',
        targetId: 'finish',
        expected: true,
    });
    expect(draft.steps[0]!.completion).toEqual({
        kind: 'visible',
        targetId:
            draft.steps[1]!.action.kind === 'navigation'
                ? ''
                : draft.steps[1]!.action.targetId,
        expected: true,
    });
});

test('an input removed by its own input handler cannot complete without blur', () => {
    const value = scenario();

    value.startStepId = 'input';
    root.innerHTML = '<label>Имя<input></label>';
    start(value);
    root.querySelector('input')!.addEventListener('input', () => {
        root.innerHTML = '<h2>Готово</h2>';
    });
    enter('Анна');
    expect(runtime!.snapshot().completedSteps).toBe(0);
    expect(runtime!.snapshot().status).not.toBe('completed');
});

test('waiting for a user is not a missing-target timeout', () => {
    const value = scenario();

    root.innerHTML = '<button>Начать</button>';
    start(value);
    jest.advanceTimersByTime(4000);
    expect(runtime!.snapshot().status).toBe('ready');
});

test('late input commit from a skipped step cannot satisfy the next step even on the same element', () => {
    const value = scenario();

    value.steps[0]!.optional = true;
    value.steps[0]!.action = {kind: 'input', targetId: 'name'};
    value.steps[0]!.completion = {kind: 'visible', targetId: 'finish', expected: true};
    root.innerHTML = '<label>Имя<input></label>';
    start(value);
    const input = root.querySelector('input')!;

    input.value = 'Анна';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    runtime!.skip();
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(500);
    expect(runtime!.snapshot()).toMatchObject({
        stepId: 'input',
        completedSteps: 1,
        status: 'ready',
    });
});

test('delayed dropdown confirmation is processed before capturing the next button intent', () => {
    const value = scenario();
    const combo = target(
        '<input role="combobox" aria-label="Имя" aria-controls="popup">',
        'input',
        'name',
    );

    value.descriptors[1] = combo;
    value.steps[0]!.action = {kind: 'select', targetId: 'name'};
    value.steps[0]!.completion = {
        kind: 'value',
        targetId: 'name',
        condition: {kind: 'raw-equals', value: 'Angular'},
    };
    value.steps[1]!.action = {kind: 'click', targetId: 'start'};
    value.steps[1]!.completion = {kind: 'visible', targetId: 'finish', expected: true};
    root.innerHTML =
        '<input role="combobox" aria-label="Имя" aria-controls="popup"><button>Начать</button>';
    document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="popup"><button role="option">Angular</button></div>',
    );
    start(value);
    document.querySelector<HTMLElement>('[role="option"]')!.click();
    jest.advanceTimersByTime(0);
    root.querySelector('input')!.value = 'Angular';
    root.querySelector('button')!.click();
    expect(runtime!.snapshot()).toMatchObject({
        stepId: 'input',
        status: 'confirming',
        completedSteps: 1,
    });
});

test('typing a correct or wrong value does not advance or show an error before blur', () => {
    const value = scenario();

    value.startStepId = 'input';
    root.innerHTML = '<label>Имя<input></label><h2>Готово</h2>';
    start(value);
    const input = root.querySelector('input')!;

    input.value = 'wrong';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    jest.advanceTimersByTime(2000);
    expect(runtime!.snapshot()).toMatchObject({
        stepId: 'input',
        completedSteps: 0,
        message: '',
        uncommittedInput: true,
    });
    input.value = 'Анна';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    jest.advanceTimersByTime(2000);
    expect(runtime!.snapshot().status).not.toBe('completed');
    input.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(0);
    expect(runtime!.snapshot().status).toBe('completed');
});

test('an unblurred edit blocks final completion even after the last expected click', () => {
    const value = scenario();

    value.steps = [value.steps[0]!];
    value.steps[0]!.nextStepId = null;
    value.steps[0]!.completion = {kind: 'visible', targetId: 'name', expected: true};
    root.innerHTML = '<button>Начать</button><label>Имя<input></label>';
    start(value);
    root.querySelector('button')!.click();
    expect(runtime!.snapshot().status).toBe('finalizing');
    const input = root.querySelector('input')!;

    input.value = 'Анна';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    root.insertAdjacentHTML('beforeend', '<h2>Готово</h2>');
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot()).toMatchObject({
        status: 'finalizing',
        uncommittedInput: true,
    });
    input.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(0);
    expect(runtime!.snapshot().status).toBe('completed');
});
