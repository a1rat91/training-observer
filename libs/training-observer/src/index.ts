/** Публичный Angular API наблюдения DOM. Запись и проверка ученика находятся в отдельных пакетах. */
export { DomHighlighter } from './lib/highlight/dom-highlighter';
export { TrainingObserver } from './lib/training-observer';
export { MicrofrontendObserver } from './lib/microfrontend-observer';
export type { MicrofrontendSnapshot } from '@training-observer/core/models';
export { DomSnapshotBuilder } from './lib/capture/dom-snapshot-builder';
export { ControlSnapshotBuilder } from './lib/controls/control-snapshot-builder';
export type {
    ControlSnapshot,
    ControlKind,
    ControlLocatorHints,
    ChoiceSnapshot,
    PopupSnapshot,
} from '@training-observer/core/models';
export { DomElementAnalyzer } from './lib/capture/dom-element-analyzer';
export { DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions } from './lib/tokens/dom-snapshot-options';
export { DOM_OBSERVATION_OPTIONS, type DomObservationOptions } from './lib/tokens/dom-observation-options';
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
export { readScreenState } from './lib/screen/screen-state-reader';
export { ScreenVisitTracker } from './lib/screen/screen-visit-tracker';
export type { ScreenState, ScreenStateOptions, ScreenVisit } from '@training-observer/core/models';
export { ControlType, ScreenStatus } from '@training-observer/core/models';
