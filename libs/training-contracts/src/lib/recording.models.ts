/** Документ записи: последовательность посещений и значений. Не содержит DOM-ссылок или Angular-зависимостей. */
import {type ControlLocatorHints} from '@training-observer/core/models';

import {type RecordedValue} from './control-value';
import {type RecordingEventKind} from './training-enums';

export type {RecordedValue} from './control-value';
export interface RecordedEvent {
    readonly sequence: number;
    readonly visit: number;
    readonly screenKey: string;
    readonly kind: `${RecordingEventKind}`;
    readonly field?: ControlLocatorHints;
    readonly value?: RecordedValue;
    readonly reason?: string;
}
export interface StateRecording {
    readonly kind: 'training-state-recording';
    readonly version: 1;
    readonly complete: boolean;
    readonly events: readonly RecordedEvent[];
}
