import {type ControlSnapshot, type DomSnapshot} from '@training-observer/core/models';

/** Один синхронно подготовленный результат наблюдения, включая подтверждения blur. */
export interface ObservationUpdate {
    readonly snapshot: DomSnapshot | null;
    readonly controls: readonly ControlSnapshot[];
    readonly confirmedControls: Readonly<Record<string, ControlSnapshot>>;
}
