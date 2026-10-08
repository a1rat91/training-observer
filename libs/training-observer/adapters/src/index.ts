import {type ControlSnapshot, type DomSnapshot} from '@training-observer/core/models';

import {type ControlAdapter} from './control-adapter';
import {findControlCandidates} from './control-adapters';
import {projectControl} from './control-projection';
import {SnapshotReader} from './snapshot-reader';

export {resolveControlAdapters} from './adapter-registry';
export type {
    ControlAdapter,
    ControlAdapterContext,
    ControlAdapterResult,
    ControlCandidate,
} from './control-adapter';
export {nativeControlKind} from './control-adapters';
export {normalizeText, SnapshotReader} from './snapshot-reader';

/** Projects a saved DOM graph without Angular or any live browser API. */
export function projectControls(
    snapshot: DomSnapshot,
    adapters: readonly ControlAdapter[] = [],
): readonly ControlSnapshot[] {
    const reader = new SnapshotReader(snapshot);
    const controls = findControlCandidates(reader, adapters);
    const targets = new Set(controls.map((control) => control.target.id));

    return controls.map((control) => projectControl(reader, control, targets));
}
