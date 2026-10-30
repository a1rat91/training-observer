import {inject, InjectionToken} from '@angular/core';
import {readAdaptedScreen} from '@training-observer/core/adapters';
import {
    type ControlSnapshot,
    type DomSnapshot,
    type ScreenState,
} from '@training-observer/core/models';

import {SCREEN_ADAPTERS} from '../tokens/screen-adapters';

export type ConfirmationContextReader = (
    snapshot: DomSnapshot,
    controls: readonly ControlSnapshot[],
) => string | null;

/** Opaque screen ownership; capture never interprets application-specific markers. */
export const BLUR_CONFIRMATION_CONTEXT = new InjectionToken<ConfirmationContextReader>(
    'BLUR_CONFIRMATION_CONTEXT',
    {providedIn: 'root', factory: adaptedConfirmationContext},
);

export function adaptedConfirmationContext(): ConfirmationContextReader {
    const adapters = inject(SCREEN_ADAPTERS);

    return (snapshot, controls) =>
        screenConfirmationContext(readAdaptedScreen(snapshot, controls, adapters));
}

export function screenConfirmationContext(screen: ScreenState): string | null {
    return screen.key && screen.rootNodeId
        ? JSON.stringify([screen.key, screen.rootNodeId])
        : null;
}
