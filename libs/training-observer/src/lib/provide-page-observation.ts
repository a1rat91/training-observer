import {type Provider} from '@angular/core';

import {PageObservation} from './page-observation.service';
import {
    inheritObservationOptions,
    provideDomObservation,
} from './provide-dom-observation';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
} from './tokens/dom-observation-options';

/** Настройки владельца наследуются; явные overrides применяются только к этой области DI. */
export function providePageObservation(
    options: Partial<DomObservationOptions> = {},
): Provider[] {
    return [
        provideDomObservation(),
        {
            provide: DOM_OBSERVATION_OPTIONS,
            useFactory: () => ({...inheritObservationOptions(), ...options}),
        },
        PageObservation,
    ];
}
