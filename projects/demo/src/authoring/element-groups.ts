/** Авторские заготовки групп: отдельный версионированный документ, без DOM-ссылок и правил runtime. */
import {type ElementDescriptor, readElementDescriptor} from '@training-observer/core';

export interface ElementGroup {
    id: string;
    title: string;
    targets: Array<{areaKey: string; descriptor: ElementDescriptor}>;
}

export const ELEMENT_GROUPS_KEY = 'training-authoring-element-groups-v1';

export function serializeElementGroups(groups: readonly ElementGroup[]): string {
    const source = JSON.stringify({kind: 'training-element-groups', version: 1, groups});

    parseElementGroups(source);

    return source;
}

export function parseElementGroups(source: string): ElementGroup[] {
    const document: unknown = JSON.parse(source);
    const object = (value: unknown, keys: string[]): value is Record<string, unknown> =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length === keys.length &&
        keys.every((key) => key in value);

    const text = (value: unknown): value is string =>
        typeof value === 'string' && value.trim().length > 0;

    if (
        !object(document, ['kind', 'version', 'groups']) ||
        document['kind'] !== 'training-element-groups' ||
        document['version'] !== 1 ||
        !Array.isArray(document['groups'])
    ) {
        throw new Error('Неподдержанный документ групп вариантов.');
    }

    const ids = new Set<string>();

    return document['groups'].map((entry: unknown) => {
        if (
            !object(entry, ['id', 'title', 'targets']) ||
            !text(entry['id']) ||
            !text(entry['title']) ||
            !Array.isArray(entry['targets']) ||
            !entry['targets'].length ||
            ids.has(entry['id'])
        ) {
            throw new Error('Проверьте название, ID и состав группы.');
        }

        ids.add(entry['id']);
        const targetIds = new Set<string>();
        const targets = entry['targets'].map((value: unknown) => {
            if (!object(value, ['areaKey', 'descriptor']) || !text(value['areaKey'])) {
                throw new Error('Не указана область элемента.');
            }

            const descriptor = readElementDescriptor(value['descriptor']);

            if (targetIds.has(descriptor.id)) {
                throw new Error('Повторный элемент группы.');
            }

            targetIds.add(descriptor.id);

            return {areaKey: value['areaKey'], descriptor};
        });

        return {id: entry['id'], title: entry['title'], targets};
    });
}
