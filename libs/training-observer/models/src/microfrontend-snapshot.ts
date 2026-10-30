/** Результат наблюдения отдельной области: снимок, проекция, счётчики и ошибка. Не содержит сценариев обучения. */
import {type ControlSnapshot} from './control-snapshot';
import {type DomSnapshot} from './dom-snapshot';

/** Сериализуемое состояние одного смонтированного корня микрофронта. Имя не обязано быть уникальным. */
export interface MicrofrontendSnapshot {
    readonly id: string;
    /** Имя DOM-тега корневого компонента области (Element.localName). */
    readonly name: string;
    readonly parentId: string | null;
    readonly snapshot: DomSnapshot | null;
    readonly logicalControls: readonly ControlSnapshot[];
    /** Последние blur-подтверждения DOM-экземпляров, в том числе уже ушедших из logicalControls. */
    readonly confirmedControls: Readonly<Record<string, ControlSnapshot>>;
    readonly scanCount: number;
    /** Ревизия данных области, включая подтверждения blur, ошибку и смену родительской области. */
    readonly revision: number;
    readonly error: string | null;
}
