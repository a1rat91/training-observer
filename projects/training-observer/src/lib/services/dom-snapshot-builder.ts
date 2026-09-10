import {DOCUMENT} from '@angular/common';
import {inject, Injectable} from '@angular/core';

import {type DomElementSnapshot, type DomNodeId, type DomNodeSnapshot, type DomSnapshot} from '../models/dom-snapshot';
import {DOM_SNAPSHOT_OPTIONS, type DomSnapshotOptions} from '../tokens/dom-snapshot-options';
import {DomElementAnalyzer} from './dom-element-analyzer';
import {DomGeometry} from './dom-geometry';
import {isScrollDecoration} from './dom-scroll-decoration';

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'svg']);
const POPUP_ROLES = new Set(['true', 'menu', 'listbox', 'tree', 'grid', 'dialog']);

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

        const started = view.performance.now();
        const capturedAt = new Date().toISOString();
        const geometry = new DomGeometry(view);
        const nodes: Record<DomNodeId, DomNodeSnapshot> = {};
        const interactiveIds: DomNodeId[] = [];
        const limits = new Set<'maxDepth' | 'maxNodes'>();
        let nodeCount = 0;
        let elementCount = 0;
        let textCount = 0;
        let boundaryCount = 0;

        const visit = (node: Node, parentId: DomNodeId | null, path: string, depth: number): DomNodeId | null => {
            if (node.nodeType !== 1 && node.nodeType !== 3) {
                return null;
            }

            if (depth > options.maxDepth) {
                limits.add('maxDepth');

                return null;
            }

            if (nodeCount >= options.maxNodes) {
                limits.add('maxNodes');

                return null;
            }

            if (node.nodeType === 3) {
                const text = node.textContent?.trim();

                if (!options.includeText || !text) {
                    return null;
                }

                const id = this.idFor(node);

                nodes[id] = {kind: 'text', id, parentId, text, visible: geometry.textVisible(node as Text)};
                nodeCount++;
                textCount++;

                return id;
            }

            const element = node as Element;

            if (isScrollDecoration(element) || SKIP_TAGS.has(element.localName) ||
                (options.ignoreSelector && element.matches(options.ignoreSelector))) {
                return null;
            }

            const id = this.idFor(element);
            const children: DomNodeId[] = [];
            const state = this.analyzer.state(element);
            const interactionReasons = this.analyzer.interactionReasons(element, geometry, options.cursorHeuristics);
            const interactive = interactionReasons.length > 0;
            const visible = geometry.visible(element);
            const inViewport = geometry.inViewport(element);
            const hitTest = interactive ? geometry.hitTest(element) : 'not-tested';
            const boundaries: ('iframe' | 'open-shadow-root')[] = [];

            if (element.localName === 'iframe') {
                boundaries.push('iframe');
            }

            if (element.shadowRoot) {
                boundaries.push('open-shadow-root');
            }

            const data: DomElementSnapshot = {
                kind: 'element', id, parentId, tagName: element.localName, path,
                attributes: this.analyzer.attributes(element), label: this.analyzer.label(element),
                children, rects: geometry.serializeRects(element), visible, inViewport, hitTest,
                interactive, interactionReasons, state, boundaries,
                pointerActionable: interactive && visible && inViewport && hitTest === 'hit' && !state.disabled && !state.inert,
            };

            nodes[id] = data;
            nodeCount++;
            elementCount++;
            boundaryCount += boundaries.length;

            if (interactive) {
                interactiveIds.push(id);
            }

            // Never prune a subtree just because its wrapper is hidden or has no box.
            // A display:contents wrapper, for example, can contain visible controls.
            const positions = new Map<string, number>();

            for (const child of Array.from(element.childNodes)) {
                let childPath = path;

                if (child.nodeType === 1) {
                    const tag = (child as Element).localName;
                    const position = (positions.get(tag) ?? 0) + 1;

                    positions.set(tag, position);
                    childPath = `${path}/${tag}[${position}]`;
                }

                const childId = visit(child, id, childPath, depth + 1);

                if (childId) {
                    children.push(childId);
                }

                if (limits.has('maxNodes')) {
                    break;
                }
            }

            return id;
        };

        const rootId = options.ignoreSelector && root.closest(options.ignoreSelector) ? null :
            visit(root, null, this.rootPath(root), 0);

        // Portals are not descendants of the form. Follow only explicit links from captured,
        // open popup controls; never guess an owner from focus, timing or the nearest dropdown.
        const relatedRootIds: DomNodeId[] = [];
        const linked = new Set<Element>();
        for (const node of Object.values(nodes)) {
            if (node.kind !== 'element' || node.attributes['aria-expanded'] !== 'true' ||
                !POPUP_ROLES.has(node.attributes['aria-haspopup'])) continue;
            for (const id of (node.attributes['aria-controls'] ?? '').trim().split(/\s+/)) {
                const element = this.document.getElementById(id);
                if (element && !root.contains(element) && !element.contains(root) &&
                    !(options.ignoreSelector && element.closest(options.ignoreSelector)) && !isScrollDecoration(element)) {
                    linked.add(element);
                }
            }
        }
        // If two references overlap, capture the outer root once so parent links stay consistent.
        for (const element of linked) {
            if ([...linked].some((other) => other !== element && other.contains(element))) continue;
            const id = visit(element, null, this.rootPath(element), 0);
            if (id) relatedRootIds.push(id);
        }

        return {
            schemaVersion: 1, capturedAt, rootId, relatedRootIds, nodes, interactiveIds,
            durationMs: view.performance.now() - started,
            stats: {nodeCount, elementCount, textCount, boundaryCount, truncated: limits.size > 0, limitsReached: [...limits]},
        };
    }

    private idFor(node: Node): DomNodeId {
        let id = this.ids.get(node);

        if (!id) {
            id = `n${++this.nextId}`;
            this.ids.set(node, id);
        }

        return id;
    }

    private rootPath(root: Element): string {
        const parts: string[] = [];

        for (let current: Element | null = root; current; current = current.parentElement) {
            const tag = current.localName;
            let position = 1;

            for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
                if (sibling.localName === tag) {
                    position++;
                }
            }

            parts.unshift(`${tag}[${position}]`);
        }

        return `/${parts.join('/')}`;
    }

    private validateOptions(options: DomSnapshotOptions): void {
        if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 100 ||
            !Number.isInteger(options.maxNodes) || options.maxNodes < 1) {
            throw new Error('maxDepth must be an integer from 0 to 100; maxNodes must be a positive integer.');
        }

        if (options.ignoreSelector) {
            this.document.documentElement.matches(options.ignoreSelector);
        }
    }
}
