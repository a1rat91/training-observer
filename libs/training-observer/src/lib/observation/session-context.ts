/** Параметры одного сеанса. DI передаёт конфигурацию, а не функции владельца или состояние обучения. */
import {InjectionToken} from '@angular/core';

import {type DomObservationOptions} from '../tokens/dom-observation-options';

declare const ngDevMode: boolean;

export enum SessionSourceMode {
    Standalone = 'standalone',
    Shared = 'shared',
}

export interface SessionContext {
    readonly root: Element;
    readonly options: DomObservationOptions;
    readonly mode: SessionSourceMode;
}

export const SESSION_CONTEXT = new InjectionToken<SessionContext>(
    ngDevMode ? '[SESSION_CONTEXT]: DOM observation session' : '',
);
