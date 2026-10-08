import {type Provider} from '@angular/core';

import {RecordingSession} from './recording-session.service';
import {
    RECORDING_SESSION_OPTIONS,
    TRAINING_SESSION_OPTIONS,
    type TrainingIntegrationOptions,
} from './training-integration-options';
import {TrainingSession} from './training-session.service';

export function provideRecordingSession(options: TrainingIntegrationOptions): Provider[] {
    return [{provide: RECORDING_SESSION_OPTIONS, useValue: options}, RecordingSession];
}

export function provideTrainingSession(options: TrainingIntegrationOptions): Provider[] {
    return [{provide: TRAINING_SESSION_OPTIONS, useValue: options}, TrainingSession];
}
