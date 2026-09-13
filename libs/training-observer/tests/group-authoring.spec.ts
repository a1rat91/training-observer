import {
    AreaRegistry,
    describeElement,
    draftScenario,
    ElementRecorder,
    type GroupedScenario,
    parseRecording,
} from '../src';

it('drafts explicit boundaries, keeps final field values only inside their group and preserves selection values', () => {
    jest.useFakeTimers();
    const root = document.createElement('main');

    root.innerHTML =
        '<example-surface><label>Имя<input></label><label>Выбор<select><option>A</option><option>B</option></select></label><button>Открыть</button><h2>Готово</h2></example-surface>';
    document.body.append(root);
    const areas = new AreaRegistry([
        {key: 'example', hostTag: 'example-surface', observe: true},
    ]);

    areas.start(root);
    const recorder = new ElementRecorder(root, {
        areas,
        acceptUntrustedEvents: true,
        valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
    });

    try {
        recorder.start();
        const field = root.querySelector('input')!;
        const input = (value: string): void => {
            field.value = value;
            field.dispatchEvent(new Event('input', {bubbles: true}));
            jest.advanceTimersByTime(0);
            field.dispatchEvent(new Event('blur'));
            jest.advanceTimersByTime(0);
        };

        input('Черновик');
        input('Итог');
        root.querySelector('button')!.click();
        jest.advanceTimersByTime(0);
        input('Другая группа');
        root.querySelector('select')!.value = 'B';
        root.querySelector('select')!.dispatchEvent(new Event('change', {bubbles: true}));
        jest.advanceTimersByTime(0);
        recorder.stop();
        const log = parseRecording(recorder.export());
        const finish = describeElement(
            root.querySelector('h2')!,
            areas.root('example')!,
            'finish',
            {includeStatic: true},
        );

        const click = log.actions.find((action) => action.kind === 'click')!;
        const selection = log.actions.find((action) => action.kind === 'select')!;
        const fieldId = log.actions[0]!.kind === 'input' ? log.actions[0]!.targetId : '';
        const draft = draftScenario(log, finish, 'example', [
            {actionId: click.id, nextTargetId: fieldId},
            {actionId: selection.id, nextTargetId: finish.id},
        ]) as GroupedScenario;

        expect(draft.version).toBe(4);
        expect(draft.groups).toHaveLength(2);
        expect(draft.groups[0]!.expectations).toHaveLength(1);
        expect(draft.groups[0]!.expectations[0]!.action).toMatchObject({
            kind: 'input',
            value: {value: 'Итог'},
        });
        expect(draft.groups[1]!.expectations[0]!.action).toMatchObject({
            kind: 'input',
            value: {value: 'Другая группа'},
        });
        expect(draft.groups[1]!.transitions[0]!.action).toMatchObject({
            kind: 'select',
            value: {value: ['B']},
        });
        expect(draft.groups[1]!.transitions[0]!.toGroupId).toBeNull();
        expect(draft.groups[0]!.expectations[0]!.requires).toEqual([]);
        expect(() =>
            draftScenario(log, finish, 'example', [
                {actionId: 'absent', nextTargetId: fieldId},
            ]),
        ).toThrow();
    } finally {
        recorder.stop();
        areas.stop();
        root.remove();
        jest.useRealTimers();
    }
});
