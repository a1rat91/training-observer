/** Внутренняя привязка настроек capture к владельцу observation defaults. Не часть публичного API. */
import {inject, InjectionToken} from '@angular/core';

import {DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions} from './dom-snapshot-options';

export const DOM_OBSERVATION_SNAPSHOT_BASELINE = new InjectionToken<DomSnapshotOptions>(
    'DOM_OBSERVATION_SNAPSHOT_BASELINE',
    {providedIn: 'root', factory: () => inject(DOM_SNAPSHOT_OPTIONS)},
);
