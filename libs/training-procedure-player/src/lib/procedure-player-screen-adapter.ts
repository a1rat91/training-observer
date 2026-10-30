import {
    readScreenState,
    type ScreenAdapter,
    SnapshotReader,
} from '@training-observer/core/adapters';
import {
    type DomElementSnapshot,
    type DomSnapshot,
    ScreenIdentityKind,
    ScreenStatus,
} from '@training-observer/core/models';

const BLOCK_ID = 'block-id';
const MICROFRONTEND = 'microfrontend';
const PAGE_ROOTS = new Set(['body', 'html']);

/** Идентичность блока задаёт block-id внутри принадлежащего области снимка, независимо от тега MF. */
export const procedurePlayerScreenAdapter: ScreenAdapter = {
    id: 'procedure-player',
    read(snapshot, controls) {
        const reader = new SnapshotReader(snapshot);
        const root = snapshot.rootId ? snapshot.nodes[snapshot.rootId] : undefined;

        if (root?.kind !== 'element') {
            return null;
        }

        const areas = capturedAreas(snapshot, root, reader.elements);
        const nodes = Object.fromEntries(
            Object.entries(snapshot.nodes).filter(([id]) =>
                belongsToArea(snapshot, id, areas),
            ),
        );

        const blocks = reader.elements.filter(
            (node) => nodes[node.id] && node.visible && BLOCK_ID in node.attributes,
        );

        if (!blocks.length) {
            return null;
        }

        const screen = readScreenState({...snapshot, nodes}, controls, {
            root: {attribute: {name: BLOCK_ID}},
            identity: {kind: ScreenIdentityKind.Attribute, name: BLOCK_ID},
            loading: {name: 'aria-busy', value: 'true'},
        });

        const block = blocks.length === 1 ? blocks[0] : undefined;

        return block &&
            screen.reason !== 'truncated' &&
            isLoading({...snapshot, nodes}, block)
            ? {
                  ...screen,
                  status: ScreenStatus.Loading,
                  reason: 'loading',
                  rootNodeId: screen.rootNodeId ?? block.id,
              }
            : screen;
    },
};

/** Whole-page recordings may contain several independent MF snapshots in one captured graph. */
function capturedAreas(
    snapshot: DomSnapshot,
    root: DomElementSnapshot,
    elements: readonly DomElementSnapshot[],
): ReadonlySet<string> {
    const areas = new Set([root.id]);

    if (PAGE_ROOTS.has(root.tagName)) {
        for (const element of elements) {
            const parent = element.parentId
                ? snapshot.nodes[element.parentId]
                : undefined;

            if (
                parent?.kind === 'element' &&
                parent.tagName === MICROFRONTEND &&
                parent.parentId &&
                belongsToCapture(snapshot, parent.parentId, root.id)
            ) {
                areas.add(element.id);
            }
        }
    }

    return areas;
}

function belongsToCapture(snapshot: DomSnapshot, id: string, rootId: string): boolean {
    const visited = new Set<string>();
    let node = snapshot.nodes[id];

    while (node && !visited.has(node.id)) {
        if (node.id === rootId) {
            return true;
        }

        visited.add(node.id);
        node = node.parentId ? snapshot.nodes[node.parentId] : undefined;
    }

    return false;
}

/** A nested MF wrapper owns its descendants; disconnected and cyclic nodes cannot enter this area. */
function belongsToArea(
    snapshot: DomSnapshot,
    id: string,
    roots: ReadonlySet<string>,
): boolean {
    const visited = new Set<string>();
    let node = snapshot.nodes[id];

    while (node && !visited.has(node.id)) {
        if (roots.has(node.id)) {
            return true;
        }

        if (node.kind === 'element' && node.tagName === MICROFRONTEND) {
            return false;
        }

        visited.add(node.id);
        node = node.parentId ? snapshot.nodes[node.parentId] : undefined;
    }

    return false;
}

function isLoading(snapshot: DomSnapshot, block: DomElementSnapshot): boolean {
    const visited = new Set<string>();
    let node = snapshot.nodes[block.id];

    while (node && !visited.has(node.id)) {
        if (node.kind === 'element' && node.attributes['aria-busy'] === 'true') {
            return true;
        }

        visited.add(node.id);
        node = node.parentId ? snapshot.nodes[node.parentId] : undefined;
    }

    return false;
}
