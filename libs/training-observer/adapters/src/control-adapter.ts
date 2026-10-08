import {
    type ControlKind,
    type DomElementSnapshot,
    type DomNodeId,
} from '@training-observer/core/models';

import {type SnapshotReader} from './snapshot-reader';

/** A layer of recognition. The base preserves the inner component's metadata. */
export interface ControlCandidate {
    readonly kind: ControlKind;
    readonly source: string;
    readonly target: DomElementSnapshot;
    readonly host: DomElementSnapshot;
    readonly ancestors: readonly DomElementSnapshot[];
    readonly adapter?: ControlAdapter;
    readonly popup?: boolean;
    readonly label?: string;
    readonly base?: ControlCandidate;
}

export interface ControlAdapterContext {
    readonly reader: SnapshotReader;
    readonly target: DomElementSnapshot;
    readonly ancestors: readonly DomElementSnapshot[];
    readonly nativeKind: ControlKind | null;
    /** Result of lower-priority layers; null if unsupported or explicitly excluded. */
    readonly baseCandidate: ControlCandidate | null;
}

export type ControlAdapterResult =
    | {
          readonly status: 'match';
          readonly kind: ControlKind;
          /** Defaults to the base host, then the target. Must exist in this snapshot. */
          readonly hostId?: DomNodeId;
          readonly label?: string;
          /** Inherits from the base when omitted. Applies to textbox/number popups. */
          readonly popup?: boolean;
      }
    | {readonly status: 'exclude'};

/** Pure snapshot rules. Browser listeners, lifecycle and capture stay in core. */
export interface ControlAdapter {
    readonly id: string;
    /** Higher values refine lower layers. Equal-priority competing matches fail. */
    readonly priority?: number;
    /** Browser capture excludes these subtrees, including events and mutations. */
    readonly excludedSubtreeSelectors?: readonly string[];
    /** null passes through the base; exclude prevents native fallback. */
    match(context: ControlAdapterContext): ControlAdapterResult | null;
    excludeCandidate?(context: {
        readonly reader: SnapshotReader;
        readonly candidate: ControlCandidate;
        readonly candidates: readonly ControlCandidate[];
    }): boolean;
    resolveLabel?(context: {
        readonly reader: SnapshotReader;
        readonly candidate: ControlCandidate;
        readonly members: ReadonlySet<DomNodeId>;
    }): string | undefined;
}
