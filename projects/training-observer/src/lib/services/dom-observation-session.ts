import {type DomSnapshot} from '../models/dom-snapshot';
import {type DomObservationOptions} from '../tokens/dom-observation-options';
import {type DomElementAnalyzer} from './dom-element-analyzer';
import {isScrollDecoration, SCROLL_DECORATION_SELECTOR} from './dom-scroll-decoration';

const PROPERTY_CONTROLS = 'input,textarea,select,option';
const PAGE_EVENTS = [
    'input', 'change', 'reset', 'toggle', 'focusin', 'focusout',
    'load', 'transitionend', 'animationend',
];
// These transitions change decoration, not the state/geometry represented by our snapshot.
// Keep unknown properties, opacity, visibility and layout transitions: they may reveal controls.
const DECORATIVE_TRANSITION_PROPERTIES = new Set([
    'color', 'background-color', 'border-color',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-block-color', 'border-block-start-color', 'border-block-end-color',
    'border-inline-color', 'border-inline-start-color', 'border-inline-end-color',
    'outline-color', 'text-decoration-color', 'text-emphasis-color', 'column-rule-color',
    'caret-color', 'box-shadow', 'text-shadow',
]);

/** Browser resources owned by a single start()/stop() cycle. Created outside Angular's zone. */
export class DomObservationSession {
    private readonly document: Document;
    private readonly view: Window & typeof globalThis;
    private readonly cleanups: (() => void)[] = [];
    private mutationObserver: MutationObserver | null = null;
    private batchTimer: number | null = null;
    private propertyTimer: number | null = null;
    private propertyStates = new Map<Element, string>();
    private relatedRoots: Element[] = [];
    private disposed = false;

    constructor(
        private readonly root: Element,
        private readonly options: DomObservationOptions,
        private readonly analyzer: DomElementAnalyzer,
        private readonly onChange: () => DomSnapshot,
        private readonly onError: (error: unknown) => void,
    ) {
        this.document = root.ownerDocument;
        this.view = this.document.defaultView!;
    }

    start(snapshot: DomSnapshot): void {
        this.refreshProperties(snapshot);
        this.mutationObserver = new this.view.MutationObserver((records) => {
            if (!this.root.isConnected || records.some((record) => this.isRelevantMutation(record))) {
                this.schedule();
            }
        });
        // Ancestor styles, external labels and overlays can affect even a scoped snapshot.
        this.mutationObserver.observe(this.document, {subtree: true, childList: true, attributes: true, characterData: true});

        for (const name of PAGE_EVENTS) {
            this.listen(this.document, name, (event) => {
                if (event.type === 'transitionend' &&
                    DECORATIVE_TRANSITION_PROPERTIES.has((event as TransitionEvent).propertyName)) {
                    return;
                }

                const target = event.target as Node | null;

                if (!target || (!isScrollDecoration(target) && !this.excludedAncestor(target))) {
                    this.schedule();
                }
            });
        }

        // Scroll alone is not a learning action. Virtualization/lazy loading is observed
        // through resulting DOM mutations; geometry can be refreshed by an explicit capture.
        this.listen(this.view, 'resize', () => this.schedule());

        if (this.options.propertyCheckIntervalMs > 0) {
            this.propertyTimer = this.view.setInterval(() => {
                if (this.disposed) {
                    return;
                }

                try {
                    const next = this.readProperties();
                    const changed = next.size !== this.propertyStates.size ||
                        [...next].some(([element, value]) => this.propertyStates.get(element) !== value);

                    this.propertyStates = next;

                    if (changed || !this.root.isConnected) {
                        this.schedule();
                    }
                } catch (error: unknown) {
                    this.onError(error);
                }
            }, this.options.propertyCheckIntervalMs);
        }
    }

    refreshProperties(snapshot?: DomSnapshot): void {
        if (!this.disposed && this.options.propertyCheckIntervalMs > 0) {
            if (snapshot) {
                // Reconcile only portals captured for this session, not arbitrary document inputs.
                this.relatedRoots = (snapshot.relatedRootIds ?? []).flatMap((id) => {
                    const node = snapshot.nodes[id];
                    const domId = node?.kind === 'element' ? node.attributes['id'] : undefined;
                    const element = domId ? this.document.getElementById(domId) : null;

                    return element ? [element] : [];
                });
            }
            this.propertyStates = this.readProperties();
        }
    }

    dispose(): void {
        this.disposed = true;
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;

        if (this.batchTimer !== null) {
            this.view.clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.propertyTimer !== null) {
            this.view.clearInterval(this.propertyTimer);
            this.propertyTimer = null;
        }

        for (const cleanup of this.cleanups.splice(0)) {
            cleanup();
        }

        this.propertyStates.clear();
        this.relatedRoots = [];
    }

    private schedule(): void {
        if (this.disposed || this.batchTimer !== null) {
            return;
        }

        this.batchTimer = this.view.setTimeout(() => {
            this.batchTimer = null;

            if (this.disposed) {
                return;
            }

            try {
                if (!this.root.isConnected) {
                    throw new Error('The observed root was removed from the document. Start observation on a new root.');
                }

                this.refreshProperties(this.onChange());
            } catch (error: unknown) {
                this.onError(error);
            }
        }, this.options.batchDelayMs);
    }

    private listen(target: EventTarget, name: string, listener: EventListener): void {
        target.addEventListener(name, listener, {capture: true, passive: true});
        this.cleanups.push(() => target.removeEventListener(name, listener, true));
    }

    private isRelevantMutation(record: MutationRecord): boolean {
        // Thumb position/size, hover transitions and track lifecycle are presentation only.
        if (isScrollDecoration(record.target)) {
            return false;
        }

        const excluded = this.excludedAncestor(record.target);

        if (excluded) {
            // Changing the boundary itself can make previously captured content excluded.
            // Descendant UI updates (including the inspector JSON) must not feed back into capture.
            return record.type === 'attributes' && record.target === excluded;
        }

        if (record.type === 'childList') {
            const added = Array.from(record.addedNodes).some((node) =>
                !isScrollDecoration(node) && !this.excludedAncestor(node));
            // A removed node may already have been moved inside an excluded subtree when this
            // callback runs. Its current ancestors must not hide removal from the observed parent.
            const removed = Array.from(record.removedNodes).some((node) =>
                !(node.nodeType === 1 &&
                    ((node as Element).matches(SCROLL_DECORATION_SELECTOR) ||
                        (this.options.ignoreSelector && (node as Element).matches(this.options.ignoreSelector)))));

            return added || removed;
        }

        return true;
    }

    private excludedAncestor(node: Node): Element | null {
        const element = node.nodeType === 1 ? node as Element : node.parentElement;

        return this.options.ignoreSelector ? element?.closest(this.options.ignoreSelector) ?? null : null;
    }

    private readProperties(): Map<Element, string> {
        const result = new Map<Element, string>();
        const controls = new Set<Element>();

        for (const root of [this.root, ...this.relatedRoots]) {
            if (!root.isConnected) continue;
            if (root.matches(PROPERTY_CONTROLS)) controls.add(root);
            root.querySelectorAll(PROPERTY_CONTROLS).forEach((element) => controls.add(element));
        }

        for (const element of controls) {
            if (!isScrollDecoration(element) && !this.excludedAncestor(element)) {
                result.set(element, JSON.stringify(this.analyzer.state(element)));
            }
        }

        return result;
    }
}
