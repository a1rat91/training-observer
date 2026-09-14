/** Сериализуемый DOM-граф: узлы, свойства, геометрия и ограничения обхода. Реальные DOM-ссылки остаются у builder. */
export type DomNodeId = string;

export interface DomRectSnapshot {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DomControlState {
    readonly value?: string | readonly string[];
    readonly checked?: boolean;
    readonly indeterminate?: boolean;
    readonly selected?: boolean;
    readonly expanded?: boolean;
    readonly disabled: boolean;
    readonly readOnly: boolean;
    readonly inert: boolean;
    readonly required: boolean;
    readonly invalid: boolean;
    readonly redacted: boolean;
}

export type InteractionReason = 'native' | 'role' | 'editable' | 'tabindex' | 'inline-handler' | 'cursor';
export type HitTestResult = 'hit' | 'covered' | 'not-tested' | 'unavailable';

interface DomNodeBase {
    readonly id: DomNodeId;
    readonly parentId: DomNodeId | null;
}

export interface DomTextSnapshot extends DomNodeBase {
    readonly kind: 'text';
    readonly text: string;
    readonly visible: boolean;
}

export interface DomElementSnapshot extends DomNodeBase {
    readonly kind: 'element';
    readonly tagName: string;
    /** Структурный путь для диагностики, не устойчивый локатор между сеансами. */
    readonly path: string;
    readonly attributes: Readonly<Record<string, string>>;
    /** Приближённая подпись; полный алгоритм accessible name не реализован. */
    readonly label: string;
    readonly children: readonly DomNodeId[];
    readonly rects: readonly DomRectSnapshot[];
    readonly visible: boolean;
    readonly inViewport: boolean;
    readonly hitTest: HitTestResult;
    /** Потенциальный контрол, включая скрытые и отключённые элементы. */
    readonly interactive: boolean;
    readonly interactionReasons: readonly InteractionReason[];
    readonly pointerActionable: boolean;
    readonly state: DomControlState;
    /** Границы присутствуют в диагностике, но содержимое за ними не обходится. */
    readonly boundaries: readonly ('iframe' | 'open-shadow-root')[];
}

export type DomNodeSnapshot = DomElementSnapshot | DomTextSnapshot;

export interface DomSnapshot {
    readonly schemaVersion: 1;
    readonly capturedAt: string;
    readonly durationMs: number;
    readonly rootId: DomNodeId | null;
    /** Дополнительные корни вне области, явно связанные с открытым контролом через aria-controls. */
    readonly relatedRootIds?: readonly DomNodeId[];
    readonly nodes: Readonly<Record<DomNodeId, DomNodeSnapshot>>;
    readonly interactiveIds: readonly DomNodeId[];
    readonly stats: {
        readonly nodeCount: number;
        readonly elementCount: number;
        readonly textCount: number;
        readonly boundaryCount: number;
        readonly truncated: boolean;
        readonly limitsReached: readonly ('maxDepth' | 'maxNodes')[];
    };
}
