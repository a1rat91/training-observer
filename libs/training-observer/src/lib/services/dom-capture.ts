import {type DomElementSnapshot, type DomNodeId, type DomNodeSnapshot, type DomSnapshot} from '../models/dom-snapshot';
import {type DomSnapshotOptions} from '../tokens/dom-snapshot-options';
import {type DomElementAnalyzer} from './dom-element-analyzer';
import {DomGeometry} from './dom-geometry';
import {findPopupRoots} from './dom-popup-roots';
import {isScrollDecoration} from './dom-scroll-decoration';

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'svg']);

/** Created for one synchronous capture. The main tree and all portals share limits and geometry. */
export class DomCapture {
    private readonly nodes: Record<DomNodeId, DomNodeSnapshot> = {};
    private readonly interactiveIds: DomNodeId[] = [];
    private readonly limits = new Set<'maxDepth' | 'maxNodes'>();
    private readonly view: Window;
    private readonly geometry: DomGeometry;
    private readonly started: number;
    private readonly capturedAt: string;
    private nodeCount = 0;
    private elementCount = 0;
    private textCount = 0;
    private boundaryCount = 0;

    constructor(
        private readonly root: Element,
        private readonly options: DomSnapshotOptions,
        private readonly analyzer: DomElementAnalyzer,
        private readonly idFor: (node: Node) => DomNodeId,
    ) {
        this.view = root.ownerDocument.defaultView!;
        this.started = this.view.performance.now();
        this.capturedAt = new Date().toISOString();
        this.geometry = new DomGeometry(this.view);
    }

    capture(): DomSnapshot {
        const ignored = this.options.ignoreSelector && this.root.closest(this.options.ignoreSelector);
        const rootId = ignored ? null : this.visit(this.root, null, this.rootPath(this.root), 0);
        const relatedRootIds: DomNodeId[] = [];

        for (const element of findPopupRoots(this.root, Object.values(this.nodes), this.options)) {
            const id = this.visit(element, null, this.rootPath(element), 0);
            if (id) relatedRootIds.push(id);
        }

        return {
            schemaVersion: 1,
            capturedAt: this.capturedAt,
            rootId,
            relatedRootIds,
            nodes: this.nodes,
            interactiveIds: this.interactiveIds,
            durationMs: this.view.performance.now() - this.started,
            stats: {
                nodeCount: this.nodeCount,
                elementCount: this.elementCount,
                textCount: this.textCount,
                boundaryCount: this.boundaryCount,
                truncated: this.limits.size > 0,
                limitsReached: [...this.limits],
            },
        };
    }

    private visit(node: Node, parentId: DomNodeId | null, path: string, depth: number): DomNodeId | null {
        if (node.nodeType !== 1 && node.nodeType !== 3) return null;
        // Preserve check order: even a subsequently excluded node can reach the capture limit.
        if (depth > this.options.maxDepth) {
            this.limits.add('maxDepth');
            return null;
        }
        if (this.nodeCount >= this.options.maxNodes) {
            this.limits.add('maxNodes');
            return null;
        }

        if (node.nodeType === 3) return this.captureText(node as Text, parentId);
        const element = node as Element;
        if (this.excludesElement(element)) return null;

        return this.captureElement(element, parentId, path, depth);
    }

    private captureText(node: Text, parentId: DomNodeId | null): DomNodeId | null {
        const text = node.textContent?.trim();
        if (!this.options.includeText || !text) return null;
        const id = this.idFor(node);

        this.nodes[id] = {kind: 'text', id, parentId, text, visible: this.geometry.textVisible(node)};
        this.nodeCount++;
        this.textCount++;

        return id;
    }

    private excludesElement(element: Element): boolean {
        if (element !== this.root && this.options.boundarySelector && element.matches(this.options.boundarySelector)) return true;
        if (isScrollDecoration(element) || SKIP_TAGS.has(element.localName)) return true;

        return Boolean(this.options.ignoreSelector && element.matches(this.options.ignoreSelector));
    }

    private captureElement(element: Element, parentId: DomNodeId | null, path: string, depth: number): DomNodeId {
        const id = this.idFor(element);
        const children: DomNodeId[] = [];
        const state = this.analyzer.state(element);
        const interactionReasons = this.analyzer.interactionReasons(element, this.geometry, this.options.cursorHeuristics);
        const interactive = interactionReasons.length > 0;
        const visible = this.geometry.visible(element);
        const inViewport = this.geometry.inViewport(element);
        const hitTest = interactive ? this.geometry.hitTest(element) : 'not-tested';
        const boundaries: ('iframe' | 'open-shadow-root')[] = [];
        if (element.localName === 'iframe') boundaries.push('iframe');
        if (element.shadowRoot) boundaries.push('open-shadow-root');

        const data: DomElementSnapshot = {
            kind: 'element', id, parentId, tagName: element.localName, path,
            attributes: this.analyzer.attributes(element), label: this.analyzer.label(element),
            children, rects: this.geometry.serializeRects(element), visible, inViewport, hitTest,
            interactive, interactionReasons, state, boundaries,
            pointerActionable: interactive && visible && inViewport && hitTest === 'hit' && !state.disabled && !state.inert,
        };

        this.nodes[id] = data;
        this.nodeCount++;
        this.elementCount++;
        this.boundaryCount += boundaries.length;
        if (interactive) this.interactiveIds.push(id);

        this.captureChildren(element, id, path, depth, children);

        return id;
    }

    private captureChildren(
        element: Element,
        parentId: DomNodeId,
        path: string,
        depth: number,
        children: DomNodeId[],
    ): void {
        // A hidden or boxless wrapper can contain visible controls; do not prune its subtree.
        const positions = new Map<string, number>();
        for (const child of Array.from(element.childNodes)) {
            let childPath = path;
            if (child.nodeType === 1) {
                const tag = (child as Element).localName;
                const position = (positions.get(tag) ?? 0) + 1;
                positions.set(tag, position);
                childPath = `${path}/${tag}[${position}]`;
            }

            const childId = this.visit(child, parentId, childPath, depth + 1);
            if (childId) children.push(childId);
            if (this.limits.has('maxNodes')) break;
        }
    }

    private rootPath(root: Element): string {
        const parts: string[] = [];
        for (let current: Element | null = root; current; current = current.parentElement) {
            let position = 1;
            for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
                if (sibling.localName === current.localName) position++;
            }
            parts.unshift(`${current.localName}[${position}]`);
        }

        return `/${parts.join('/')}`;
    }
}
