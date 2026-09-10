import {type DomControlState, type DomNodeId, type DomRectSnapshot, type HitTestResult} from './dom-snapshot';

export type ControlKind = 'textbox' | 'number' | 'button' | 'checkbox' | 'radio' | 'switch' | 'select' | 'combobox';

export interface ChoiceSnapshot {
    /** Input text is observable; in a combobox it is not proof of a committed selection. */
    readonly displayValue: string;
    readonly selection: {readonly status: 'observed' | 'unknown'; readonly labels: readonly string[]};
    readonly popup: PopupSnapshot;
}

/** Explicit popup relationship; its content need not be a list of selectable options. */
export interface PopupSnapshot {
    readonly status: 'closed' | 'open' | 'unresolved' | 'native';
    readonly relation: 'aria-controls' | 'native-options' | 'missing';
    readonly referencedIds: readonly string[];
    readonly rootNodeIds: readonly DomNodeId[];
    readonly busy: boolean | null;
    readonly text: string;
    /** Only the options currently captured, never a claim about the complete data source. */
    readonly options: readonly {
        readonly nodeId: DomNodeId;
        readonly label: string;
        readonly value?: string;
        readonly selected: boolean | null;
        readonly disabled: boolean;
    }[];
}

/** Search evidence, not a guaranteed unique locator. No current value or geometry. */
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
    readonly context: readonly {
        readonly tagName: string;
        readonly id?: string;
        readonly label: string;
    }[];
}

export interface ControlSnapshot {
    readonly schemaVersion: 1;
    /** Session-local identity based on the native target. Changes when that DOM node is replaced. */
    readonly id: string;
    readonly kind: ControlKind;
    readonly source: 'native' | 'taiga-ui';
    readonly label: string;
    readonly targetNodeId: DomNodeId;
    readonly hostNodeId: DomNodeId;
    /** Captured representation, including labels/decoration; not an event-target resolver. */
    readonly memberNodeIds: readonly DomNodeId[];
    /** For number fields, value is the exact DOM string, including mask/formatting, not the Angular model. */
    readonly state: DomControlState;
    readonly visible: boolean;
    readonly inViewport: boolean;
    readonly pointerActionable: boolean;
    readonly hitTest: HitTestResult;
    readonly rects: readonly DomRectSnapshot[];
    readonly locatorHints: ControlLocatorHints;
    readonly choice?: ChoiceSnapshot;
    /** Generic Taiga input dropdown, without asserting a committed selection. */
    readonly popup?: PopupSnapshot;
}
