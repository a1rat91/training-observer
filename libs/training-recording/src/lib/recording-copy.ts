/** Копии документов записи: сохраняют необязательные свойства и отделяют массивы значений и контекста от источника. */
import {
    type RecordedEvent,
    type RecordedValue,
    type StateRecording,
} from '@training-observer/contracts';
import {type ControlLocatorHints} from '@training-observer/core/models';

export function copyControlLocatorHints(hints: ControlLocatorHints): ControlLocatorHints {
    return {...hints, context: hints.context.map((context) => ({...context}))};
}

export function copyRecordedValue(value: RecordedValue): RecordedValue {
    return typeof value === 'object' ? [...value] : value;
}

function copyRecordedEvent(event: RecordedEvent): RecordedEvent {
    return {
        ...event,
        ...(event.field === undefined
            ? {}
            : {field: copyControlLocatorHints(event.field)}),
        ...(event.value === undefined ? {} : {value: copyRecordedValue(event.value)}),
    };
}

export function copyStateRecording(recording: StateRecording): StateRecording {
    return {...recording, events: recording.events.map(copyRecordedEvent)};
}
