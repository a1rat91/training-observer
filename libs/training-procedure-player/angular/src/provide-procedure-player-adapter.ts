import {provideControlAdapters} from '@training-observer/core';
import {procedurePlayerAdapter} from '@training-observer/procedure-player';

/** Registers the procedure-player DOM rules in the current Angular injector scope. */
export function provideProcedurePlayerAdapter(): ReturnType<
    typeof provideControlAdapters
> {
    return provideControlAdapters(procedurePlayerAdapter);
}
