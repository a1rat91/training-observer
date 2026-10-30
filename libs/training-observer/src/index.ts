/** Публичный Angular API наблюдения DOM. Запись и проверка ученика находятся в отдельных пакетах. */
export {DomElementAnalyzer} from './lib/capture/dom-element-analyzer';
export {DomSnapshotBuilder} from './lib/capture/dom-snapshot-builder';
export {ControlSnapshotBuilder} from './lib/controls/control-snapshot-builder';
export {DomHighlighter} from './lib/highlight/dom-highlighter';
export {MicrofrontendObserver} from './lib/microfrontend-observer';
export type {ObservationUpdate} from './lib/observation-update';
export {PageObservation} from './lib/page-observation.service';
export {provideDomObservation} from './lib/provide-dom-observation';
export {providePageObservation} from './lib/provide-page-observation';
export {readScreenState} from './lib/screen/screen-state-reader';
export {ScreenVisitTracker} from './lib/screen/screen-visit-tracker';
export {ObservationConnection} from './lib/session/observation-connection';
export type {ObservationSessionOptions} from './lib/session/observation-session-options';
export {readSessionScreen} from './lib/session/read-session-screen';
export {CONTROL_ADAPTERS, provideControlAdapters} from './lib/tokens/control-adapters';
export {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
} from './lib/tokens/dom-observation-options';
export {
    DOM_SNAPSHOT_OPTIONS,
    type DomSnapshotOptions,
} from './lib/tokens/dom-snapshot-options';
export {provideScreenAdapters, SCREEN_ADAPTERS} from './lib/tokens/screen-adapters';
export {type ObservationState, TrainingObserver} from './lib/training-observer';
export type {
    ControlAdapter,
    ControlAdapterContext,
    ControlAdapterResult,
    ControlCandidate,
    ScreenAdapter,
} from '@training-observer/core/adapters';
export {readAdaptedScreen} from '@training-observer/core/adapters';
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
    ScreenElementSelector,
    ScreenIdentitySource,
    ScreenState,
    ScreenStateOptions,
    ScreenVisit,
} from '@training-observer/core/models';
export {
    ControlType,
    ScreenIdentityKind,
    ScreenStatus,
} from '@training-observer/core/models';
