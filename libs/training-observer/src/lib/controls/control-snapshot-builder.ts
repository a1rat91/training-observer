/** Angular-обёртка чистой проекции контролов. Получает готовый DOM-снимок, возвращает независимые сериализуемые описания. */
import { Injectable } from '@angular/core';

import { type ControlSnapshot } from '@training-observer/core/models';
import { type DomSnapshot } from '@training-observer/core/models';
import { findControlCandidates } from './control-adapters';
import { projectControl } from './control-projection';
import { SnapshotReader } from './snapshot-reader';

@Injectable({ providedIn: 'root' })
export class ControlSnapshotBuilder {
    /** Чистая проекция: используются только захваченные узлы, без дополнительных чтений живого DOM. */
    build(snapshot: DomSnapshot): readonly ControlSnapshot[] {
        const reader = new SnapshotReader(snapshot);
        const controls = findControlCandidates(reader);
        const targets = new Set(controls.map((control) => control.target.id));

        return controls.map((control) => projectControl(reader, control, targets));
    }
}
