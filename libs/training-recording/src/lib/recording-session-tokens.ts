import {InjectionToken} from '@angular/core';
import {
    type ObservationConnection,
    type ObservationSessionOptions,
} from '@training-observer/core';

export const RECORDING_SESSION_OPTIONS = new InjectionToken<ObservationSessionOptions>(
    'RECORDING_SESSION_OPTIONS',
);

export const RECORDING_CONNECTION = new InjectionToken<ObservationConnection>(
    'RECORDING_CONNECTION',
);
