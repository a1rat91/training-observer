import {computed, inject, Injectable, NgZone, signal} from '@angular/core';

import {type DomElementSnapshot, type DomSnapshot} from './models/dom-snapshot';
import {DomSnapshotBuilder} from './services/dom-snapshot-builder';
import {type DomSnapshotOptions} from './tokens/dom-snapshot-options';

/** Angular facade. Automatic updates and action recording will be separate steps. */
@Injectable({providedIn: 'root'})
export class TrainingObserver {
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly zone = inject(NgZone);
    private readonly current = signal<DomSnapshot | null>(null);

    readonly snapshot = this.current.asReadonly();
    readonly controls = computed<readonly DomElementSnapshot[]>(() => {
        const snapshot = this.snapshot();

        return snapshot ? snapshot.interactiveIds.map((id) => snapshot.nodes[id])
            .filter((node): node is DomElementSnapshot => node.kind === 'element') : [];
    });

    capture(root?: Element, options?: Partial<DomSnapshotOptions>): DomSnapshot {
        const snapshot = this.zone.runOutsideAngular(() => this.builder.build(root, options));

        this.current.set(snapshot);

        return snapshot;
    }

    clear(): void {
        this.current.set(null);
    }
}
