import {
    type ControlKind,
    ControlType,
    type DomElementSnapshot,
} from '@training-observer/core/models';

import {resolveControlAdapters} from './adapter-registry';
import {
    type ControlAdapter,
    type ControlAdapterResult,
    type ControlCandidate,
} from './control-adapter';
import {type SnapshotReader} from './snapshot-reader';

const CONTROL_KINDS: readonly ControlKind[] = Object.values(ControlType);

/** Native fallback is refined by successively higher-priority adapter layers. */
export function findControlCandidates(
    reader: SnapshotReader,
    adapters: readonly ControlAdapter[],
): readonly ControlCandidate[] {
    const registered = resolveControlAdapters(adapters);
    const groups = new Map<number, ControlAdapter[]>();

    for (const adapter of registered) {
        const priority = adapter.priority ?? 0;
        const group = groups.get(priority) ?? [];

        group.push(adapter);
        groups.set(priority, group);
    }

    const candidates: ControlCandidate[] = [];

    for (const target of reader.elements) {
        const ancestors = reader.ancestors(target);

        // Option content describes a choice rather than independent controls.
        if (ancestors.some((parent) => parent.attributes['role'] === 'option')) {
            continue;
        }

        const native = nativeControlKind(target);
        let candidate: ControlCandidate | null = native
            ? {kind: native, source: 'native', target, host: target, ancestors}
            : null;

        for (const group of groups.values()) {
            const matches: Array<{
                adapter: ControlAdapter;
                result: ControlAdapterResult;
            }> = [];

            for (const adapter of group) {
                const result = adapter.match({
                    reader,
                    target,
                    ancestors,
                    nativeKind: native,
                    baseCandidate: candidate,
                });

                if (result === null) {
                    continue;
                }

                validateMatch(reader, adapter, result);
                matches.push({adapter, result});
            }

            if (!matches.length) {
                continue;
            }

            if (
                matches.length > 1 &&
                matches.some(({result}) => result.status === 'match')
            ) {
                throw new Error(
                    `Ambiguous control adapters for ${target.id}: ${matches.map(({adapter}) => adapter.id).join(', ')}. Set distinct priorities.`,
                );
            }

            const winner = matches[0]!;

            if (winner.result.status === 'exclude') {
                candidate = null;
                continue;
            }

            const {result, adapter} = winner;
            const host = result.hostId
                ? (reader.snapshot.nodes[result.hostId] as DomElementSnapshot)
                : (candidate?.host ?? target);

            candidate = {
                kind: result.kind,
                source: adapter.id,
                target,
                host,
                ancestors,
                adapter,
                label: result.label ?? candidate?.label,
                popup: result.popup ?? candidate?.popup,
                base: candidate ?? undefined,
            };
        }

        if (candidate) {
            candidates.push(candidate);
        }
    }

    return candidates.filter(
        (candidate) =>
            !registered.some((adapter) =>
                adapter.excludeCandidate?.({reader, candidate, candidates}),
            ),
    );
}

function validateMatch(
    reader: SnapshotReader,
    adapter: ControlAdapter,
    result: ControlAdapterResult,
): void {
    if (
        !result ||
        (result.status !== 'match' && result.status !== 'exclude') ||
        (result.status === 'match' &&
            (!CONTROL_KINDS.includes(result.kind) ||
                (result.hostId !== undefined &&
                    reader.snapshot.nodes[result.hostId]?.kind !== 'element') ||
                (result.label !== undefined && typeof result.label !== 'string') ||
                (result.popup !== undefined && typeof result.popup !== 'boolean')))
    ) {
        throw new Error(`Invalid match returned by control adapter ${adapter.id}.`);
    }
}

export function nativeControlKind(node: DomElementSnapshot): ControlKind | null {
    const type = (node.attributes['type'] ?? 'text').toLowerCase();
    const role = node.attributes['role'];

    if (node.tagName === 'select') {
        return 'select';
    }

    if (
        node.tagName === 'button' ||
        (node.tagName === 'input' && ['button', 'reset', 'submit'].includes(type))
    ) {
        return !role || role === 'button' ? 'button' : null;
    }

    if (node.tagName === 'input' && type === 'checkbox') {
        if (role === 'switch' || (!role && 'switch' in node.attributes)) {
            return 'switch';
        }

        return !role || role === 'checkbox' ? 'checkbox' : null;
    }

    if (node.tagName === 'input' && type === 'radio') {
        return !role || role === 'radio' ? 'radio' : null;
    }

    if (node.tagName === 'input' && type === 'number') {
        return !role || role === 'spinbutton' ? 'number' : null;
    }

    const textInput =
        node.tagName === 'input' &&
        ['email', 'password', 'search', 'tel', 'text', 'url'].includes(type);

    return (node.tagName === 'textarea' || textInput) &&
        (!role || role === 'textbox' || role === 'searchbox')
        ? 'textbox'
        : null;
}
