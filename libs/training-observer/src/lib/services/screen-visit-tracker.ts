/**
 * Считает посещения логических экранов только по готовым состояниям: A → B → A даёт три посещения.
 * Remount того же A обновляет ID экземпляра без нового посещения. Loading/unknown не создают переход.
 * Экземпляр принадлежит одному учебному контексту; reset начинает новый сеанс.
 */
import type {ScreenState, ScreenVisit} from '../models/screen-state';

export class ScreenVisitTracker {
    private current: ScreenVisit | null = null;

    update(state: ScreenState): ScreenVisit | null {
        if (state.status !== 'ready' || !state.key || !state.rootNodeId) return this.current;
        this.current = {
            key: state.key,
            number: this.current?.key === state.key ? this.current.number : (this.current?.number ?? 0) + 1,
            rootNodeId: state.rootNodeId,
        };
        return this.current;
    }

    reset(): void {
        this.current = null;
    }
}
