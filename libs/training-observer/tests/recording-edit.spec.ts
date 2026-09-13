import {
    AreaRegistry,
    describeElement,
    draftScenario,
    ElementRecorder,
    type GroupedScenario,
    mergeScenarioDraft,
    type Recording,
    removeRecordedAction,
} from '../src';

let recording: Recording;
let generate: (log: Recording) => GroupedScenario;

beforeEach(() => {
    jest.useFakeTimers();
    const root = document.createElement('main');

    root.innerHTML =
        '<test-area><input aria-label="Name"><input aria-label="Email"><button>Finish</button><h2>Done</h2></test-area>';
    document.body.append(root);
    const areas = new AreaRegistry([{key: 'test', hostTag: 'test-area', observe: true}]);

    areas.start(root);
    const recorder = new ElementRecorder(root, {
        areas,
        acceptUntrustedEvents: true,
        valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
    });

    const write = (index: number, value: string): void => {
        const field = root.querySelectorAll('input')[index]!;

        field.value = value;
        field.dispatchEvent(new Event('input', {bubbles: true}));
        field.dispatchEvent(new Event('blur'));
        jest.advanceTimersByTime(0);
    };

    recorder.start();
    write(0, 'first');
    write(0, 'last');
    write(1, 'email');
    root.querySelector('button')!.click();
    jest.advanceTimersByTime(0);
    recorder.stop();
    recording = recorder.snapshot();
    const finish = describeElement(
        root.querySelector('h2')!,
        areas.root('test')!,
        'finish',
        {includeStatic: true},
    );

    const boundary = recording.actions[3]!.id;

    generate = (log) =>
        draftScenario(log, finish, 'test', [
            {actionId: boundary, nextTargetId: finish.id},
        ]) as GroupedScenario;
    areas.stop();
    root.remove();
});

afterEach(() => jest.useRealTimers());

it('removes only an action, preserves sequence gaps and does not mutate the source or background states', () => {
    const json = JSON.stringify(recording);
    const next = removeRecordedAction(recording, recording.actions[1]!.id);

    expect(next.actions.map((entry) => entry.sequence)).toEqual([1, 3, 4]);
    expect(next.states).toEqual(recording.states);
    expect(JSON.stringify(recording)).toBe(json);
    expect(() => removeRecordedAction(next, recording.actions[1]!.id)).toThrow();
    expect(
        next.actions.reduce((log, action) => removeRecordedAction(log, action.id), next)
            .actions,
    ).toEqual([]);
});

it('recomputes the last remaining input value while preserving authored text and neighboring settings', () => {
    const base = generate(recording);
    const edited = generate(recording);

    edited.groups[0]!.title = 'Custom group';
    edited.groups[0]!.expectations[0]!.instruction = 'Custom instruction';
    edited.groups[0]!.expectations[1]!.optional = true;
    const next = generate(removeRecordedAction(recording, recording.actions[1]!.id));
    const result = mergeScenarioDraft(base, edited, next).scenario as GroupedScenario;

    expect(result.groups[0]).toMatchObject({title: 'Custom group'});
    expect(result.groups[0]!.expectations[0]).toMatchObject({
        instruction: 'Custom instruction',
        action: {value: {value: 'first'}},
    });
    expect(result.groups[0]!.expectations[1]!.optional).toBe(true);
});

it('preserves a collapsed expectation ID after removing its first input event without mutating the new draft', () => {
    const base = generate(recording);
    const edited = generate(recording);

    edited.groups[0]!.expectations[0]!.hint = 'Keep me';
    const next = generate(removeRecordedAction(recording, recording.actions[0]!.id));
    const json = JSON.stringify(next);
    const result = mergeScenarioDraft(base, edited, next);

    expect((result.scenario as GroupedScenario).groups[0]!.expectations[0]).toMatchObject(
        {id: recording.actions[0]!.id, hint: 'Keep me'},
    );
    expect(JSON.stringify(next)).toBe(json);
    expect(mergeScenarioDraft(result.baseline, result.scenario!, next).conflicts).toEqual(
        [],
    );
});

it('requires an explicit decision on conflicting values and keeps unrelated author edits', () => {
    const base = generate(recording);
    const edited = generate(recording);
    const job = edited.groups[0]!.expectations[0]!;

    if ('value' in job.action && job.completion.kind === 'value') {
        job.action.value = {kind: 'raw-equals', value: 'authored'};
        job.completion.condition = job.action.value;
    }

    edited.groups[0]!.expectations[1]!.hint = 'Unrelated hint';
    const next = generate(removeRecordedAction(recording, recording.actions[1]!.id));

    expect(mergeScenarioDraft(base, edited, next)).toMatchObject({
        scenario: null,
        conflicts: expect.arrayContaining([
            expect.stringContaining('.action.value.value'),
        ]),
    });
    const accepted = mergeScenarioDraft(base, edited, next, true)
        .scenario as GroupedScenario;

    expect(accepted.groups[0]!.expectations[0]!.action).toMatchObject({
        value: {value: 'first'},
    });
    expect(accepted.groups[0]!.expectations[1]!.hint).toBe('Unrelated hint');
});

it('rejects dangling dependencies even when the author accepts conflicting deletions', () => {
    const base = generate(recording);
    const edited = generate(recording);

    edited.groups[0]!.expectations[1]!.requires = [recording.actions[0]!.id];
    const next = generate(
        removeRecordedAction(
            removeRecordedAction(recording, recording.actions[0]!.id),
            recording.actions[1]!.id,
        ),
    );

    expect(() => mergeScenarioDraft(base, edited, next, true)).toThrow();
    edited.groups[0]!.expectations[1]!.requires = [];
    expect(
        (mergeScenarioDraft(base, edited, next).scenario as GroupedScenario).groups[0]!
            .expectations,
    ).toHaveLength(1);
});

it('does not silently keep an edited expectation whose action was deleted', () => {
    const base = generate(recording);
    const edited = generate(recording);

    edited.groups[0]!.expectations[1]!.hint = 'Edited deleted action';
    const next = generate(removeRecordedAction(recording, recording.actions[2]!.id));

    expect(mergeScenarioDraft(base, edited, next).scenario).toBeNull();
    expect(
        (mergeScenarioDraft(base, edited, next, true).scenario as GroupedScenario)
            .groups[0]!.expectations,
    ).toHaveLength(1);
});

it('requires a new boundary decision after deleting a transition', () => {
    expect(() =>
        generate(removeRecordedAction(recording, recording.actions[3]!.id)),
    ).toThrow('Проверьте действия');
});

it('keeps later group identities and author text when deleting an earlier boundary shifts group numbers', () => {
    const original = generate(recording);
    const finish = original.descriptors.find((entry) => entry.id === 'finish')!;
    const source = [
        recording.actions[0]!,
        recording.actions[3]!,
        recording.actions[1]!,
        recording.actions[3]!,
        recording.actions[2]!,
        recording.actions[3]!,
    ];

    const log: Recording = {
        ...recording,
        actions: source.map((entry, index) => ({
            ...entry,
            id: `event-${index}`,
            sequence: index + 1,
            timeMs: index,
        })),
    };

    const build = (input: Recording, edges: number[]): GroupedScenario =>
        draftScenario(
            input,
            finish,
            'test',
            edges.map((index) => ({actionId: `event-${index}`, nextTargetId: finish.id})),
        ) as GroupedScenario;

    const base = build(log, [1, 3, 5]);
    const edited = build(log, [1, 3, 5]);

    edited.groups[2]!.title = 'Preserve third screen';
    edited.groups[2]!.expectations[0]!.hint = 'Email hint';
    const next = build(removeRecordedAction(log, 'event-1'), [3, 5]);
    const result = mergeScenarioDraft(base, edited, next);

    expect(result.conflicts).toEqual([]);
    const merged = result.scenario as GroupedScenario;

    expect(merged.groups).toHaveLength(2);
    expect(merged.groups[1]).toMatchObject({
        id: 'group-3',
        title: 'Preserve third screen',
    });
    expect(merged.groups[1]!.expectations[0]!.hint).toBe('Email hint');
    expect(merged.groups[0]!.transitions[0]!.toGroupId).toBe('group-3');
    expect(next.groups[1]!.id).toBe('group-2');
});

it('merges v5 feedback and new choice descriptors with deletion from a v4 recording draft', () => {
    const base = generate(recording);
    const authored: GroupedScenario = JSON.parse(JSON.stringify(base));

    authored.version = 5;
    const job = authored.groups[0]!.expectations[0]!;

    job.feedback = {success: 'Accepted', mismatch: 'Correct the name'};
    const descriptor = JSON.parse(JSON.stringify(authored.descriptors[0]!));

    descriptor.id = 'author-choice';
    descriptor.fingerprint.features.accessibleName = 'Other control';
    authored.descriptors.push(descriptor);
    authored.areas.targets.push({targetId: descriptor.id, areaKey: 'test'});
    job.choiceGroups = [
        {
            id: 'choices',
            title: 'Choices',
            variants: [
                {
                    id: 'other',
                    action: {kind: 'click', targetId: descriptor.id},
                    outcome: 'error',
                    message: 'Other action',
                },
            ],
        },
    ];
    const result = mergeScenarioDraft(
        base,
        authored,
        generate(removeRecordedAction(recording, recording.actions[2]!.id)),
    );

    expect(result.conflicts).toEqual([]);
    const merged = result.scenario as GroupedScenario;

    expect(merged.version).toBe(5);
    expect(merged.groups[0]!.expectations[0]!.feedback).toEqual(job.feedback);
    expect(merged.groups[0]!.expectations[0]!.choiceGroups).toEqual(job.choiceGroups);
    expect(merged.areas.targets).toContainEqual({
        targetId: 'author-choice',
        areaKey: 'test',
    });
    expect(merged.descriptors.some((entry) => entry.id === 'author-choice')).toBe(true);
    expect(base.version).toBe(4);
});
