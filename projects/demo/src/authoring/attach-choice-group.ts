/**
 * Привязывает выбранный состав к заданию без DOM-ссылок. Ожидаемые цели текущего экрана не становятся альтернативами.
 * Новые descriptors получают отдельные ID и area bindings. Все альтернативы сначала допустимы; ошибку выбирает автор.
 * Результат проходит wire-валидацию. Исходный сценарий и сохранённая заготовка остаются неизменными.
 */
import {
    type ActionVariant,
    type GroupedScenario,
    parseScenario,
    readScenario,
    serializeScenario,
} from '@training-observer/core';

import {type ElementGroup} from './element-groups';

export function attachChoiceGroup(
    source: GroupedScenario,
    groupId: string,
    jobId: string,
    selection: ElementGroup,
): GroupedScenario {
    const document = parseScenario(serializeScenario(source)) as GroupedScenario;
    const screen = document.groups.find((entry) => entry.id === groupId)!;
    const jobs = [...screen.expectations, ...screen.transitions];
    const job = jobs.find((entry) => entry.id === jobId)!;
    const variants: ActionVariant[] = [];

    for (const target of selection.targets) {
        const matching = document.descriptors.filter(
            (descriptor) =>
                document.areas.targets.some(
                    (binding) =>
                        binding.targetId === descriptor.id &&
                        binding.areaKey === target.areaKey,
                ) &&
                JSON.stringify(descriptor.fingerprint.features) ===
                    JSON.stringify(target.descriptor.fingerprint.features),
        );

        if (
            matching.some((descriptor) =>
                jobs.some(
                    (entry) =>
                        'targetId' in entry.action &&
                        entry.action.targetId === descriptor.id,
                ),
            )
        ) {
            continue;
        }

        const id = `choice-${selection.id}-${target.descriptor.id}`;

        if (!document.descriptors.some((entry) => entry.id === id)) {
            document.descriptors.push({...target.descriptor, id});
            document.areas.targets.push({targetId: id, areaKey: target.areaKey});
        }

        const {role, tag} = target.descriptor.fingerprint.features;
        const checked = ['checkbox', 'radio', 'switch'].includes(role ?? '');
        let kind: 'click' | 'input' | 'select' = 'click';

        if (checked || ['combobox', 'listbox'].includes(role ?? '')) {
            kind = 'select';
        } else if (
            ['slider', 'spinbutton', 'textbox'].includes(role ?? '') ||
            ['input', 'textarea'].includes(tag)
        ) {
            kind = 'input';
        }

        variants.push({
            id,
            outcome: 'allowed',
            action:
                kind === 'click'
                    ? {kind, targetId: id}
                    : {
                          kind,
                          targetId: id,
                          value: {kind: 'raw-equals', value: checked ? true : ''},
                      },
        });
    }

    if (!variants.length) {
        throw new Error(
            'В составе только ожидаемые действия этого экрана. Выберите также альтернативные элементы.',
        );
    }

    if (job.choiceGroups?.some((entry) => entry.id === selection.id)) {
        throw new Error(
            'Эта группа уже привязана. Измените её варианты ниже или удалите привязку перед повторным добавлением.',
        );
    }

    job.choiceGroups = [
        ...(job.choiceGroups ?? []),
        {id: selection.id, title: selection.title, variants},
    ];
    document.version = 5;

    return readScenario(document) as GroupedScenario;
}
