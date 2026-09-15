/** Проверка записи на границе хранения. Неизвестные поля/версии отклоняются, JSON v1 не мигрируется неявно. */
import {type RecordedEvent, type StateRecording} from './recording.models';
import {RecordingEventKind} from './training-enums';
import {hasOnlyKeys, isControlDescriptor, isObject, isRecordedValue} from './validation';

const MAX_DOCUMENT_LENGTH = 1_000_000;
const MAX_EVENTS = 10_000;

export function parseStateRecording(json: string): StateRecording {
    if (json.length > MAX_DOCUMENT_LENGTH) {
        throw new Error('Запись слишком большая.');
    }

    const data: unknown = JSON.parse(json);

    if (
        !isObject(data) ||
        !hasOnlyKeys(data, ['kind', 'version', 'complete', 'events']) ||
        data['kind'] !== 'training-state-recording' ||
        data['version'] !== 1 ||
        typeof data['complete'] !== 'boolean' ||
        !Array.isArray(data['events']) ||
        data['events'].length > MAX_EVENTS
    ) {
        throw new Error('Неизвестный или повреждённый формат записи.');
    }

    const events = data['events'].map((event, index) => {
        if (!isRecordedEvent(event, index + 1, data['complete'] === true)) {
            throw new Error(`Некорректная строка записи: ${index + 1}.`);
        }

        return event;
    });

    return {
        kind: 'training-state-recording',
        version: 1,
        complete: data['complete'],
        events,
    };
}

function isRecordedEvent(
    event: unknown,
    sequence: number,
    complete: boolean,
): event is RecordedEvent {
    if (
        !isObject(event) ||
        !hasOnlyKeys(event, [
            'sequence',
            'visit',
            'screenKey',
            'kind',
            'field',
            'value',
            'reason',
        ]) ||
        event['sequence'] !== sequence ||
        !Number.isInteger(event['visit']) ||
        Number(event['visit']) < 1 ||
        typeof event['screenKey'] !== 'string' ||
        !event['screenKey'] ||
        (event['field'] !== undefined && !isControlDescriptor(event['field'])) ||
        (event['reason'] !== undefined && typeof event['reason'] !== 'string')
    ) {
        return false;
    }

    switch (event['kind']) {
        case RecordingEventKind.Screen:
            return (
                event['field'] === undefined &&
                event['value'] === undefined &&
                event['reason'] === undefined
            );
        case RecordingEventKind.Unavailable:
            return (
                !complete &&
                event['value'] === undefined &&
                typeof event['reason'] === 'string'
            );
        case RecordingEventKind.Value:
            return isControlDescriptor(event['field']) && isRecordedValue(event['value']);
        default:
            return false;
    }
}
