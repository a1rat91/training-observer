import {
    type ControlSnapshot,
    type DomSnapshot,
    type ScreenState,
    ScreenStatus,
} from '@training-observer/core/models';

/** Application-specific screen rules over captured data. Browser lifecycle stays in core. */
export interface ScreenAdapter {
    readonly id: string;
    /** null means this adapter does not claim a screen in this snapshot. */
    read(snapshot: DomSnapshot, controls: readonly ControlSnapshot[]): ScreenState | null;
}

/** Registration is idempotent for the same instance and rejects conflicting IDs. */
export function resolveScreenAdapters(
    adapters: readonly ScreenAdapter[],
): readonly ScreenAdapter[] {
    const byId = new Map<string, ScreenAdapter>();

    for (const adapter of adapters) {
        if (
            !adapter ||
            typeof adapter.id !== 'string' ||
            !adapter.id.trim() ||
            adapter.id !== adapter.id.trim() ||
            typeof adapter.read !== 'function'
        ) {
            throw new Error('Invalid screen adapter registration.');
        }

        const existing = byId.get(adapter.id);

        if (existing && existing !== adapter) {
            throw new Error(`Duplicate screen adapter ID: ${adapter.id}.`);
        }

        byId.set(adapter.id, adapter);
    }

    return [...byId.values()];
}

/** One adapter owns a screen; missing or competing recognition remains explicit. */
export function readAdaptedScreen(
    snapshot: DomSnapshot | null,
    controls: readonly ControlSnapshot[],
    adapters: readonly ScreenAdapter[],
): ScreenState {
    const registered = resolveScreenAdapters(adapters);

    if (!snapshot) {
        return unavailable('no-snapshot');
    }

    if (snapshot.stats.truncated) {
        return unavailable('truncated');
    }

    let result: ScreenState | null = null;

    for (const adapter of registered) {
        const screen = adapter.read(snapshot, controls);

        if (screen) {
            if (result) {
                return unavailable('root-ambiguous', ScreenStatus.Ambiguous);
            }

            result = screen;
        }
    }

    return result ?? unavailable('adapter-missing');
}

function unavailable(
    reason: ScreenState['reason'],
    status: ScreenState['status'] = ScreenStatus.Unavailable,
): ScreenState {
    return {
        schemaVersion: 1,
        status,
        reason,
        key: null,
        rootNodeId: null,
        controls: [],
    };
}
