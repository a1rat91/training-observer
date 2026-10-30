import {InjectionToken} from '@angular/core';
import {
    type ObservationConnection,
    type ObservationSessionOptions,
} from '@training-observer/core';

export const TRAINING_SESSION_OPTIONS = new InjectionToken<ObservationSessionOptions>(
    'TRAINING_SESSION_OPTIONS',
);

export const TRAINING_CONNECTION = new InjectionToken<ObservationConnection>(
    'TRAINING_CONNECTION',
);
