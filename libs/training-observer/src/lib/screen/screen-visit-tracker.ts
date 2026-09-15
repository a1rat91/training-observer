/** Учёт посещений логического экрана. Смена готового ID увеличивает номер; remount того же ID и loading не создают новое посещение. */
/**
 * Считает посещения логических экранов только по готовым состояниям: A → B → A даёт три посещения.
 * Remount того же A обновляет ID экземпляра без нового посещения. Loading/unknown не создают переход.
 * Экземпляр принадлежит одному учебному контексту; reset начинает новый сеанс.
 */
import {
    type ScreenState,
    ScreenStatus,
    type ScreenVisit,
} from '@training-observer/core/models';

export class ScreenVisitTracker {
    private current: ScreenVisit | null = null;

    public update(state: ScreenState): ScreenVisit | null {
        if (state.status !== ScreenStatus.Ready || !state.key || !state.rootNodeId) {
            return this.current;
        }

        this.current = {
            key: state.key,
            number:
                this.current?.key === state.key
                    ? this.current.number
                    : (this.current?.number ?? 0) + 1,
            rootNodeId: state.rootNodeId,
        };

        return this.current;
    }

    public reset(): void {
        this.current = null;
    }
}
