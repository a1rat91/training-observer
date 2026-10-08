import {expect, test} from '@jest/globals';
import {parseStateRecording} from '../../libs/training-contracts/src/lib/recording-codec';
import {parseScenario} from '../../libs/training-contracts/src/lib/scenario-codec';
import {
    recordingProblem,
    removeRecordedEvent,
} from '../../libs/training-recording/src/lib/recording-edit';
import {compileScenario} from '../../libs/training-recording/src/lib/scenario-compiler';
import {ScenarioRuntime} from '../../libs/training-runtime/src/lib/scenario-runtime';

const descriptor = {
    kind: 'textbox',
    label: 'Имя',
    tagName: 'input',
    role: 'textbox',
    context: [],
};
const control = (id, value) => ({
    id,
    kind: 'textbox',
    visible: true,
    locatorHints: descriptor,
    state: {value},
});
const screen = (key, controls = []) => ({status: 'ready', key, controls});
const step = (key, fields = []) => ({
    key,
    task: 'Заполните поля',
    transitionMessage: 'Неверный переход',
    fields,
});
const scenario = (steps) => ({kind: 'training-state-scenario', version: 1, steps});
const recording = (events) => ({
    kind: 'training-state-recording',
    version: 1,
    complete: true,
    events: events.map((event, index) => ({...event, sequence: index + 1})),
});
const expectation = (hints, expected) => ({
    descriptor: hints,
    expected,
    message: 'Проверьте имя',
    successMessage: 'Имя верно',
    optional: false,
});

test('compiler keeps the last value when descriptor and context property order changes', () => {
    const originalHints = {
        ...descriptor,
        id: 'name',
        placeholder: 'Имя',
        context: [{tagName: 'fieldset', label: 'Сведения', id: 'details'}],
    };
    const reorderedHints = {
        context: [{id: 'details', label: 'Сведения', tagName: 'fieldset'}],
        placeholder: 'Имя',
        id: 'name',
        role: 'textbox',
        tagName: 'input',
        label: 'Имя',
        kind: 'textbox',
    };
    const document = parseStateRecording(
        JSON.stringify(
            recording([
                {kind: 'screen', visit: 1, screenKey: 'A'},
                {
                    kind: 'value',
                    visit: 1,
                    screenKey: 'A',
                    field: originalHints,
                    value: 'Борис',
                },
                {
                    kind: 'value',
                    visit: 1,
                    screenKey: 'A',
                    field: reorderedHints,
                    value: 'Анна',
                },
            ]),
        ),
    );
    document.events[1].field.inputType = undefined;
    const before = structuredClone(document);
    const compiled = compileScenario(document);

    expect(compiled.steps[0].fields).toHaveLength(1);
    expect(compiled.steps[0].fields[0].expected).toBe('Анна');
    expect(document).toEqual(before);
    expect(
        new ScenarioRuntime(compiled).update(
            screen('A', [{...control('new-node', 'Анна'), locatorHints: originalHints}]),
            {},
        ).status,
    ).toBe('complete');
});

test('compiler preserves descriptor differences and the order of ancestor contexts', () => {
    const outer = {tagName: 'section', label: 'Внешний'};
    const inner = {tagName: 'fieldset', label: 'Внутренний'};
    const document = recording([
        {kind: 'screen', visit: 1, screenKey: 'A'},
        ...[
            {...descriptor, context: [outer, inner]},
            {...descriptor, context: [inner, outer]},
            {...descriptor, name: 'other', context: [outer, inner]},
        ].map((field) => ({
            kind: 'value',
            visit: 1,
            screenKey: 'A',
            field,
            value: 'Анна',
        })),
    ]);

    expect(compileScenario(document).steps[0].fields).toHaveLength(3);
});

test.each(['missing', 'hidden', 'ambiguous'])(
    'unchanged blur feedback stays deduplicated through a temporarily %s target',
    (failure) => {
        const runtime = new ScenarioRuntime(
            scenario([step('A', [expectation(descriptor, 'Анна')])]),
        );
        const empty = control('name', '');
        const wrong = control('name', 'Борис');
        const right = control('name', 'Анна');
        const unavailable = (current) => {
            switch (failure) {
                case 'missing':
                    return screen('A');
                case 'hidden':
                    return screen('A', [{...current, visible: false}]);
                default:
                    return screen('A', [current, {...current, id: 'duplicate'}]);
            }
        };
        runtime.update(screen('A', [empty]), {});

        for (const [current, kind, message] of [
            [wrong, 'error', 'Проверьте имя'],
            [right, 'success', 'Имя верно'],
            [wrong, 'error', 'Проверьте имя'],
        ]) {
            const confirmed = {name: current};
            expect(runtime.update(screen('A', [current]), confirmed).feedback).toEqual([
                {kind, message},
            ]);
            const blocked = runtime.update(unavailable(current), confirmed);
            expect(blocked.status).toBe('blocked');
            expect(blocked.feedback).toEqual([]);
            expect(runtime.update(screen('A', [current]), confirmed).feedback).toEqual(
                [],
            );
            expect(runtime.update(screen('A', [current]), confirmed).feedback).toEqual(
                [],
            );
        }
    },
);

test('a quiet correct remount still permits the next wrong blur to report the same error', () => {
    const runtime = new ScenarioRuntime(
        scenario([step('A', [expectation(descriptor, 'Анна')])]),
    );
    const wrong = control('old-name', 'Борис');
    runtime.update(screen('A', [control('old-name', '')]), {});
    expect(runtime.update(screen('A', [wrong]), {'old-name': wrong}).feedback).toEqual([
        {kind: 'error', message: 'Проверьте имя'},
    ]);
    const remounted = control('new-name', 'Анна');
    expect(runtime.update(screen('A', [remounted]), {}).feedback).toEqual([]);
    const nextWrong = control('new-name', 'Борис');
    expect(
        runtime.update(screen('A', [nextWrong]), {'new-name': nextWrong}).feedback,
    ).toEqual([{kind: 'error', message: 'Проверьте имя'}]);
});

const valuesByKind = [
    ['textbox', ['', 'Анна'], [true, [], ['Анна']]],
    ['number', ['', '1 500,00'], [false, 1500, ['1500']]],
    ['checkbox', [false, true], ['', [], ['checked']]],
    ['radio', [false, true], ['', [], ['option']]],
    ['switch', [false, true], ['', [], ['on']]],
    ['select', [[], ['Разработка', 'Поддержка']], [true, '', ['Отдел', 1]]],
    ['combobox', [[], ['Анна']], [false, 'Анна', [''], ['Анна', 'Борис']]],
    ['button', [], [false, 'Продолжить', []]],
];

test.each(valuesByKind)(
    'both JSON boundaries enforce the documented values for %s',
    (kind, validValues, invalidValues) => {
        const hints = {...descriptor, kind};
        for (const value of validValues) {
            const recorded = recording([
                {kind: 'screen', visit: 1, screenKey: 'A'},
                {kind: 'value', visit: 1, screenKey: 'A', field: hints, value},
            ]);
            expect(parseStateRecording(JSON.stringify(recorded))).toEqual(recorded);
            const document = scenario([step('A', [expectation(hints, value)])]);
            expect(parseScenario(JSON.stringify(document))).toEqual(document);
        }
        for (const value of invalidValues) {
            expect(() =>
                parseStateRecording(
                    JSON.stringify(
                        recording([
                            {kind: 'screen', visit: 1, screenKey: 'A'},
                            {
                                kind: 'value',
                                visit: 1,
                                screenKey: 'A',
                                field: hints,
                                value,
                            },
                        ]),
                    ),
                ),
            ).toThrow(/Некорректная строка записи/);
            expect(() =>
                parseScenario(
                    JSON.stringify(scenario([step('A', [expectation(hints, value)])])),
                ),
            ).toThrow(/Некорректное ожидание/);
        }
    },
);

test('deleting an empty intervening visit marks adjacent equal screen keys incomplete', () => {
    const original = recording([
        {kind: 'screen', visit: 1, screenKey: 'A'},
        {kind: 'value', visit: 1, screenKey: 'A', field: descriptor, value: 'Анна'},
        {kind: 'screen', visit: 2, screenKey: 'B'},
        {kind: 'screen', visit: 3, screenKey: 'A'},
        {kind: 'value', visit: 3, screenKey: 'A', field: descriptor, value: 'Борис'},
    ]);
    const edited = removeRecordedEvent(original, 3);

    expect(edited.complete).toBe(false);
    expect(recordingProblem(edited)).toMatch(/соседние посещения/);
    expect(edited.events.map((event) => event.visit)).toEqual([1, 1, 3, 3]);
    expect(
        edited.events
            .filter((event) => event.kind === 'value')
            .map((event) => event.value),
    ).toEqual(['Анна', 'Борис']);
    expect(original.events).toHaveLength(5);
    expect(() => compileScenario(edited)).toThrow();
    expect(() => compileScenario({...edited, complete: true})).toThrow(
        /соседние посещения/,
    );
});

test('scenario imports and direct runtime construction reject adjacent equal screen keys', () => {
    const document = scenario([step('A'), step('A')]);

    expect(() => parseScenario(JSON.stringify(document))).toThrow(/соседние шаги/i);
    expect(() => new ScenarioRuntime(document)).toThrow(/соседние шаги/i);
});

test('distinct intermediate screens still allow a legitimate return visit to the same key', () => {
    const document = parseScenario(
        JSON.stringify(scenario([step('A'), step('B'), step('A')])),
    );
    const runtime = new ScenarioRuntime(document);

    expect(runtime.update(screen('A'), {}).step).toBe(1);
    expect(runtime.update(screen('B'), {}).step).toBe(2);
    expect(runtime.update(screen('A'), {})).toMatchObject({
        status: 'complete',
        step: 3,
        total: 3,
    });
});
