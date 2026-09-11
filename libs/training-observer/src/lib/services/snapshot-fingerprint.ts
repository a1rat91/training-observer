import {type DomSnapshot} from '../models/dom-snapshot';

/** Capture time and duration do not change the observed page state. Keep the array order stable. */
export function snapshotFingerprint(snapshot: DomSnapshot): string {
    return JSON.stringify([
        snapshot.rootId,
        snapshot.relatedRootIds,
        snapshot.nodes,
        snapshot.interactiveIds,
        snapshot.stats,
    ]);
}
