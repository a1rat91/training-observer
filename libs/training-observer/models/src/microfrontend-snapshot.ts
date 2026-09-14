/** Результат наблюдения отдельной области: снимок, проекция, счётчики и ошибка. Не содержит сценариев обучения. */
import { type ControlSnapshot } from './control-snapshot';
import { type DomSnapshot } from './dom-snapshot';

/** Сериализуемое состояние одного смонтированного корня data-mf. Имя не обязано быть уникальным. */
export interface MicrofrontendSnapshot {
    readonly id: string;
    readonly name: string;
    readonly parentId: string | null;
    readonly snapshot: DomSnapshot | null;
    readonly logicalControls: readonly ControlSnapshot[];
    readonly scanCount: number;
    readonly revision: number;
    readonly error: string | null;
}
