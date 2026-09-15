/** Сериализуемая модель логического контрола. Разделяет идентичность, наблюдаемое значение, видимость и сведения о popup. */
import {
    type DomControlState,
    type DomNodeId,
    type DomRectSnapshot,
    type HitTestResult,
} from './dom-snapshot';
import {type ControlType} from './observation-enums';

/** Для совместимости интеграция принимает строковые значения JSON наряду с членами enum. */
export type ControlKind = `${ControlType}`;

export interface ChoiceSnapshot {
    /** Текст input наблюдаем; у ComboBox он сам по себе не доказывает выбор варианта. */
    readonly displayValue: string;
    readonly selection: {
        readonly status: 'observed' | 'unknown';
        readonly labels: readonly string[];
        /** Присутствует, если подтверждение blur использовало доказательство из снимка до закрытия popup. */
        readonly evidence?: 'previous-snapshot';
    };
    readonly popup: PopupSnapshot;
}

/** Явная связь с popup; его содержимое не обязательно является списком вариантов. */
export interface PopupSnapshot {
    readonly status: 'closed' | 'native' | 'open' | 'unresolved';
    readonly relation: 'aria-controls' | 'missing' | 'native-options';
    readonly referencedIds: readonly string[];
    readonly rootNodeIds: readonly DomNodeId[];
    readonly busy: boolean | null;
    readonly text: string;
    /** Только варианты текущего снимка, а не весь набор источника данных. */
    readonly options: ReadonlyArray<{
        readonly nodeId: DomNodeId;
        readonly label: string;
        readonly value?: string;
        readonly selected: boolean | null;
        readonly disabled: boolean;
    }>;
}

/** Признаки поиска, а не гарантированно уникальный локатор. Без текущего значения и геометрии. */
export interface ControlLocatorHints {
    readonly kind: ControlKind;
    readonly label: string;
    readonly tagName: string;
    readonly role: string;
    readonly inputType?: string;
    readonly id?: string;
    readonly name?: string;
    readonly testId?: string;
    readonly placeholder?: string;
    readonly context: ReadonlyArray<{
        readonly tagName: string;
        readonly id?: string;
        readonly label: string;
    }>;
}

export interface ControlSnapshot {
    readonly schemaVersion: 1;
    /** Сессионная идентичность native-цели; меняется при замене DOM-узла. */
    readonly id: string;
    readonly kind: ControlKind;
    readonly source: 'native' | 'taiga-ui';
    readonly label: string;
    readonly targetNodeId: DomNodeId;
    readonly hostNodeId: DomNodeId;
    /** Представление контрола вместе с подписями и декорацией; не алгоритм поиска цели события. */
    readonly memberNodeIds: readonly DomNodeId[];
    /** Для числа хранится точная DOM-строка с маской/форматированием, а не значение Angular-модели. */
    readonly state: DomControlState;
    readonly visible: boolean;
    readonly inViewport: boolean;
    readonly pointerActionable: boolean;
    readonly hitTest: HitTestResult;
    readonly rects: readonly DomRectSnapshot[];
    readonly locatorHints: ControlLocatorHints;
    readonly choice?: ChoiceSnapshot;
    /** Произвольный dropdown Taiga input без утверждения о выбранном варианте. */
    readonly popup?: PopupSnapshot;
}
