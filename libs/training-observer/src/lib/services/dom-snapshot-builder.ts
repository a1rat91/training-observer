import {DOCUMENT} from '@angular/common';
import {inject, Injectable} from '@angular/core';

import {type DomNodeId, type DomSnapshot} from '../models/dom-snapshot';
import {DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions} from '../tokens/dom-snapshot-options';
import {DomElementAnalyzer} from './dom-element-analyzer';
import {DomCapture} from './dom-capture';

@Injectable({providedIn: 'root'})
export class DomSnapshotBuilder {
    private readonly document = inject(DOCUMENT);
    private readonly defaults = inject(DOM_SNAPSHOT_OPTIONS);
    private readonly analyzer = inject(DomElementAnalyzer);
    private readonly ids = new WeakMap<Node, DomNodeId>();
    private nextId = 0;

    /** Read-only, synchronous capture of a single document's light DOM. */
    build(root: Element = this.document.body, overrides: Partial<DomSnapshotOptions> = {}): DomSnapshot {
        const view = this.document.defaultView;

        if (!view || !root || root.ownerDocument !== this.document || !root.isConnected) {
            throw new Error('DOM capture requires a connected element in the injected browser document.');
        }

        const options = {...this.defaults, ...overrides};

        this.validateOptions(options);

        return new DomCapture(root, options, this.analyzer, (node) => this.idFor(node)).capture();
    }

    private idFor(node: Node): DomNodeId {
        let id = this.ids.get(node);

        if (!id) {
            id = `n${++this.nextId}`;
            this.ids.set(node, id);
        }

        return id;
    }

    validateOptions(options: DomSnapshotOptions): void {
        if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 100 ||
            !Number.isInteger(options.maxNodes) || options.maxNodes < 1) {
            throw new Error('maxDepth must be an integer from 0 to 100; maxNodes must be a positive integer.');
        }

        if (options.ignoreSelector) {
            this.document.documentElement.matches(options.ignoreSelector);
        }
        if (options.boundarySelector) {
            this.document.documentElement.matches(options.boundarySelector);
        }
    }
}
