import {type Provider} from '@angular/core';

import {PageObservation} from './page-observation.service';
import {provideDomObservation} from './provide-dom-observation';

/** Один контекст страницы на владельца providers; уничтожается вместе с владельцем. */
export function providePageObservation(): Provider[] {
    return [provideDomObservation(), PageObservation];
}
