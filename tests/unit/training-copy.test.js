import {expect, test} from '@jest/globals';
import {StateRecorder, removeRecordedEvent} from '@training-observer/recording';
import {ScenarioRuntime} from '@training-observer/runtime';

function withoutStructuredClone(action) {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');

    Object.defineProperty(globalThis, 'structuredClone', {
        configurable: true,
        value: undefined,
        writable: true,
    });

    try {
        action();
    } finally {
        if (original) {
            Object.defineProperty(globalThis, 'structuredClone', original);
        } else {
            delete globalThis.structuredClone;
        }
    }
}

function descriptor() {
    return {
        kind: 'select',
        label: 'Команды',
        role: 'listbox',
        tagName: 'select',
        id: undefined,
        context: [{tagName: 'section', id: undefined, label: 'Назначение'}],
    };
}

function selection(labels = ['Разработка']) {
    return {
        id: 'selection',
        visible: true,
        kind: 'select',
        locatorHints: descriptor(),
        state: {value: labels},
        choice: {selection: {status: 'observed', labels}},
    };
}

function screen(controls = []) {
    return {status: 'ready', reason: 'ready', key: 'A', controls};
}

test('recording works without structuredClone and isolates source controls and returned snapshots', () => {
    withoutStructuredClone(() => {
        const control = selection();
        const recorder = new StateRecorder();

        recorder.start(screen([control]), {});
        recorder.observe(screen([control]), {selection: control});
        control.locatorHints.label = 'Изменено снаружи';
        control.locatorHints.context[0].label = 'Изменённый контекст';
        control.choice.selection.labels.push('Поддержка');

        const snapshot = recorder.snapshot();
        const event = snapshot.events[1];

        expect(event.field).toStrictEqual(descriptor());
        expect(event.value).toEqual(['Разработка']);
        expect('id' in event.field).toBe(true);
        expect('id' in event.field.context[0]).toBe(true);
        expect('placeholder' in event.field).toBe(false);
        event.field.context[0].label = 'Изменено в копии';
        event.field.context.push({tagName: 'section', label: 'Новый контекст'});
        event.value.push('Продажи');
        snapshot.events.splice(0, 1);

        const stopped = recorder.stop();

        expect(stopped.events).toHaveLength(2);
        expect(stopped.events[1].field).toStrictEqual(descriptor());
        expect(stopped.events[1].value).toEqual(['Разработка']);
    });
});

test('recording deletion works without structuredClone and preserves optional properties and copy isolation', () => {
    withoutStructuredClone(() => {
        const original = {
            kind: 'training-state-recording',
            version: 1,
            complete: true,
            events: [
                {
                    sequence: 1,
                    kind: 'screen',
                    visit: 1,
                    screenKey: 'A',
                    reason: undefined,
                },
                {
                    sequence: 2,
                    kind: 'value',
                    visit: 1,
                    screenKey: 'A',
                    field: descriptor(),
                    value: ['Разработка'],
                },
                {sequence: 3, kind: 'screen', visit: 2, screenKey: 'B'},
            ],
        };
        const edited = removeRecordedEvent(original, 3);

        expect(edited.events).toStrictEqual(original.events.slice(0, 2));
        expect('reason' in edited.events[0]).toBe(true);
        expect('field' in edited.events[0]).toBe(false);
        edited.events[1].field.context[0].label = 'Изменено';
        edited.events[1].value.push('Продажи');

        expect(original.events[1].field).toStrictEqual(descriptor());
        expect(original.events[1].value).toEqual(['Разработка']);
        original.events[1].field.context.push({tagName: 'section', label: 'Снаружи'});
        original.events[1].value.push('Поддержка');
        expect(edited.events[1].field.context).toHaveLength(1);
        expect(edited.events[1].value).toEqual(['Разработка', 'Продажи']);
    });
});

test('runtime works without structuredClone and keeps its initial scenario after external edits', () => {
    withoutStructuredClone(() => {
        const scenario = {
            kind: 'training-state-scenario',
            version: 1,
            steps: [
                {
                    key: 'A',
                    task: 'Выберите команду',
                    transitionMessage: 'Вернитесь к назначению',
                    fields: [
                        {
                            descriptor: descriptor(),
                            expected: ['Разработка'],
                            message: 'Проверьте команду',
                            successMessage: undefined,
                            optional: false,
                        },
                    ],
                },
            ],
        };
        const runtime = new ScenarioRuntime(scenario);
        const field = scenario.steps[0].fields[0];

        field.expected.push('Поддержка');
        field.descriptor.label = 'Другое поле';
        field.descriptor.context[0].label = 'Другой контекст';
        field.optional = true;
        scenario.steps[0].key = 'B';
        scenario.steps.splice(0, 1);

        const progress = runtime.update(screen([selection()]), {});

        expect(progress.status).toBe('complete');
        expect(progress.requiredFields).toBe(1);
        expect(progress.completedFields).toBe(1);
        expect(progress.feedback).toEqual([]);
    });
});
