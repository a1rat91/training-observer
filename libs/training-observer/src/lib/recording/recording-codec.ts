/** Validates stored recording data before it reaches an editor. DOM graphs and executable content
 * are not part of this format. Unknown versions and malformed events are rejected, never migrated implicitly.
 */
import type {StateRecording} from './state-recorder';

export function parseStateRecording(json: string): StateRecording {
    if (json.length > 1_000_000) throw new Error('Запись слишком большая.');
    const data: unknown = JSON.parse(json);
    const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
    const strings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');
    const allowed = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
    const hint = (value: unknown): boolean => object(value) &&
        allowed(value, ['kind', 'label', 'tagName', 'role', 'inputType', 'id', 'name', 'testId', 'placeholder', 'context']) &&
        ['textbox', 'number', 'select', 'combobox', 'checkbox', 'radio', 'switch', 'button'].includes(String(value['kind'])) &&
        ['label', 'tagName', 'role'].every((key) => typeof value[key] === 'string') &&
        ['inputType', 'id', 'name', 'testId', 'placeholder'].every((key) => value[key] === undefined || typeof value[key] === 'string') &&
        Array.isArray(value['context']) && value['context'].every((item: unknown) => object(item) &&
            allowed(item, ['tagName', 'label', 'id']) && typeof item['tagName'] === 'string' && typeof item['label'] === 'string' &&
            (item['id'] === undefined || typeof item['id'] === 'string'));
    if (!object(data) || !allowed(data, ['kind', 'version', 'complete', 'events']) || data['kind'] !== 'training-state-recording' ||
        data['version'] !== 1 || typeof data['complete'] !== 'boolean' || !Array.isArray(data['events']) || data['events'].length > 10000) {
        throw new Error('Неизвестный или повреждённый формат записи.');
    }
    for (const [index, event] of data['events'].entries()) {
        if (!object(event) || !allowed(event, ['sequence', 'visit', 'screenKey', 'kind', 'field', 'value', 'reason']) ||
            event['sequence'] !== index + 1 || !Number.isInteger(event['visit']) || Number(event['visit']) < 1 ||
            typeof event['screenKey'] !== 'string' || !event['screenKey'] ||
            !['screen', 'value', 'unavailable'].includes(String(event['kind'])) ||
            (event['field'] !== undefined && !hint(event['field'])) ||
            (event['reason'] !== undefined && typeof event['reason'] !== 'string') ||
            (event['kind'] === 'value' && (!hint(event['field']) ||
                !(typeof event['value'] === 'string' || typeof event['value'] === 'boolean' || strings(event['value'])))) ||
            (event['kind'] !== 'value' && event['value'] !== undefined) ||
            (event['kind'] === 'screen' && (event['field'] !== undefined || event['reason'] !== undefined)) ||
            (event['kind'] === 'unavailable' && (typeof event['reason'] !== 'string' || data['complete']))) {
            throw new Error(`Некорректная строка записи: ${index + 1}.`);
        }
    }
    return data as unknown as StateRecording;
}
