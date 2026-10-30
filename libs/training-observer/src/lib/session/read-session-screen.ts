import {
    readAdaptedScreen,
    readScreenState,
    type ScreenAdapter,
} from '@training-observer/core/adapters';
import {
    type ControlSnapshot,
    type DomSnapshot,
    type ScreenState,
    type ScreenStateOptions,
} from '@training-observer/core/models';

/** Явная конфигурация владельца заменяет автоматическое распознавание адаптерами. */
export function readSessionScreen(
    snapshot: DomSnapshot | null,
    controls: readonly ControlSnapshot[],
    screen: ScreenStateOptions | undefined,
    adapters: readonly ScreenAdapter[],
): ScreenState {
    return screen
        ? readScreenState(snapshot, controls, screen)
        : readAdaptedScreen(snapshot, controls, adapters);
}
