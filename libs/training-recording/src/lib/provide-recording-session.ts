import {inject, type Provider} from '@angular/core';
import {
    ObservationConnection,
    type ObservationSessionOptions,
} from '@training-observer/core';

import {RecordingSession} from './recording-session.service';
import {
    RECORDING_CONNECTION,
    RECORDING_SESSION_OPTIONS,
} from './recording-session-tokens';

/** Создаёт запись с отдельным наблюдением в области DI владельца. */
export function provideRecordingSession(
    options: ObservationSessionOptions = {},
): Provider[] {
    return [
        {provide: RECORDING_SESSION_OPTIONS, useValue: options},
        {
            provide: RECORDING_CONNECTION,
            useFactory: () =>
                new ObservationConnection(inject(RECORDING_SESSION_OPTIONS)),
        },
        RecordingSession,
    ];
}
