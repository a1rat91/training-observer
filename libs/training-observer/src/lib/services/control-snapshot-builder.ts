import {Injectable} from '@angular/core';

import {type ControlSnapshot} from '../models/control-snapshot';
import {type DomSnapshot} from '../models/dom-snapshot';
import {findControlCandidates} from './control-adapters';
import {projectControl} from './control-projection';
import {SnapshotReader} from './snapshot-reader';

@Injectable({providedIn: 'root'})
export class ControlSnapshotBuilder {
    /** Pure projection: only captured nodes are used, with no extra live DOM reads. */
    public build(snapshot: DomSnapshot): readonly ControlSnapshot[] {
        const reader = new SnapshotReader(snapshot);
        const controls = findControlCandidates(reader);
        const targets = new Set(controls.map((control) => control.target.id));

        return controls.map((control) => projectControl(reader, control, targets));
    }
}
