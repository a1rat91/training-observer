/** DI-настройки частоты наблюдения. Валидируются перед стартом сеанса; наследуют правила capture без привязки к приложению. */
import {inject, InjectionToken} from '@angular/core';

import {DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions} from './dom-snapshot-options';

export interface DomObservationOptions extends DomSnapshotOptions {
    /** Фиксированное окно объединения, не trailing debounce. Непрерывный ввод не откладывает capture бесконечно. */
    readonly batchDelayMs: number;
    /** Сверка native-свойств. Значение 0 отключает polling. */
    readonly propertyCheckIntervalMs: number;
}

export function validateObservationTiming(options: DomObservationOptions): void {
    for (const name of ['batchDelayMs', 'propertyCheckIntervalMs'] as const) {
        if (
            !Number.isInteger(options[name]) ||
            options[name] < 0 ||
            options[name] > 2_147_483_647
        ) {
            throw new Error(`${name} must be a non-negative integer up to 2147483647.`);
        }
    }
}

export const DOM_OBSERVATION_OPTIONS = new InjectionToken<DomObservationOptions>(
    'DOM_OBSERVATION_OPTIONS',
    {
        providedIn: 'root',
        factory: () => ({
            ...inject(DOM_SNAPSHOT_OPTIONS),
            batchDelayMs: 50,
            propertyCheckIntervalMs: 500,
        }),
    },
);
