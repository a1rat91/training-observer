import {
    type Condition,
    type ElementDescriptor,
    readRecording,
    readScenario,
    type Recording,
    type Scenario,
    type ScenarioStep,
} from '../contracts';

/** Reviewable linear draft, not automatic inference of business completion. */
export function draftScenario(input: Recording, finish: ElementDescriptor): Scenario {
    const recording = readRecording(input);

    if (!recording.actions.length) {
        throw new Error('Сначала запишите действия.');
    }

    if (recording.mode.kind !== 'dom-only' || recording.diagnostics?.length) {
        throw new Error(
            'Запись содержит неподдержанные события или режим. Исправьте её перед созданием сценария.',
        );
    }

    const descriptors = [...recording.descriptors, finish];
    const completion: Condition = {kind: 'visible', targetId: finish.id, expected: true};
    const steps: ScenarioStep[] = recording.actions.map((action, index) => {
        const next = recording.actions[index + 1];
        const descriptor =
            'targetId' in action
                ? descriptors.find((item) => item.id === action.targetId)
                : undefined;

        const name =
            descriptor?.fingerprint.features.accessibleName ||
            descriptor?.fingerprint.features.label ||
            (action.kind === 'navigation' ? action.pathname : action.targetId);

        let condition: Condition = completion;
        let instruction = `Нажмите «${name}»`;
        let hint = 'Выполните действие и дождитесь изменения экрана.';

        if ('value' in action) {
            if (action.value.status !== 'captured') {
                throw new Error(
                    'Для черновика нужны записанные ожидаемые значения. Скрытые значения задаются вручную.',
                );
            }

            condition = {
                kind: 'value',
                targetId: action.targetId,
                condition: action.value.normalized
                    ? {kind: 'normalized-equals', normalized: action.value.normalized}
                    : {kind: 'raw-equals', value: action.value.raw},
            };
            instruction = `Заполните «${name}»`;
            hint = `Ожидаемое значение: ${JSON.stringify(action.value.raw)}`;
        } else if (action.kind === 'navigation') {
            instruction = `Перейдите на ${action.pathname}`;
            condition = {kind: 'pathname', value: action.pathname};
        } else if (next) {
            condition =
                next.kind === 'navigation'
                    ? {kind: 'pathname', value: next.pathname}
                    : {kind: 'visible', targetId: next.targetId, expected: true};
        }

        return {
            id: `step-${index + 1}`,
            instruction,
            hint,
            optional: false,
            action:
                action.kind === 'navigation'
                    ? {kind: action.kind, pathname: action.pathname}
                    : {kind: action.kind, targetId: action.targetId},
            completion: condition,
            branches: [],
            nextStepId: next ? `step-${index + 2}` : null,
        };
    });

    const used = new Set(
        recording.actions.flatMap((action) =>
            'targetId' in action ? [action.targetId] : [],
        ),
    );

    used.add(finish.id);

    return readScenario({
        kind: 'training-scenario',
        version: 2,
        id: `scenario-${recording.id}`,
        mode: {kind: 'dom-only'},
        descriptors: descriptors.filter((item) => used.has(item.id)),
        startStepId: steps[0]!.id,
        completion,
        steps,
    });
}
