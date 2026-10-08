import {InjectionToken} from '@angular/core';
import {type DomObservationOptions} from '@training-observer/core';
import {type ScreenStateOptions} from '@training-observer/core/models';

/** Правила предметной области; запуск, доставка обновлений и очистка принадлежат библиотеке. */
export interface TrainingIntegrationOptions {
    readonly screen: ScreenStateOptions;
    /** CSS-селектор отслеживает позднее появление и замену корня. По умолчанию document.body. */
    readonly root?: Element | string;
    readonly observation?: Partial<DomObservationOptions>;
}

export const RECORDING_SESSION_OPTIONS = new InjectionToken<TrainingIntegrationOptions>(
    'RECORDING_SESSION_OPTIONS',
);

export const TRAINING_SESSION_OPTIONS = new InjectionToken<TrainingIntegrationOptions>(
    'TRAINING_SESSION_OPTIONS',
);
