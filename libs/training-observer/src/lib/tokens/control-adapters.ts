import {inject, InjectionToken, type Provider} from '@angular/core';
import {
    type ControlAdapter,
    resolveControlAdapters,
} from '@training-observer/core/adapters';

const LOCAL_CONTROL_ADAPTERS = new InjectionToken<readonly ControlAdapter[][]>(
    'LOCAL_CONTROL_ADAPTERS',
);

export const CONTROL_ADAPTERS = new InjectionToken<readonly ControlAdapter[]>(
    'CONTROL_ADAPTERS',
    {providedIn: 'root', factory: () => []},
);

/** Derived once per observation owner; all capture/lifecycle paths share it. */
export function controlAdapterExclusions(): readonly string[] {
    return [
        ...new Set(
            resolveControlAdapters(inject(CONTROL_ADAPTERS)).flatMap(
                (adapter) => adapter.excludedSubtreeSelectors ?? [],
            ),
        ),
    ];
}

export const CONTROL_ADAPTER_EXCLUSIONS = new InjectionToken<readonly string[]>(
    'CONTROL_ADAPTER_EXCLUSIONS',
    {providedIn: 'root', factory: controlAdapterExclusions},
);

/** Inherits parent adapters; repeat registration of the same instance is harmless. */
export function provideControlAdapters(
    ...adapters: readonly ControlAdapter[]
): Provider[] {
    // Report invalid registrations at configuration time, before a session starts.
    const local = resolveControlAdapters(adapters);

    return [
        {provide: LOCAL_CONTROL_ADAPTERS, multi: true, useValue: local},
        {provide: CONTROL_ADAPTERS, useFactory: inheritedControlAdapters},
    ];
}

function inheritedControlAdapters(): readonly ControlAdapter[] {
    const inherited = inject(CONTROL_ADAPTERS, {skipSelf: true, optional: true}) ?? [];
    const local = inject(LOCAL_CONTROL_ADAPTERS, {self: true});

    return resolveControlAdapters([...inherited, ...local.flat()]);
}
