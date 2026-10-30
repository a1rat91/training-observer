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

/** Точка отсчёта живёт до удаления MF из кадра, включая loading и временное отсутствие block-id. */
export class ProcedurePlayerBlockTracker {
    private readonly previous = new Map<string, string>();

    public update(
        areas: readonly MicrofrontendSnapshot[],
    ): readonly ProcedurePlayerBlockChange[] {
        const mounted = new Set(areas.map((area) => area.id));
        const events: ProcedurePlayerBlockChange[] = [];

        for (const id of this.previous.keys()) {
            if (!mounted.has(id)) {
                this.previous.delete(id);
            }
        }

        for (const {microfrontendId, state} of readProcedurePlayers(areas)) {
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
