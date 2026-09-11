import {DOCUMENT} from '@angular/common';
import {DestroyRef, inject, Injectable, NgZone} from '@angular/core';

import {type DomNodeId, type DomSnapshot} from '../models/dom-snapshot';
import {DomHighlightLayer, type HighlightTarget} from './dom-highlight-layer';
import {DomSnapshotBuilder} from './dom-snapshot-builder';

@Injectable({providedIn: 'root'})
export class DomHighlighter {
    private readonly document = inject(DOCUMENT);
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly zone = inject(NgZone);
    private layer: DomHighlightLayer | null = null;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.clear());
    }

    /** Numbers follow nodeIds order. focusId shows only that node, preserving its number. */
    public show(
        snapshot: DomSnapshot,
        nodeIds: readonly DomNodeId[] = snapshot.interactiveIds,
        focusId?: DomNodeId,
    ): void {
        this.clear();
        const targets: HighlightTarget[] = [];
        const uniqueIds = [...new Set(nodeIds)];

        uniqueIds.forEach((nodeId, index) => {
            if (focusId !== undefined && nodeId !== focusId) {
                return;
            }

            const element = this.builder.resolveElement(snapshot, nodeId);

            if (element) {
                targets.push({nodeId, element: new WeakRef(element), number: index + 1});
            }
        });

        if (!targets.length || !this.document.defaultView || !this.document.body) {
            return;
        }

        this.zone.runOutsideAngular(() => {
            this.layer = new DomHighlightLayer(this.document, targets);
        });
    }

    public clear(): void {
        this.layer?.dispose();
        this.layer = null;
    }
}
