/** Локальная область Angular DI для наблюдения.
 * Один вызов в providers компонента подключает фасады и владельца изолированных browser-сеансов.
 * Сервисы подсветки подключаются отдельно, если они нужны интерфейсу.
 */
import {type Provider} from '@angular/core';

import {MicrofrontendObserver} from './microfrontend-observer';
import {ObservationSessionFactory} from './observation/observation-session-factory';
import {TrainingObserver} from './training-observer';

export function provideDomObservation(): Provider[] {
    return [TrainingObserver, MicrofrontendObserver, ObservationSessionFactory];
}
