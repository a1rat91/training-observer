import {inject, InjectionToken, type Provider} from '@angular/core';
import {
    resolveScreenAdapters,
    type ScreenAdapter,
} from '@training-observer/core/adapters';

const LOCAL_SCREEN_ADAPTERS = new InjectionToken<readonly ScreenAdapter[][]>(
    'LOCAL_SCREEN_ADAPTERS',
);

export const SCREEN_ADAPTERS = new InjectionToken<readonly ScreenAdapter[]>(
    'SCREEN_ADAPTERS',
    {providedIn: 'root', factory: () => []},
);

/** Inherits parent adapters; repeat registration of the same instance is harmless. */
export function provideScreenAdapters(...adapters: readonly ScreenAdapter[]): Provider[] {
    const local = resolveScreenAdapters(adapters);

    return [
        {provide: LOCAL_SCREEN_ADAPTERS, multi: true, useValue: local},
        {provide: SCREEN_ADAPTERS, useFactory: inheritedScreenAdapters},
    ];
}

function inheritedScreenAdapters(): readonly ScreenAdapter[] {
    const inherited = inject(SCREEN_ADAPTERS, {skipSelf: true, optional: true}) ?? [];
    const local = inject(LOCAL_SCREEN_ADAPTERS, {self: true});

    return resolveScreenAdapters([...inherited, ...local.flat()]);
}
