/** Локальная область Angular DI для наблюдения.
 * Один вызов в providers компонента подключает фасады и владельца изолированных browser-сеансов.
 * Capture и подсветка используют DOCUMENT и настройки владельца.
 */
import {inject, type Provider} from '@angular/core';

import {DomSnapshotBuilder} from './capture/dom-snapshot-builder';
import {DomHighlighter} from './highlight/dom-highlighter';
import {MicrofrontendObserver} from './microfrontend-observer';
import {ObservationSessionFactory} from './observation/observation-session-factory';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
} from './tokens/dom-observation-options';
import {DOM_OBSERVATION_SNAPSHOT_BASELINE} from './tokens/dom-observation-snapshot-baseline';
import {DOM_SNAPSHOT_OPTIONS} from './tokens/dom-snapshot-options';
import {TrainingObserver} from './training-observer';

export function provideDomObservation(): Provider[] {
    return [
        DomSnapshotBuilder,
        DomHighlighter,
        {
            provide: DOM_OBSERVATION_SNAPSHOT_BASELINE,
            useFactory: () => inject(DOM_SNAPSHOT_OPTIONS),
        },
        {provide: DOM_OBSERVATION_OPTIONS, useFactory: observationOptions},
        TrainingObserver,
        MicrofrontendObserver,
        ObservationSessionFactory,
    ];
}

function observationOptions(): DomObservationOptions {
    const snapshot = inject(DOM_SNAPSHOT_OPTIONS);
    const inheritedSnapshot =
        inject(DOM_OBSERVATION_SNAPSHOT_BASELINE, {
            skipSelf: true,
            optional: true,
        }) ?? snapshot;

    const inherited = inject(DOM_OBSERVATION_OPTIONS, {skipSelf: true, optional: true});
    const defaults = inherited ?? {
        ...snapshot,
        batchDelayMs: 50,
        propertyCheckIntervalMs: 500,
    };

    // Наследуем observation overrides, пока владелец не заменил настройки capture.
    return snapshot === inheritedSnapshot ? defaults : {...defaults, ...snapshot};
}
