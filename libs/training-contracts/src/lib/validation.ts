/** Общие проверки JSON-границы. Принимают unknown, ничего не преобразуют и не исполняют. */
import {
    type ControlKind,
    type ControlLocatorHints,
    ControlType,
} from '@training-observer/core/models';

import {type RecordedValue} from './control-value';

export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function hasOnlyKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
): boolean {
    return Object.keys(value).every((key) => keys.includes(key));
}
export function isControlValue(
    value: unknown,
    kind: ControlKind,
): value is RecordedValue {
    switch (kind) {
        case ControlType.Checkbox:
        case ControlType.Radio:
        case ControlType.Switch:
            return typeof value === 'boolean';
        case ControlType.ComboBox:
        case ControlType.Select:
            return (
                Array.isArray(value) &&
                value.every((item) => typeof item === 'string') &&
                (kind !== ControlType.ComboBox ||
                    !value.length ||
                    (value.length === 1 && value[0] !== ''))
            );
        case ControlType.Number:
        case ControlType.Textbox:
            return typeof value === 'string';
        default:
            return false;
    }
}
export function isControlDescriptor(value: unknown): value is ControlLocatorHints {
    return !isObject(value) ||
        !hasOnlyKeys(value, [
            'kind',
            'label',
            'tagName',
            'role',
            'inputType',
            'id',
            'name',
            'testId',
            'placeholder',
            'context',
        ]) ||
        !Object.values(ControlType).some((kind) => kind === value['kind']) ||
        !['label', 'tagName', 'role'].every((key) => typeof value[key] === 'string') ||
        !['inputType', 'id', 'name', 'testId', 'placeholder'].every(
            (key) => value[key] === undefined || typeof value[key] === 'string',
        )
        ? false
        : Array.isArray(value['context']) &&
              value['context'].every(
                  (item) =>
                      isObject(item) &&
                      hasOnlyKeys(item, ['tagName', 'label', 'id']) &&
                      typeof item['tagName'] === 'string' &&
                      typeof item['label'] === 'string' &&
                      (item['id'] === undefined || typeof item['id'] === 'string'),
              );
}
