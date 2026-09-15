/** DI-настройки обхода, лимитов и скрытия значений. Применяются до формирования сохраняемого снимка. */
import {InjectionToken} from '@angular/core';

export interface DomSnapshotOptions {
    readonly maxDepth: number;
    readonly maxNodes: number;
    readonly includeText: boolean;
    readonly cursorHeuristics: boolean;
    readonly ignoreSelector: string;
    /** Не обходить вложенные корни, совпавшие с селектором; сам корень capture сохраняется. */
    readonly boundarySelector?: string;
}

export const DOM_SNAPSHOT_OPTIONS = new InjectionToken<DomSnapshotOptions>(
    'DOM_SNAPSHOT_OPTIONS',
    {
        providedIn: 'root',
        factory: () => ({
            maxDepth: 100,
            maxNodes: 10_000,
            includeText: true,
            cursorHeuristics: false,
            ignoreSelector: '[data-training-observer-ignore]',
        }),
    },
);
