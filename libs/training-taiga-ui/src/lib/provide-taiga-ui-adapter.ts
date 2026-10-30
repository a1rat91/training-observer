import {provideControlAdapters} from '@training-observer/core';

import {taigaUiAdapter} from './taiga-ui-adapter';

/** Registers the Taiga UI DOM rules in the current Angular injector scope. */
export function provideTaigaUiAdapter(): ReturnType<typeof provideControlAdapters> {
    return provideControlAdapters(taigaUiAdapter);
}
