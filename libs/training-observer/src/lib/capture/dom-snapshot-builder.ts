/** Angular-фабрика снимков. Проверяет настройки, запускает capture и хранит разрешение сессионных ID в реальные элементы. */
import {DOCUMENT} from '@angular/common';
import {inject, Injectable} from '@angular/core';
import {type DomNodeId, type DomSnapshot} from '@training-observer/core/models';

import {
    DOM_SNAPSHOT_OPTIONS,
    type DomSnapshotOptions,
} from '../tokens/dom-snapshot-options';
import {DomCapture} from './dom-capture';
import {DomElementAnalyzer} from './dom-element-analyzer';

@Injectable({providedIn: 'root'})
export class DomSnapshotBuilder {
    private readonly document = inject(DOCUMENT);
    private readonly defaults = inject(DOM_SNAPSHOT_OPTIONS);
    private readonly analyzer = inject(DomElementAnalyzer);
    private readonly ids = new WeakMap<Node, DomNodeId>();
    private readonly bindings = new WeakMap<
        DomSnapshot,
        Map<DomNodeId, {deref(): Node | undefined}>
    >();

    private nextId = 0;

    /** Синхронное чтение light DOM одного document без изменения страницы. */
    public build(
        root: Element = this.document.body,
        overrides: Partial<DomSnapshotOptions> = {},
    ): DomSnapshot {
        const view = this.document.defaultView;

        if (!view || root?.ownerDocument !== this.document || !root.isConnected) {
            throw new Error(
                'DOM capture requires a connected element in the injected browser document.',
            );
        }

        const options = {...this.defaults, ...overrides};

        this.validateOptions(options);

        const bindings = new Map<DomNodeId, {deref(): Node | undefined}>();
        const snapshot = new DomCapture(root, options, this.analyzer, (node) => {
            const id = this.idFor(node);

            // Старые браузеры удерживают узел только пока жив сам снимок в WeakMap.

            const reference =
                // eslint-disable-next-line compat/compat -- Ветка защищена проверкой typeof; ниже есть запасной вариант.
                typeof WeakRef === 'undefined' ? {deref: () => node} : new WeakRef(node);

            bindings.set(id, reference);

            return id;
        }).capture();

        this.bindings.set(snapshot, bindings);

        return snapshot;
    }

    /** Живые привязки есть только у оригинальных снимков этого builder; у JSON-копий их нет. */
    public resolveElement(snapshot: DomSnapshot, id: DomNodeId): Element | null {
        const node = this.bindings.get(snapshot)?.get(id)?.deref();

        return node?.nodeType === 1 &&
            node.isConnected &&
            node.ownerDocument === this.document
            ? (node as Element)
            : null;
    }

    public validateOptions(options: DomSnapshotOptions): void {
        if (
            !Number.isInteger(options.maxDepth) ||
            options.maxDepth < 0 ||
            options.maxDepth > 100 ||
            !Number.isInteger(options.maxNodes) ||
            options.maxNodes < 1
        ) {
            throw new Error(
                'maxDepth must be an integer from 0 to 100; maxNodes must be a positive integer.',
            );
        }

        if (options.ignoreSelector) {
            this.document.documentElement.matches(options.ignoreSelector);
        }

        if (options.boundarySelector) {
            this.document.documentElement.matches(options.boundarySelector);
        }
    }

    private idFor(node: Node): DomNodeId {
        let id = this.ids.get(node);

        if (!id) {
            id = `n${++this.nextId}`;
            this.ids.set(node, id);
        }

        return id;
    }
}
