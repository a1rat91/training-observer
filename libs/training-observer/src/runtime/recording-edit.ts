/**
 * Редактирование записи без DOM и UI. Удаление создаёт проверенную копию, сохраняя ID и sequence остальных действий.
 * Пересборка сравнивает исходный черновик, авторскую версию и новый черновик по ID и полям.
 * Независимые правки объединяются; одновременное изменение одного поля требует решения автора.
 * Итог снова проходит строгую проверку контракта, включая зависимости и ссылки между группами.
 */
import {
    parseScenario,
    readRecording,
    readScenario,
    type Recording,
    type Scenario,
    serializeScenario,
} from '../contracts';

export function removeRecordedAction(recording: Recording, actionId: string): Recording {
    const copy = readRecording(recording);

    if (!copy.actions.some((action) => action.id === actionId)) {
        throw new Error('Действие уже отсутствует в записи.');
    }

    return readRecording({
        ...copy,
        actions: copy.actions.filter((action) => action.id !== actionId),
    });
}

export interface DraftMerge {
    baseline: Scenario;
    scenario: Scenario | null;
    conflicts: string[];
}

/** preferRecording применяется только после явного выбора автора и только к конфликтующим полям. */
export function mergeScenarioDraft(
    original: Scenario,
    authored: Scenario,
    generated: Scenario,
    preferRecording = false,
): DraftMerge {
    const base = parseScenario(serializeScenario(original));
    const edited = parseScenario(serializeScenario(authored));
    const next = parseScenario(serializeScenario(generated));

    // v5 добавляет только авторские реакции; выравниваем групповые версии перед трёхсторонним merge.
    if (
        'groups' in base &&
        'groups' in edited &&
        'groups' in next &&
        [base.version, edited.version, next.version].includes(5)
    ) {
        base.version = 5;
        edited.version = 5;
        next.version = 5;
    }

    if (base.version !== edited.version || base.version !== next.version) {
        throw new Error('Нельзя объединить разные версии сценария.');
    }

    // У свернутого ввода ID берётся от первого события. После его удаления сохраняем ID ожидания.
    if ('groups' in base && 'groups' in next) {
        // Порядковые group-N сдвигаются после удаления границы. ID переносится по входящему переходу.
        const incoming = (document: typeof base, id: string): string[] =>
            document.groups
                .flatMap((group) =>
                    group.transitions
                        .filter((edge) => edge.toGroupId === id)
                        .map((edge) => edge.id),
                )
                .sort();

        const aliases = new Map<string, string>();
        const reserved = new Set(
            [...base.groups, ...next.groups].map((group) => group.id),
        );

        for (const group of next.groups) {
            const candidates = base.groups.filter((previous) =>
                group.id === next.startGroupId
                    ? previous.id === base.startGroupId
                    : previous.id !== base.startGroupId &&
                      same(incoming(base, previous.id), incoming(next, group.id)),
            );

            let id = candidates.length === 1 ? candidates[0]!.id : `new-${group.id}`;

            // Автоматический порядковый заголовок не является новой авторской правкой при сдвиге группы.
            if (
                candidates.length === 1 &&
                group.title === `Группа ${next.groups.indexOf(group) + 1}`
            ) {
                group.title = candidates[0]!.title;
            }

            if (candidates.length !== 1) {
                while (reserved.has(id)) {
                    id = `new-${id}`;
                }
            }

            reserved.add(id);
            aliases.set(group.id, id);
        }

        next.startGroupId = aliases.get(next.startGroupId)!;

        for (const group of next.groups) {
            group.id = aliases.get(group.id)!;

            for (const edge of group.transitions) {
                if (edge.toGroupId !== null) {
                    edge.toGroupId = aliases.get(edge.toGroupId)!;
                }
            }
        }

        for (const group of next.groups) {
            const previous = base.groups.find((entry) => entry.id === group.id);

            if (
                !previous ||
                !same(
                    previous.transitions.map((entry) => entry.id),
                    group.transitions.map((entry) => entry.id),
                )
            ) {
                continue;
            }

            for (const job of group.expectations) {
                if (
                    !('value' in job.action) ||
                    previous.expectations.some((entry) => entry.id === job.id)
                ) {
                    continue;
                }

                const action = job.action;
                const matches = previous.expectations.filter(
                    (entry) =>
                        entry.action.kind === action.kind &&
                        'targetId' in entry.action &&
                        entry.action.targetId === action.targetId,
                );

                const match = matches.length === 1 ? matches[0] : undefined;

                if (match && !group.expectations.some((entry) => entry.id === match.id)) {
                    job.id = match.id;
                }
            }
        }
    }

    const conflicts: string[] = [];
    const merge = (
        before: unknown,
        current: unknown,
        after: unknown,
        path: string,
    ): unknown => {
        if (same(current, before)) {
            return after;
        }

        if (same(after, before) || same(current, after)) {
            return current;
        }

        if (
            path === '$.areas.targets' &&
            Array.isArray(before) &&
            Array.isArray(current) &&
            Array.isArray(after)
        ) {
            const identify = (
                entries: Array<{targetId: string; areaKey: string}>,
            ): Array<{id: string; areaKey: string}> =>
                entries.map((entry) => ({id: entry.targetId, areaKey: entry.areaKey}));

            const bindings = merge(
                identify(before),
                identify(current),
                identify(after),
                '$.areaBindings',
            ) as Array<{id: string; areaKey: string}>;

            return bindings.map((entry) => ({
                targetId: entry.id,
                areaKey: entry.areaKey,
            }));
        }

        if (keyed(before) && keyed(current) && keyed(after)) {
            const ids = new Set([...after, ...current].map((entry) => entry.id));

            return [...ids].flatMap((id) => {
                const value = merge(
                    before.find((entry) => entry.id === id),
                    current.find((entry) => entry.id === id),
                    after.find((entry) => entry.id === id),
                    `${path}[${id}]`,
                );

                return value === undefined ? [] : [value];
            });
        }

        if (object(before) && object(current) && object(after)) {
            return Object.fromEntries(
                [
                    ...new Set([
                        ...Object.keys(before),
                        ...Object.keys(current),
                        ...Object.keys(after),
                    ]),
                ].flatMap((key) => {
                    const value = merge(
                        before[key],
                        current[key],
                        after[key],
                        `${path}.${key}`,
                    );

                    return value === undefined ? [] : [[key, value]];
                }),
            );
        }

        conflicts.push(path);

        return preferRecording ? after : current;
    };

    const result = merge(base, edited, next, '$');

    return {
        baseline: readScenario(next),
        conflicts,
        scenario: conflicts.length && !preferRecording ? null : readScenario(result),
    };
}

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyed(value: unknown): value is Array<Record<string, unknown> & {id: string}> {
    return (
        Array.isArray(value) &&
        value.every((entry) => object(entry) && typeof entry['id'] === 'string')
    );
}

function same(left: unknown, right: unknown): boolean {
    if (object(left) && object(right)) {
        const keys = Object.keys(left);

        return (
            keys.length === Object.keys(right).length &&
            keys.every(
                (key) =>
                    Object.prototype.hasOwnProperty.call(right, key) &&
                    same(left[key], right[key]),
            )
        );
    }

    return Array.isArray(left) && Array.isArray(right)
        ? left.length === right.length &&
              left.every((entry, index) => same(entry, right[index]))
        : left === right;
}
