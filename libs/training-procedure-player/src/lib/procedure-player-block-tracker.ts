import {
    type MicrofrontendSnapshot,
    type ScreenState,
    ScreenStatus,
} from '@training-observer/core/models';

import {procedurePlayerScreenAdapter} from './procedure-player-screen-adapter';

export interface ProcedurePlayerSnapshot {
    readonly microfrontendId: string;
    readonly state: ScreenState;
}

/** Изменение наблюдаемого block-id конкретного экземпляра микрофронта. */
export interface ProcedurePlayerBlockChange {
    readonly kind: 'block-change';
    readonly source: 'procedure-player';
    readonly microfrontendId: string;
    readonly previousBlockId: string;
    readonly blockId: string;
}

export function readProcedurePlayers(
    areas: readonly MicrofrontendSnapshot[],
): readonly ProcedurePlayerSnapshot[] {
    return areas.flatMap((area) => {
        const state = area.snapshot
            ? procedurePlayerScreenAdapter.read(area.snapshot, area.logicalControls)
            : null;

        return state ? [{microfrontendId: area.id, state}] : [];
    });
}

/** Начальное состояние — точка отсчёта. Loading и повторы того же ID не создают переходов. */
export class ProcedurePlayerBlockTracker {
    private readonly previous = new Map<string, string>();

    public update(
        players: readonly ProcedurePlayerSnapshot[],
    ): readonly ProcedurePlayerBlockChange[] {
        const mounted = new Set(players.map((player) => player.microfrontendId));
        const events: ProcedurePlayerBlockChange[] = [];

        for (const id of this.previous.keys()) {
            if (!mounted.has(id)) {
                this.previous.delete(id);
            }
        }

        for (const {microfrontendId, state} of players) {
            if (state.status !== ScreenStatus.Ready || !state.key) {
                continue;
            }

            const previousBlockId = this.previous.get(microfrontendId);

            this.previous.set(microfrontendId, state.key);

            if (previousBlockId !== undefined && previousBlockId !== state.key) {
                events.push({
                    kind: 'block-change',
                    source: 'procedure-player',
                    microfrontendId,
                    previousBlockId,
                    blockId: state.key,
                });
            }
        }

        return events;
    }

    public clear(): void {
        this.previous.clear();
    }
}
