import {type Provider} from '@angular/core';
import {provideControlAdapters, provideScreenAdapters} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';
import {
    procedurePlayerAdapter,
    procedurePlayerScreenAdapter,
} from '@training-observer/procedure-player';

import {ProcedurePlayerObserver} from './procedure-player-observer.service';

/** Регистрирует правила procedure-player и его компонентов, независимо от Taiga UI. */
export function provideProcedurePlayerAdapter(
    ...components: readonly ControlAdapter[]
): Provider[] {
    return [
        ...provideScreenAdapters(procedurePlayerScreenAdapter),
        ...provideControlAdapters(procedurePlayerAdapter, ...components),
        ProcedurePlayerObserver,
    ];
}
