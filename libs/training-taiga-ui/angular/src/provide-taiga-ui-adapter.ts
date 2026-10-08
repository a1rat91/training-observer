import {provideControlAdapters} from '@training-observer/core';
import {taigaUiAdapter} from '@training-observer/taiga-ui';

/** Registers the Taiga UI DOM rules in the current Angular injector scope. */
export function provideTaigaUiAdapter(): ReturnType<typeof provideControlAdapters> {
    return provideControlAdapters(taigaUiAdapter);
}
