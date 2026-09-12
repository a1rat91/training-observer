/**
 * Authoring v4: автор явно отмечает границы групп и цель postcondition каждого перехода.
 * Внутри группы исправления одного input/select сворачиваются до последнего значения;
 * порядок полей не порождает requires. Повторные клики не угадываются как новые группы.
 * v2 остаётся прежним черновиком без областей; для групп нужна явная привязка записи к областям.
 */
import {
    type Condition,
    type ElementDescriptor,
    type Expectation,
    type ExpectationGroup,
    type GroupedScenario,
    type GroupExpectedAction,
    readRecording,
    readScenario,
    type Recording,
    type Scenario,
    type SemanticAction,
} from '../contracts';
import {draftLegacyScenario} from './legacy-authoring';

export interface DraftBoundary {
    actionId: string;
    /** Явно выбранная цель, видимость которой подтверждает результат действия. */
    nextTargetId: string;
}

export function draftScenario(
    input: Recording,
    finish: ElementDescriptor,
    finishAreaKey?: string,
    boundaries: readonly DraftBoundary[] = [],
): Scenario {
    const recording = readRecording(input);

    if (recording.version === 2) {
        return draftLegacyScenario(recording, finish);
    }

    if (!recording.actions.length) {
        throw new Error('Сначала запишите действия.');
    }

    if (recording.mode.kind !== 'dom-only' || recording.diagnostics?.length) {
        throw new Error(
            'Запись содержит неподдержанные события или режим. Исправьте её перед созданием сценария.',
        );
    }

    if (!finishAreaKey) {
        throw new Error('Укажите область признака завершения.');
    }

    const descriptors = [...recording.descriptors, finish];
    const edges = new Map(
        boundaries.map((entry) => [entry.actionId, entry.nextTargetId]),
    );

    if (
        edges.size !== boundaries.length ||
        boundaries.some(
            (entry) =>
                !recording.actions.some((action) => action.id === entry.actionId) ||
                !descriptors.some((target) => target.id === entry.nextTargetId),
        )
    ) {
        throw new Error('Проверьте действия и цели переходов.');
    }

    const visible = (targetId: string): Condition => ({
        kind: 'visible',
        targetId,
        expected: true,
    });

    const actionCondition = (action: SemanticAction): Condition => {
        if ('value' in action) {
            if (action.value.status !== 'captured') {
                throw new Error('Для черновика нужны записанные ожидаемые значения.');
            }

            return {
                kind: 'value',
                targetId: action.targetId,
                condition: action.value.normalized
                    ? {kind: 'normalized-equals', normalized: action.value.normalized}
                    : {kind: 'raw-equals', value: action.value.raw},
            };
        }

        return action.kind === 'navigation'
            ? {kind: 'pathname', value: action.pathname}
            : visible(action.targetId);
    };

    const name = (action: SemanticAction): string => {
        const features =
            action.kind === 'navigation'
                ? undefined
                : descriptors.find((target) => target.id === action.targetId)!.fingerprint
                      .features;

        return (
            features?.accessibleName ||
            features?.label ||
            (action.kind === 'navigation' ? action.pathname : action.targetId)
        );
    };

    const expected = (action: SemanticAction): GroupExpectedAction => {
        if (action.kind === 'navigation') {
            return {kind: action.kind, pathname: action.pathname};
        }

        if (action.kind === 'click') {
            return {kind: action.kind, targetId: action.targetId};
        }

        const condition = actionCondition(action);

        if (condition.kind !== 'value') {
            throw new Error('Ожидалось значение действия.');
        }

        return {kind: action.kind, targetId: action.targetId, value: condition.condition};
    };

    const groups: ExpectationGroup[] = [];
    let group: ExpectationGroup | undefined;
    let entry: Condition | undefined;

    for (const [index, action] of recording.actions.entries()) {
        if (!group) {
            group = {
                id: `group-${groups.length + 1}`,
                title: `Группа ${groups.length + 1}`,
                entry:
                    entry ??
                    (action.kind === 'navigation'
                        ? {
                              kind: 'pathname',
                              value: descriptors[0]?.scope.pathname ?? action.pathname,
                          }
                        : visible(action.targetId)),
                expectations: [],
                transitions: [],
            };
            groups.push(group);
        }

        const nextTarget = edges.get(action.id);

        if (nextTarget) {
            const completion = visible(nextTarget);

            group.transitions.push({
                id: action.id,
                instruction: `Выполните переход: «${name(action)}»`,
                hint: null,
                when: null,
                requires: [],
                action: expected(action),
                completion,
                toGroupId:
                    index === recording.actions.length - 1
                        ? null
                        : `group-${groups.length + 1}`,
            });
            entry = completion;
            group = undefined;
            continue;
        }

        const previous =
            'value' in action
                ? group.expectations.find(
                      (item) =>
                          item.action.kind === action.kind &&
                          'targetId' in item.action &&
                          item.action.targetId === action.targetId,
                  )
                : undefined;

        const expectation: Expectation = {
            id: previous?.id ?? action.id,
            instruction:
                action.kind === 'navigation'
                    ? `Перейдите на ${action.pathname}`
                    : `${'value' in action ? 'Заполните' : 'Нажмите'} «${name(action)}»`,
            hint:
                'value' in action && action.value.status === 'captured'
                    ? `Ожидаемое значение: ${JSON.stringify(action.value.raw)}`
                    : 'Выполните действие и проверьте результат.',
            optional: false,
            when: null,
            requires: [],
            action: expected(action),
            completion: actionCondition(action),
        };

        if (previous) {
            group.expectations[group.expectations.indexOf(previous)] = expectation;
        } else {
            group.expectations.push(expectation);
        }
    }

    const used = new Set<string>([finish.id]);

    for (const group of groups) {
        if ('targetId' in group.entry) {
            used.add(group.entry.targetId);
        }

        for (const job of [...group.expectations, ...group.transitions]) {
            if ('targetId' in job.action) {
                used.add(job.action.targetId);
            }

            if ('targetId' in job.completion) {
                used.add(job.completion.targetId);
            }
        }
    }

    const document: GroupedScenario = {
        kind: 'training-scenario',
        version: 4,
        id: `scenario-${recording.id}`,
        mode: recording.mode,
        descriptors: descriptors.filter((target) => used.has(target.id)),
        areas: {
            definitions: recording.areas.definitions,
            targets: [
                ...recording.areas.targets.filter((target) => used.has(target.targetId)),
                {targetId: finish.id, areaKey: finishAreaKey},
            ],
        },
        startGroupId: groups[0]!.id,
        completion: visible(finish.id),
        groups,
    };

    return readScenario(document);
}
