import {inject, type Provider} from '@angular/core';
import {
    ObservationConnection,
    type ObservationSessionOptions,
} from '@training-observer/core';

import {TrainingSession} from './training-session.service';
import {TRAINING_CONNECTION, TRAINING_SESSION_OPTIONS} from './training-session-tokens';

/** Создаёт прохождение с отдельным наблюдением в области DI владельца. */
export function provideTrainingSession(
    options: ObservationSessionOptions = {},
): Provider[] {
    return [
        {provide: TRAINING_SESSION_OPTIONS, useValue: options},
        {
            provide: TRAINING_CONNECTION,
            useFactory: () => new ObservationConnection(inject(TRAINING_SESSION_OPTIONS)),
        },
        TrainingSession,
    ];
}
