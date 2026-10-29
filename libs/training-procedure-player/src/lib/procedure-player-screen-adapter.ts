import {
    readScreenState,
    type ScreenAdapter,
    SnapshotReader,
} from '@training-observer/core/adapters';
import {
    type DomSnapshot,
    type ScreenState,
    ScreenStatus,
} from '@training-observer/core/models';

const PLAYER_TAGS = new Set(['player-procedure', 'procedure-player']);

/** Правила DOM procedure-player. Идентичность блока не зависит от состава его контролов. */
export const procedurePlayerScreenAdapter: ScreenAdapter = {
    id: 'procedure-player',
    rootSelector: 'player-procedure,procedure-player',
    read(snapshot, controls) {
        const reader = new SnapshotReader(snapshot);
        const players = reader.elements.filter(
            (node) => PLAYER_TAGS.has(node.tagName) && node.visible,
        );

        if (!players.length) {
            return null;
        }

        if (snapshot.stats.truncated) {
            return unavailable('truncated');
        }

        if (players.length > 1) {
            return unavailable('root-ambiguous', ScreenStatus.Ambiguous);
        }

        const player = players[0]!;
        const scoped: DomSnapshot = {
            ...snapshot,
            rootId: player.id,
            nodes: Object.fromEntries(
                Object.entries(snapshot.nodes).filter(
                    ([id]) => owner(snapshot, id) === player.id,
                ),
            ),
        };

        const screen = readScreenState(scoped, controls, {
            root: {attribute: {name: 'block-id'}},
            identity: {kind: 'attribute', name: 'block-id'},
            loading: {name: 'aria-busy', value: 'true'},
        });

        return player.attributes['aria-busy'] === 'true' &&
            screen.status !== ScreenStatus.Ambiguous
            ? {
                  ...screen,
                  status: ScreenStatus.Loading,
                  reason: 'loading',
                  rootNodeId: screen.rootNodeId ?? player.id,
              }
            : screen;
    },
};

/** Не захватываем блоки вложенного procedure-player или соседнего микрофронта. */
function owner(snapshot: DomSnapshot, id: string): string | null {
    const visited = new Set<string>();
    let node = snapshot.nodes[id];

    while (node && !visited.has(node.id)) {
        visited.add(node.id);

        if (node.kind === 'element' && PLAYER_TAGS.has(node.tagName)) {
            return node.id;
        }

        const parent = node.parentId ? snapshot.nodes[node.parentId] : undefined;

        if (parent?.kind === 'element' && parent.tagName === 'microfrontend') {
            return null;
        }

        node = parent;
    }

    return null;
}

function unavailable(
    reason: ScreenState['reason'],
    status: ScreenState['status'] = ScreenStatus.Unavailable,
): ScreenState {
    return {schemaVersion: 1, status, reason, key: null, rootNodeId: null, controls: []};
}
