import {type Provider} from '@angular/core';
import {
    provideControlAdapters,
    providePageObservation,
    provideScreenAdapters,
} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';

import {procedurePlayerAdapter} from './procedure-player-adapter';
import {ProcedurePlayerObserver} from './procedure-player-observer.service';
import {procedurePlayerScreenAdapter} from './procedure-player-screen-adapter';

/** Регистрирует правила и локального владельца наблюдения procedure-player. */
export function provideProcedurePlayerAdapter(
    ...components: readonly ControlAdapter[]
): Provider[] {
    return [
        ...provideScreenAdapters(procedurePlayerScreenAdapter),
        ...provideControlAdapters(procedurePlayerAdapter, ...components),
        ...providePageObservation(),
        ProcedurePlayerObserver,
    ];
}
