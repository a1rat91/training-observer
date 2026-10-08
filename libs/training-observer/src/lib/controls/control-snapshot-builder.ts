/** Angular-обёртка чистой проекции контролов. Получает готовый DOM-снимок, возвращает независимые сериализуемые описания. */
import {inject, Injectable} from '@angular/core';
import {projectControls} from '@training-observer/core/adapters';
import {type ControlSnapshot, type DomSnapshot} from '@training-observer/core/models';

import {CONTROL_ADAPTERS} from '../tokens/control-adapters';

@Injectable({providedIn: 'root'})
export class ControlSnapshotBuilder {
    private readonly adapters = inject(CONTROL_ADAPTERS);

    /** Чистая проекция: используются только захваченные узлы, без дополнительных чтений живого DOM. */
    public build(snapshot: DomSnapshot): readonly ControlSnapshot[] {
        return projectControls(snapshot, this.adapters);
    }
}
