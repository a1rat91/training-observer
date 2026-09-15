import {expect, test} from '@jest/globals';
import {matchControl} from '../../libs/training-runtime/src/lib/control-matcher';
import {compileScenario} from '../../libs/training-recording/src/lib/scenario-compiler';
import {parseScenario} from '../../libs/training-contracts/src/lib/scenario-codec';
import {StateRecorder} from '../../libs/training-recording/src/lib/state-recorder';
import {ScenarioRuntime} from '../../libs/training-runtime/src/lib/scenario-runtime';
const descriptor = (label, id) => ({
    kind: 'textbox',
    label,
    id,
    role: 'textbox',
    tagName: 'input',
    context: [],
});
const control = (id, label, value, extra = {}) => ({
    id,
    visible: true,
    kind: 'textbox',
    locatorHints: descriptor(label),
    state: {value},
    ...extra,
});
const field = (label, expected) => ({
    descriptor: descriptor(label),
    expected,
    message: `Ошибка ${label}`,
    optional: false,
});
const screen = (key, controls = []) => ({status: 'ready', key, controls});
const scenario = {
    kind: 'training-state-scenario',
    version: 1,
    steps: [
        {
            key: 'A',
            task: 'Task',
            transitionMessage: 'Неверный переход',
            fields: [field('Имя', 'Анна'), field('Город', 'Казань')],
        },
        {key: 'B', task: 'Done', transitionMessage: 'Неверный переход', fields: []},
    ],
};

test('matcher ignores DOM/session identity and layout; refuses near duplicates and incompatible kinds', () => {
    const a = control('new-node', 'Имя', 'value');
    expect(matchControl(descriptor('Имя'), [a]).status).toBe('matched');
    expect(matchControl(descriptor('Имя'), [a, {...a, id: 'duplicate'}]).status).toBe(
        'ambiguous',
    );
    expect(matchControl(descriptor('Имя'), [{...a, kind: 'select'}]).status).toBe(
        'missing',
    );
    expect(
        matchControl(descriptor('Old label', 'stable-field'), [
            {...a, locatorHints: descriptor('New label', 'stable-field')},
        ]).status,
    ).toBe('missing');
    expect(
        matchControl(descriptor('Old label', 'tui-123'), [
            {...a, locatorHints: descriptor('New label', 'tui-123')},
        ]).status,
    ).toBe('missing');
});
test('compile keeps last value per field; malformed/incomplete documents are rejected', () => {
    const recording = {
        kind: 'training-state-recording',
        version: 1,
        complete: true,
        events: [
            {kind: 'screen', visit: 1, screenKey: 'A'},
            {
                kind: 'value',
                visit: 1,
                screenKey: 'A',
                field: descriptor('Имя'),
                value: 'Old',
            },
            {
                kind: 'value',
                visit: 1,
                screenKey: 'A',
                field: descriptor('Имя'),
                value: 'Анна',
            },
        ],
    };
    expect(compileScenario(recording).steps[0].fields[0].expected).toBe('Анна');
    expect(() => compileScenario({...recording, complete: false})).toThrow();
    expect(parseScenario(JSON.stringify(scenario))).toEqual(
        JSON.parse(JSON.stringify(scenario)),
    );
    expect(() => parseScenario(JSON.stringify({...scenario, version: 2}))).toThrow();
    expect(() => parseScenario(JSON.stringify({...scenario, steps: []}))).toThrow();
});
test('learner accepts reverse field order, requires blur, deduplicates feedback and completes at the next screen', () => {
    const r = new ScenarioRuntime(scenario),
        a = control('a', 'Имя', ''),
        b = control('b', 'Город', '');
    r.update(screen('A', [a, b]), {});
    expect(
        r.update(screen('A', [{...a, state: {value: 'Анна'}}, b]), {}).completedFields,
    ).toBe(0);
    const wrong = {b: control('b', 'Город', 'Москва')};
    expect(r.update(screen('A', [a, b]), wrong).feedback).toEqual([
        {kind: 'error', message: 'Ошибка Город'},
    ]);
    expect(r.update(screen('A', [a, b]), wrong).feedback).toEqual([]);
    const correct = {b: control('b', 'Город', 'Казань'), a: control('a', 'Имя', 'Анна')};
    expect(r.update(screen('A', [a, b]), correct).completedFields).toBe(2);
    expect(r.update(screen('B'), correct).status).toBe('complete');
});
test('wrong transition cannot bypass missing fields; return, correction and last blur at navigation work', () => {
    const r = new ScenarioRuntime(scenario),
        a = control('a', 'Имя', ''),
        b = control('b', 'Город', '');
    r.update(screen('A', [a, b]), {});
    expect(r.update(screen('B'), {}).feedback).toEqual([
        {kind: 'error', message: 'Неверный переход'},
    ]);
    expect(r.update(screen('B'), {}).step).toBe(1);
    r.update(screen('A', [a, b]), {});
    expect(
        r.update(screen('B'), {
            a: control('a', 'Имя', 'Анна'),
            b: control('b', 'Город', 'Казань'),
        }).status,
    ).toBe('complete');
});
test('ambiguous, missing and unknown choice block assessment without blaming the learner', () => {
    const r = new ScenarioRuntime(scenario),
        a = control('a', 'Имя', ''),
        b = control('b', 'Город', '');
    const ambiguous = r.update(screen('A', [a, b, {...a, id: 'dup'}]), {});
    expect(ambiguous.status).toBe('blocked');
    expect(ambiguous.feedback).toEqual([]);
    expect(r.update({...screen('A'), status: 'loading'}, {}).status).toBe('waiting');
    expect(
        r.update(screen('A', [a, b]), {
            a: {...a, choice: {selection: {status: 'unknown'}}},
        }).status,
    ).toBe('blocked');
});
test('correct value changed to wrong is revoked; optional expectations do not block', () => {
    const s = {
        ...scenario,
        steps: [
            {
                ...scenario.steps[0],
                fields: [
                    field('Имя', 'Анна'),
                    {...field('Нет поля', ''), optional: true},
                ],
            },
        ],
    };
    const r = new ScenarioRuntime(s),
        a = control('a', 'Имя', '');
    r.update(screen('A', [a]), {});
    expect(r.update(screen('A', [a]), {a: control('a', 'Имя', 'Анна')}).status).toBe(
        'complete',
    );
    expect(r.update(screen('A', [a]), {a: control('a', 'Имя', 'Борис')}).status).toBe(
        'active',
    );
});

test('ComboBox compares displayed text only after confirmation, including clearing and correction', () => {
    const combo = (text) =>
        control('c', 'Сотрудник', text, {
            kind: 'combobox',
            locatorHints: {...descriptor('Сотрудник'), kind: 'combobox'},
            choice: {displayValue: text, selection: {status: 'unknown', labels: []}},
        });
    const c = combo('Анна');
    const r = new ScenarioRuntime({
        ...scenario,
        steps: [
            {
                ...scenario.steps[0],
                fields: [
                    {
                        ...field('Сотрудник', ['Анна']),
                        descriptor: c.locatorHints,
                    },
                ],
            },
        ],
    });
    expect(r.update(screen('A', [combo('')]), {}).status).toBe('active');
    expect(r.update(screen('A', [c]), {c: combo('Анна')}).status).toBe('complete');
    const wrong = r.update(screen('A', [c]), {c: combo('')});
    expect(wrong.status).toBe('active');
    expect(wrong.feedback).toEqual([{kind: 'error', message: 'Ошибка Сотрудник'}]);
    expect(r.update(screen('A', [c]), {c: combo('Анна')}).status).toBe('complete');
    expect(
        r.update(screen('A', [c]), {c: {...combo('Анна'), state: {redacted: true}}})
            .status,
    ).toBe('blocked');
});

test('new screen checkbox defaults stay quiet; changes report errors and unmet fields still block transition', () => {
    const box = (id, checked) =>
        control(id, 'Согласие', '', {
            kind: 'checkbox',
            locatorHints: {...descriptor('Согласие'), kind: 'checkbox'},
            state: {checked},
        });
    const c = box('c', false);
    const s = {
        ...scenario,
        steps: [
            {...scenario.steps[0], fields: []},
            {
                key: 'B',
                task: '',
                transitionMessage: 'Заполните поля',
                fields: [{...field('Согласие', true), descriptor: c.locatorHints}],
            },
            {key: 'C', task: '', transitionMessage: '', fields: []},
        ],
    };
    const r = new ScenarioRuntime(s);
    r.update(screen('A'), {});
    const entered = r.update(screen('B', [c]), {});
    expect(entered.feedback).toEqual([]);
    expect(entered.completedFields).toBe(0);
    expect(r.update(screen('B', [box('c', false)]), {}).feedback).toEqual([]);
    expect(r.update(screen('C'), {}).step).toBe(2);
    r.update(screen('B', [box('c', true)]), {});
    expect(r.update(screen('B', [box('c', false)]), {}).feedback).toEqual([
        {kind: 'error', message: 'Ошибка Согласие'},
    ]);
    expect(r.update(screen('B', [box('c', false)]), {}).feedback).toEqual([]);
    expect(r.update(screen('B', [box('remounted', false)]), {}).feedback).toEqual([]);
    r.update(screen('B', [box('remounted', true)]), {});
    expect(r.update(screen('C'), {}).status).toBe('complete');
});
test('late appearing immediate controls get a quiet baseline without accepting wrong defaults', () => {
    const c = control('c', 'Согласие', '', {
        kind: 'checkbox',
        locatorHints: {...descriptor('Согласие'), kind: 'checkbox'},
        state: {checked: false},
    });
    const r = new ScenarioRuntime({
        ...scenario,
        steps: [
            {
                ...scenario.steps[0],
                fields: [{...field('Согласие', true), descriptor: c.locatorHints}],
            },
        ],
    });
    expect(r.update(screen('A'), {}).status).toBe('blocked');
    const first = r.update(screen('A', [c]), {});
    expect(first.status).toBe('active');
    expect(first.completedFields).toBe(0);
    expect(first.feedback).toEqual([]);
});

test('prefilled answers are accepted on entry and after returning from a wrong screen', () => {
    const r = new ScenarioRuntime(scenario),
        a = control('a', 'Имя', 'Анна'),
        b = control('b', 'Город', 'Казань');
    const first = r.update(screen('A', [a, b]), {});
    expect(first.completedFields).toBe(2);
    expect(first.feedback).toEqual([]);
    expect(r.update(screen('WRONG'), {}).feedback).toEqual([
        {kind: 'error', message: 'Неверный переход'},
    ]);
    const returned = r.update(
        screen('A', [
            control('new-a', 'Имя', 'Анна'),
            control('new-b', 'Город', 'Казань'),
        ]),
        {},
    );
    expect(returned.completedFields).toBe(2);
    expect(returned.feedback).toEqual([]);
    const next = r.update(screen('B'), {});
    expect(next.status).toBe('complete');
    expect(next.feedback).toEqual([]);
});
test('wrong prefilled text stays quiet and cannot advance; later edits require blur', () => {
    const r = new ScenarioRuntime({
        ...scenario,
        steps: [
            {...scenario.steps[0], fields: [field('Имя', 'Анна')]},
            scenario.steps[1],
        ],
    });
    const a = control('a', 'Имя', 'Борис');
    const first = r.update(screen('A', [a]), {});
    expect(first.completedFields).toBe(0);
    expect(first.feedback).toEqual([]);
    expect(r.update(screen('B'), {}).step).toBe(1);
    const correct = control('new', 'Имя', 'Анна');
    expect(r.update(screen('A', [correct]), {}).completedFields).toBe(1);
    const edited = control('new', 'Имя', 'Борис');
    expect(r.update(screen('A', [edited]), {}).completedFields).toBe(1);
    const blurred = r.update(screen('A', [edited]), {new: edited});
    expect(blurred.completedFields).toBe(0);
    expect(blurred.feedback).toEqual([{kind: 'error', message: 'Ошибка Имя'}]);
    expect(r.update(screen('B'), {new: edited}).step).toBe(1);
});

test('a prefilled amount on a later screen is evaluated immediately; edits wait for blur', () => {
    const amount = (value) =>
        control('amount', 'Сумма', value, {
            kind: 'number',
            locatorHints: {...descriptor('Сумма'), kind: 'number'},
        });
    const s = {
        ...scenario,
        steps: [
            {...scenario.steps[0], fields: []},
            {
                key: 'B',
                task: '',
                transitionMessage: '',
                fields: [
                    {...field('Сумма', '1500'), descriptor: amount('').locatorHints},
                ],
            },
        ],
    };
    for (const value of ['1500', '2000']) {
        const r = new ScenarioRuntime(s);
        r.update(screen('A'), {});
        const first = r.update(screen('B', [amount(value)]), {});
        expect(first.status).toBe(value === '1500' ? 'complete' : 'active');
        expect(first.feedback).toEqual([]);
        // Merely changing the DOM property does not commit the edited amount.
        expect(r.update(screen('B', [amount('3000')]), {}).completedFields).toBe(
            value === '1500' ? 1 : 0,
        );
        const committed = r.update(screen('B', [amount('3000')]), {
            amount: amount('3000'),
        });
        expect(committed.completedFields).toBe(0);
        expect(committed.feedback).toEqual([{kind: 'error', message: 'Ошибка Сумма'}]);
    }
});

test('recorded checkbox/radio picture compiles last states and false remains a required answer', () => {
    const choice = (id, kind, checked) =>
        control(id, id, '', {
            kind,
            state: {checked},
            locatorHints: {...descriptor(id), kind},
        });
    const start = [
        choice('check', 'checkbox', false),
        choice('one', 'radio', false),
        choice('two', 'radio', false),
    ];
    const final = [start[0], choice('one', 'radio', true), start[2]];
    const recorder = new StateRecorder();
    recorder.start(screen('A', start), {});
    recorder.observe(screen('A', final), {});
    const model = compileScenario(recorder.stop());
    expect(model.steps[0].fields.map((f) => f.expected)).toEqual([false, true, false]);
    const r = new ScenarioRuntime(model);
    expect(r.update(screen('A', final), {}).status).toBe('complete');
    const wrong = r.update(
        screen('A', [choice('check', 'checkbox', true), ...final.slice(1)]),
        {},
    );
    expect(wrong.completedFields).toBe(2);
    expect(wrong.feedback.length).toBe(1);
});

test('success message is optional in v1 JSON and strictly validated when present', () => {
    expect(parseScenario(JSON.stringify(scenario))).toEqual(scenario);
    const document = structuredClone(scenario);
    document.steps[0].fields[0].successMessage = 'Верно';
    expect(parseScenario(JSON.stringify(document))).toEqual(document);
    for (const invalid of [null, 42, {}, []]) {
        document.steps[0].fields[0].successMessage = invalid;
        expect(() => parseScenario(JSON.stringify(document))).toThrow();
    }
});

test('success waits for blur, follows correction and does not repeat on snapshots', () => {
    const document = structuredClone(scenario);
    document.steps[0].fields[0].successMessage = 'Имя верно';
    const runtime = new ScenarioRuntime(document);
    const empty = control('a', 'Имя', '');
    const right = control('a', 'Имя', 'Анна');
    const wrong = control('a', 'Имя', 'Нет');
    const city = control('b', 'Город', 'Казань');
    const state = (name) => screen('A', [name, city]);
    expect(runtime.update(state(empty), {}).feedback).toEqual([]);
    expect(runtime.update(state(right), {}).completedFields).toBe(1);
    expect(runtime.update(state(right), {}).feedback).toEqual([]);
    expect(runtime.update(state(wrong), {a: wrong}).feedback).toEqual([
        {kind: 'error', message: 'Ошибка Имя'},
    ]);
    expect(runtime.update(state(right), {a: right}).feedback).toEqual([
        {kind: 'success', message: 'Имя верно'},
    ]);
    expect(runtime.update(state(right), {a: right}).feedback).toEqual([]);
    expect(runtime.update(state(right), {a: {...right}}).feedback).toEqual([]);
    expect(runtime.update(state(wrong), {a: wrong}).feedback).toHaveLength(1);
    expect(runtime.update(state(right), {a: right}).feedback).toHaveLength(1);
});

test('prefilled success is silent and the final blur can deliver success with navigation', () => {
    const document = structuredClone(scenario);
    document.steps[0].fields[0].successMessage = 'Имя верно';
    const runtime = new ScenarioRuntime(document);
    const name = control('a', 'Имя', '');
    const city = control('b', 'Город', 'Казань');
    expect(runtime.update(screen('A', [name, city]), {}).feedback).toEqual([]);
    const result = runtime.update(screen('B'), {a: control('a', 'Имя', 'Анна')});
    expect(result.status).toBe('complete');
    expect(result.feedback).toEqual([{kind: 'success', message: 'Имя верно'}]);
    expect(runtime.update(screen('B'), {}).feedback).toEqual([]);
    const prefilled = new ScenarioRuntime(document);
    expect(
        prefilled.update(screen('A', [control('a', 'Имя', 'Анна'), city]), {}).feedback,
    ).toEqual([]);
});

test('empty feedback does not accept a wrong answer and ignored fields never notify', () => {
    const document = structuredClone(scenario);
    document.steps[0].fields[0].message = '   ';
    document.steps[0].fields[0].successMessage = '';
    document.steps[0].fields[1].optional = true;
    document.steps[0].fields[1].successMessage = 'Не показывать';
    const runtime = new ScenarioRuntime(document);
    const name = control('a', 'Имя', '');
    const city = control('b', 'Город', 'Казань');
    runtime.update(screen('A', [name, city]), {});
    const wrong = runtime.update(screen('A', [name, city]), {a: name, b: city});
    expect(wrong.feedback).toEqual([]);
    expect(wrong.completedFields).toBe(0);
    expect(runtime.update(screen('B'), {a: name}).step).toBe(1);
});

test('checkbox success occurs on change, not entry, repetition or remount', () => {
    const box = (id, checked) =>
        control(id, 'Согласие', '', {
            kind: 'checkbox',
            locatorHints: {...descriptor('Согласие'), kind: 'checkbox'},
            state: {checked},
        });
    const document = structuredClone(scenario);
    document.steps[0].fields = [
        {
            ...field('Согласие', true),
            descriptor: box('c', false).locatorHints,
            successMessage: 'Согласие верно',
        },
    ];
    const runtime = new ScenarioRuntime(document);
    expect(runtime.update(screen('A', [box('c', false)]), {}).feedback).toEqual([]);
    expect(runtime.update(screen('A', [box('c', true)]), {}).feedback).toEqual([
        {kind: 'success', message: 'Согласие верно'},
    ]);
    expect(runtime.update(screen('A', [box('c', true)]), {}).feedback).toEqual([]);
    expect(runtime.update(screen('A', [box('new', true)]), {}).feedback).toEqual([]);
});

test('matcher refuses reused ID with a conflicting label and can find the original by its new ID', () => {
    const hint = descriptor('Имя', 'stable-field');
    const replacement = control('replacement', 'Другой смысл', '', {
        locatorHints: descriptor('Другой смысл', 'stable-field'),
    });
    expect(matchControl(hint, [replacement]).status).toBe('missing');
    const original = control('original', 'Имя', '', {
        locatorHints: descriptor('Имя', 'new-id'),
    });
    expect(matchControl(hint, [replacement, original])).toEqual({
        status: 'matched',
        control: original,
    });
    expect(matchControl({...hint, label: ''}, [replacement]).status).toBe('matched');
});
