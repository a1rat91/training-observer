import {type ControlSnapshot} from './control-snapshot';
import {type DomSnapshot} from './dom-snapshot';

/** Serializable state of one mounted data-mf root. Names need not be unique. */
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
