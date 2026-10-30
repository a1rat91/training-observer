import {type ScreenStateOptions} from '@training-observer/core/models';

import {type DomObservationOptions} from '../tokens/dom-observation-options';

/** Область наблюдения и правила экрана для владельца записи или прохождения. */
export interface ObservationSessionOptions {
    /** Явные правила имеют приоритет над зарегистрированными адаптерами экрана. */
    readonly screen?: ScreenStateOptions;
    /** CSS-селектор отслеживает позднее появление и замену корня. По умолчанию document.body. */
    readonly root?: Element | string;
    readonly observation?: Partial<DomObservationOptions>;
}
