import {
    AreaRegistry,
    type Condition,
    describeElement,
    type Expectation,
    type GroupedScenario,
    parseScenario,
    ScenarioRuntime,
    serializeScenario,
} from '../src';

let root: HTMLElement;
let areas: AreaRegistry;
let runtime: ScenarioRuntime | undefined;
let scenario: GroupedScenario;
const visible = (targetId: string): Condition => ({
    kind: 'visible',
    targetId,
    expected: true,
});

const expectation = (id: string): Expectation => ({
    id,
    instruction: id,
    hint: null,
    optional: false,
    when: null,
    requires: [],
    action: {
        kind: 'input',
        targetId: id,
        value: {kind: 'raw-equals', value: id.toUpperCase()},
    },
    completion: {
        kind: 'value',
        targetId: id,
        condition: {kind: 'raw-equals', value: id.toUpperCase()},
    },
});

function field(id: string): HTMLInputElement {
    return root.querySelector(`[name="${id}"]`)!;
}

function send(id: string, value: string, blur = true): void {
    const input = field(id);

    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    jest.advanceTimersByTime(0);

    if (blur) {
        input.dispatchEvent(new Event('blur'));
        jest.advanceTimersByTime(0);
    }
}

function click(): void {
    root.querySelector('button')!.click();
    jest.advanceTimersByTime(0);
}

function start(): ScenarioRuntime {
    runtime = new ScenarioRuntime(root, scenario, {
        areas,
        acceptUntrustedEvents: true,
        timeoutMs: 1000,
    });
    runtime.start();

    return runtime;
}

function state(id: string): string | undefined {
    return runtime!.snapshot().expectations?.find((entry) => entry.id === id)?.status;
}

function ready(): boolean | undefined {
    return runtime!.snapshot().transitions?.[0]?.ready;
}

beforeEach(() => {
    jest.useFakeTimers();
    root = document.createElement('main');
    root.innerHTML =
        '<alpha-surface><label>A<input name="a"></label><label>B<input name="b"></label><label>C<input name="c"></label><button>Открыть</button><h2>Справка</h2></alpha-surface><beta-surface><label>D<input name="d"></label><h2>Результат</h2></beta-surface>';
    document.body.append(root);
    const definitions = [
        {key: 'alpha', hostTag: 'alpha-surface', observe: true},
        {key: 'beta', hostTag: 'beta-surface', observe: true},
    ];

    areas = new AreaRegistry(definitions);
    areas.start(root);
    const targets: Array<{id: string; element: Element; area: string}> = [
        'a',
        'b',
        'c',
        'd',
    ].map((id) => ({id, element: field(id), area: id === 'd' ? 'beta' : 'alpha'}));

    targets.push(
        {id: 'open', element: root.querySelector('button')!, area: 'alpha'},
        {id: 'help', element: root.querySelector('alpha-surface h2')!, area: 'alpha'},
        {id: 'finish', element: root.querySelector('beta-surface h2')!, area: 'beta'},
    );
    scenario = {
        kind: 'training-scenario',
        version: 4,
        id: 'groups',
        mode: {kind: 'dom-only'},
        descriptors: targets.map(({id, element, area}) =>
            describeElement(element, areas.root(area)!, id, {includeStatic: true}),
        ),
        areas: {
            definitions,
            targets: targets.map(({id, area}) => ({targetId: id, areaKey: area})),
        },
        startGroupId: 'first',
        groups: [
            {
                id: 'first',
                title: 'Независимые поля',
                entry: visible('a'),
                expectations: ['a', 'b', 'c'].map(expectation),
                transitions: [
                    {
                        id: 'next',
                        instruction: 'Открыть',
                        hint: null,
                        when: null,
                        requires: [],
                        action: {kind: 'click', targetId: 'open'},
                        completion: visible('d'),
                        toGroupId: 'second',
                    },
                ],
            },
            {
                id: 'second',
                title: 'Вторая группа',
                entry: visible('d'),
                expectations: [expectation('d')],
                transitions: [],
            },
        ],
        completion: visible('finish'),
    };
});
afterEach(() => {
    runtime?.stop();
    runtime = undefined;
    areas.stop();
    root.remove();
    jest.useRealTimers();
});

it('accepts C/A/B and restricts expectations to the active group even when future fields are visible', () => {
    start();
    send('d', 'D');
    expect(runtime!.snapshot().completedSteps).toBe(0);
    send('c', 'C');
    send('a', 'A');
    expect(ready()).toBe(false);
    send('b', 'B');
    expect(ready()).toBe(true);
    click();
    expect(runtime!.snapshot().groupId).toBe('second');
    expect(runtime!.snapshot().status).not.toBe('completed');
    send('d', 'D');
    expect(runtime!.snapshot().status).toBe('completed');
});
it('requires blur and revokes a satisfied value as soon as editing starts, including no-op correction', () => {
    start();
    send('a', 'A');
    send('b', 'B');
    send('c', 'C');
    expect(ready()).toBe(true);
    send('a', 'wrong', false);
    expect(ready()).toBe(false);
    click();
    expect(runtime!.snapshot().groupId).toBe('first');
    send('a', 'A');
    expect(state('a')).toBe('satisfied');
    expect(ready()).toBe(true);
    send('a', 'wrong');
    expect(state('a')).toBe('mismatch');
    expect(ready()).toBe(false);
});
it('does not count programmatic values and rechecks confirmed values after backend changes', () => {
    start();
    field('a').value = 'A';
    jest.advanceTimersByTime(100);
    expect(state('a')).toBe('ready');
    send('a', 'A');
    expect(state('a')).toBe('satisfied');
    field('a').value = 'server';
    jest.advanceTimersByTime(100);
    expect(state('a')).toBe('mismatch');
});
it('captures transition permission before a synchronous application handler removes the previous fields', () => {
    start();
    send('b', 'B');
    send('c', 'C');
    send('a', 'A');
    root.querySelector('button')!.addEventListener('click', () => {
        for (const id of ['a', 'b', 'c']) {
            field(id).remove();
        }
    });
    click();
    expect(runtime!.snapshot().groupId).toBe('second');
});
it('refuses a premature transition even if the application displays its postcondition', () => {
    start();
    click();
    expect(runtime!.snapshot().groupId).toBe('first');
    expect(runtime!.snapshot().message).toContain('Сначала');
});
it('latches confirmed help clicks, allows free order for peers, and requires help before dependent action', () => {
    const help: Expectation = {
        ...expectation('read'),
        action: {kind: 'click', targetId: 'open'},
        completion: visible('help'),
    };

    scenario.groups[0]!.expectations = [
        {...expectation('a'), requires: ['read']},
        expectation('b'),
        help,
    ];
    scenario.groups[0]!.transitions = [];
    scenario.completion = {
        kind: 'value',
        targetId: 'c',
        condition: {kind: 'raw-equals', value: 'done'},
    };
    start();
    send('a', 'A');
    expect(state('a')).toBe('blocked');
    send('b', 'B');
    click();
    root.querySelector('alpha-surface h2')!.remove();
    jest.advanceTimersByTime(100);
    expect(state('read')).toBe('satisfied');
    send('a', 'A');
    expect(state('a')).toBe('satisfied');
});
it('skips optional expectations, but a dependency on a skipped expectation is not satisfied', () => {
    scenario.groups[0]!.expectations[0]!.optional = true;
    scenario.groups[0]!.expectations[1]!.requires = ['a'];
    start();
    runtime!.skip('a');
    send('b', 'B');
    expect(state('a')).toBe('skipped');
    expect(state('b')).toBe('blocked');
    expect(ready()).toBe(false);
});
it('inactive conditions do not block a transition; missing-area unknown conditions do', () => {
    scenario.groups[0]!.expectations[0]!.when = {
        kind: 'value',
        targetId: 'd',
        condition: {kind: 'raw-equals', value: 'enabled'},
    };
    start();
    send('b', 'B');
    send('c', 'C');
    expect(state('a')).toBe('inactive');
    expect(ready()).toBe(true);
    root.querySelector('beta-surface')!.remove();
    jest.advanceTimersByTime(100);
    expect(state('a')).toBe('waiting');
    expect(ready()).toBe(false);
});
it('keeps duplicate matches ambiguous instead of assigning an action to the first expectation', () => {
    scenario.groups[0]!.expectations.push({...expectation('a'), id: 'duplicate'});
    start();
    send('a', 'A');
    jest.advanceTimersByTime(300);
    expect(state('a')).toBe('ambiguous');
    expect(state('duplicate')).toBe('ambiguous');
    expect(ready()).toBe(false);
});
it('refuses branching when two transition postconditions match', () => {
    scenario.groups[0]!.expectations = [];
    scenario.groups[0]!.transitions.push({
        ...scenario.groups[0]!.transitions[0]!,
        id: 'other',
        toGroupId: null,
    });
    start();
    click();
    expect(runtime!.snapshot().status).toBe('ambiguous');
    expect(runtime!.snapshot().groupId).toBe('first');
});
it('invalidates satisfied actions after their area is remounted', () => {
    start();
    send('a', 'A');
    root.querySelector('alpha-surface')!.outerHTML =
        root.querySelector('alpha-surface')!.outerHTML;
    jest.advanceTimersByTime(100);
    expect(state('a')).not.toBe('satisfied');
});
it('preserves pending transition across a different area mounting but invalidates the source remount', () => {
    scenario.groups[0]!.expectations = [];
    const beta = root.querySelector('beta-surface')!.outerHTML;

    root.querySelector('beta-surface')!.remove();
    start();
    click();
    expect(runtime!.snapshot().status).toBe('confirming');
    root.querySelector('alpha-surface')!.outerHTML =
        root.querySelector('alpha-surface')!.outerHTML;
    root.insertAdjacentHTML('beforeend', beta);
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().groupId).toBe('first');
    click();
    expect(runtime!.snapshot().groupId).toBe('second');
});
it('does not infer a group transition from DOM changes alone', () => {
    start();
    root.querySelector('button')!.remove();
    jest.advanceTimersByTime(200);
    expect(runtime!.snapshot().groupId).toBe('first');
});
it('round-trips v4 and rejects cyclic dependencies, cross-group dependencies and unknown transitions', () => {
    expect(parseScenario(serializeScenario(scenario))).toEqual(scenario);
    scenario.groups[0]!.expectations[0]!.requires = ['b'];
    scenario.groups[0]!.expectations[1]!.requires = ['a'];
    expect(() => serializeScenario(scenario)).toThrow();
    scenario.groups[0]!.expectations[1]!.requires = ['d'];
    expect(() => serializeScenario(scenario)).toThrow();
    scenario.groups[0]!.expectations[0]!.requires = [];
    scenario.groups[0]!.expectations[1]!.requires = [];
    scenario.groups[0]!.transitions[0]!.toGroupId = 'absent';
    expect(() => serializeScenario(scenario)).toThrow();
});

it('confirms combobox choice without treating its native input event as a new text draft', () => {
    const owner = field('a');

    owner.setAttribute('role', 'combobox');
    owner.setAttribute('aria-controls', 'options');
    root.querySelector('alpha-surface')!.insertAdjacentHTML(
        'beforeend',
        '<div id="options" role="listbox"><div role="option">A</div></div>',
    );
    scenario.descriptors = scenario.descriptors.map((descriptor) =>
        descriptor.id === 'a'
            ? describeElement(owner, areas.root('alpha')!, 'a')
            : descriptor,
    );
    const job = scenario.groups[0]!.expectations[0]!;

    job.action = {kind: 'select', targetId: 'a', value: {kind: 'raw-equals', value: 'A'}};
    start();
    root.querySelector<HTMLElement>('[role="option"]')!.addEventListener('click', () => {
        owner.value = 'A';
        owner.dispatchEvent(new Event('input', {bubbles: true}));
    });
    root.querySelector<HTMLElement>('[role="option"]')!.click();
    jest.advanceTimersByTime(100);
    owner.dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(100);
    expect(state('a')).toBe('satisfied');
    expect(runtime!.snapshot().uncommittedInput).toBe(false);
});
it('allows an input transition only after blur and checks its value independently of postcondition', () => {
    const group = scenario.groups[0]!;

    group.expectations = [];
    group.transitions[0]!.action = {
        kind: 'input',
        targetId: 'a',
        value: {kind: 'raw-equals', value: 'A'},
    };
    start();
    send('a', 'wrong');
    expect(runtime!.snapshot().groupId).toBe('first');
    send('a', 'typing', false);
    send('a', 'A', false);
    expect(runtime!.snapshot().groupId).toBe('first');
    field('a').dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().groupId).toBe('second');
});
it('waits for the single confirmed branch and times out on an unknown postcondition', () => {
    const group = scenario.groups[0]!;

    group.expectations = [];
    group.transitions.push({
        ...group.transitions[0]!,
        id: 'other',
        completion: {
            kind: 'value',
            targetId: 'a',
            condition: {kind: 'raw-equals', value: 'other'},
        },
        toGroupId: null,
    });
    start();
    click();
    expect(runtime!.snapshot().groupId).toBe('second');
    runtime!.stop();
    runtime = undefined;
    root.querySelector('beta-surface')!.remove();
    start();
    click();
    jest.advanceTimersByTime(1100);
    expect(runtime!.snapshot().status).toBe('timedOut');
    runtime!.retry();
    expect(runtime!.snapshot().status).not.toBe('completed');
});
it('rejects a late blur from the previous group even if both groups expect the same element', () => {
    scenario.groups[1]!.expectations = [expectation('a')];
    start();
    send('a', 'A');
    send('b', 'B');
    send('c', 'C');
    click();
    field('a').dispatchEvent(new Event('change', {bubbles: true}));
    field('a').dispatchEvent(new Event('blur'));
    jest.advanceTimersByTime(100);
    expect(state('a')).toBe('ready');
    expect(runtime!.snapshot().status).not.toBe('completed');
    send('a', 'A');
    expect(runtime!.snapshot().status).toBe('completed');
});

it('counts the final transition once and still requires global completion', () => {
    scenario.groups[0]!.transitions[0]!.toGroupId = null;
    scenario.completion = {
        kind: 'value',
        targetId: 'd',
        condition: {kind: 'raw-equals', value: 'D'},
    };
    start();
    send('a', 'A');
    send('b', 'B');
    send('c', 'C');
    click();
    expect(runtime!.snapshot().status).toBe('finalizing');
    expect(runtime!.snapshot().completedSteps).toBe(3);
    field('d').value = 'D';
    jest.advanceTimersByTime(100);
    expect(runtime!.snapshot().status).toBe('completed');
    expect(runtime!.snapshot().completedSteps).toBe(4);
    jest.advanceTimersByTime(300);
    expect(runtime!.snapshot().completedSteps).toBe(4);
});
it('matches explicit navigation in the active group without assigning it to an arbitrary area', () => {
    const pathname = document.location.pathname;

    scenario.groups[0]!.expectations = [
        {
            ...expectation('navigation'),
            action: {kind: 'navigation', pathname: '/destination'},
            completion: {kind: 'pathname', value: '/destination'},
        },
    ];
    scenario.groups[0]!.transitions = [];
    scenario.completion = {kind: 'pathname', value: '/destination'};

    try {
        start();
        history.pushState({}, '', '/destination');
        jest.advanceTimersByTime(100);
        expect(runtime!.snapshot().status).toBe('completed');
    } finally {
        history.replaceState({}, '', pathname);
    }
});

it('shares the recorder sampling timer and releases it along with queued observation callbacks', () => {
    const interval = jest.spyOn(globalThis, 'setInterval');

    start();
    jest.runAllTicks();
    expect(interval).toHaveBeenCalledTimes(1);
    runtime!.stop();
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
    expect(runtime!.snapshot().status).toBe('stopped');
    interval.mockRestore();
});
