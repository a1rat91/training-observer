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

export type InteractionReason =
    'cursor' | 'editable' | 'inline-handler' | 'native' | 'role' | 'tabindex';
export type HitTestResult = 'covered' | 'hit' | 'not-tested' | 'unavailable';

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
    /** Structural path for diagnostics, not a stable cross-session locator. */
    readonly path: string;
    readonly attributes: Readonly<Record<string, string>>;
    /** A best-effort label, not a full accessible-name computation. */
    readonly label: string;
    readonly children: readonly DomNodeId[];
    readonly rects: readonly DomRectSnapshot[];
    readonly visible: boolean;
    readonly inViewport: boolean;
    readonly hitTest: HitTestResult;
    /** Potential control, including hidden and disabled controls. */
    readonly interactive: boolean;
    readonly interactionReasons: readonly InteractionReason[];
    readonly pointerActionable: boolean;
    readonly state: DomControlState;
    /** Boundaries are reported, but not traversed in the first iteration. */
    readonly boundaries: ReadonlyArray<'iframe' | 'open-shadow-root'>;
}

export type DomNodeSnapshot = DomElementSnapshot | DomTextSnapshot;

export interface DomSnapshot {
    readonly schemaVersion: 1;
    readonly capturedAt: string;
    readonly durationMs: number;
    readonly rootId: DomNodeId | null;
    /** Additional roots outside the scope, explicitly linked by an open control's aria-controls. */
    readonly relatedRootIds?: readonly DomNodeId[];
    readonly nodes: Readonly<Record<DomNodeId, DomNodeSnapshot>>;
    readonly interactiveIds: readonly DomNodeId[];
    readonly stats: {
        readonly nodeCount: number;
        readonly elementCount: number;
        readonly textCount: number;
        readonly boundaryCount: number;
        readonly truncated: boolean;
        readonly limitsReached: ReadonlyArray<'maxDepth' | 'maxNodes'>;
    };
}
