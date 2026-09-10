import {inject, InjectionToken} from '@angular/core';

import {DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions} from './dom-snapshot-options';

export interface DomObservationOptions extends DomSnapshotOptions {
    /** Fixed batching window, not a trailing debounce. Continuous input cannot postpone a scan forever. */
    readonly batchDelayMs: number;
    /** Native property reconciliation. Set to 0 to disable polling. */
    readonly propertyCheckIntervalMs: number;
}

export function validateObservationTiming(options: DomObservationOptions): void {
    for (const name of ['batchDelayMs', 'propertyCheckIntervalMs'] as const) {
        if (!Number.isInteger(options[name]) || options[name] < 0 || options[name] > 2_147_483_647) {
            throw new Error(`${name} must be a non-negative integer up to 2147483647.`);
        }
    }
}

export const DOM_OBSERVATION_OPTIONS = new InjectionToken<DomObservationOptions>('DOM_OBSERVATION_OPTIONS', {
    providedIn: 'root',
    factory: () => ({
        ...inject(DOM_SNAPSHOT_OPTIONS),
        batchDelayMs: 50,
        propertyCheckIntervalMs: 500,
    }),
});
