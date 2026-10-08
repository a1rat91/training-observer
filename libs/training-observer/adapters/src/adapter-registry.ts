import {type ControlAdapter} from './control-adapter';

/** Registration is idempotent for the same instance and rejects conflicting IDs. */
export function resolveControlAdapters(
    adapters: readonly ControlAdapter[],
): readonly ControlAdapter[] {
    const byId = new Map<string, ControlAdapter>();

    for (const adapter of adapters) {
        if (
            !adapter ||
            typeof adapter.id !== 'string' ||
            !adapter.id.trim() ||
            adapter.id !== adapter.id.trim() ||
            adapter.id === 'native' ||
            typeof adapter.match !== 'function' ||
            (adapter.priority !== undefined && !Number.isFinite(adapter.priority)) ||
            (adapter.excludeCandidate !== undefined &&
                typeof adapter.excludeCandidate !== 'function') ||
            (adapter.resolveLabel !== undefined &&
                typeof adapter.resolveLabel !== 'function') ||
            (adapter.excludedSubtreeSelectors !== undefined &&
                (!Array.isArray(adapter.excludedSubtreeSelectors) ||
                    adapter.excludedSubtreeSelectors.some(
                        (selector) => typeof selector !== 'string' || !selector.trim(),
                    )))
        ) {
            throw new Error('Invalid control adapter registration.');
        }

        const existing = byId.get(adapter.id);

        if (existing && existing !== adapter) {
            throw new Error(`Duplicate control adapter ID: ${adapter.id}.`);
        }

        byId.set(adapter.id, adapter);
    }

    return [...byId.values()].sort(
        (left, right) => (left.priority ?? 0) - (right.priority ?? 0),
    );
}
