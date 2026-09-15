/** Публичный Angular API наблюдения DOM. Запись и проверка ученика находятся в отдельных пакетах. */
export {DomElementAnalyzer} from './lib/capture/dom-element-analyzer';
export {DomSnapshotBuilder} from './lib/capture/dom-snapshot-builder';
export {ControlSnapshotBuilder} from './lib/controls/control-snapshot-builder';
export {DomHighlighter} from './lib/highlight/dom-highlighter';
export {MicrofrontendObserver} from './lib/microfrontend-observer';
export {readScreenState} from './lib/screen/screen-state-reader';
export {ScreenVisitTracker} from './lib/screen/screen-visit-tracker';
export {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
} from './lib/tokens/dom-observation-options';
export {
    DOM_SNAPSHOT_OPTIONS,
    type DomSnapshotOptions,
} from './lib/tokens/dom-snapshot-options';
export {TrainingObserver} from './lib/training-observer';
export type {MicrofrontendSnapshot} from '@training-observer/core/models';
export type {
    ChoiceSnapshot,
    ControlKind,
    ControlLocatorHints,
    ControlSnapshot,
    PopupSnapshot,
} from '@training-observer/core/models';
export type {
    DomControlState,
    DomElementSnapshot,
    DomNodeId,
    DomNodeSnapshot,
    DomRectSnapshot,
    DomSnapshot,
    DomTextSnapshot,
    HitTestResult,
    InteractionReason,
} from '@training-observer/core/models';
export type {
    ScreenState,
    ScreenStateOptions,
    ScreenVisit,
} from '@training-observer/core/models';
export {ControlType, ScreenStatus} from '@training-observer/core/models';
