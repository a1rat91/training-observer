import {type DomSnapshot} from '../models/dom-snapshot';
import {type DomObservationOptions} from '../tokens/dom-observation-options';
import {type DomElementAnalyzer} from './dom-element-analyzer';
import {isScrollDecoration, SCROLL_DECORATION_SELECTOR} from './dom-scroll-decoration';
import {type DomObservationScope} from './dom-observation-scope';
import {resolveRelatedRoots} from './snapshot-references';

import {isObserverUi, isObserverUiMutation} from './dom-observer-ui';

const PROPERTY_CONTROLS = 'input,textarea,select,option';
export const PAGE_EVENTS = [
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

type SessionSources =
    | {readonly mode: 'standalone'}
    | {readonly mode: 'shared'; readonly scope: DomObservationScope};

interface SessionCallbacks {
    readonly onEdit?: (event: Event) => void;
    readonly onFocusOut?: (event: FocusEvent) => void;
    readonly captureAndPublish: () => DomSnapshot;
    readonly onError: (error: unknown) => void;
}

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
    private callbacks: SessionCallbacks | null = null;
    private readonly scope: DomObservationScope | undefined;

    constructor(
        private readonly root: Element,
        private readonly options: DomObservationOptions,
        private readonly analyzer: DomElementAnalyzer,
        private readonly sources: SessionSources,
    ) {
        this.document = root.ownerDocument;
        this.view = this.document.defaultView!;
        this.scope = sources.mode === 'shared' ? sources.scope : undefined;
    }

    start(snapshot: DomSnapshot, callbacks: SessionCallbacks): void {
        this.callbacks = callbacks;
        this.acceptSnapshot(snapshot);
        if (this.sources.mode === 'standalone') this.connectOwnSources();
    }

    handleMutations(records: readonly MutationRecord[]): void {
        if (!this.root.isConnected) {
            this.schedule();
            return;
        }

        const relevant = records.some((record) =>
            (!this.scope || this.scope.acceptsMutation(record)) && this.isRelevantMutation(record));
        if (relevant) this.schedule();
    }

    handleEvent(event: Event): void {
        if (event.type === 'transitionend' &&
            DECORATIVE_TRANSITION_PROPERTIES.has((event as TransitionEvent).propertyName)) return;
        const target = event.target as Node | null;
        if (target && this.scope && !this.scope.acceptsEvent(target, event.type)) return;
        if (target && (isObserverUi(target) || isScrollDecoration(target) || this.excludedAncestor(target))) return;

        if (event.type === 'input' || event.type === 'reset') this.callbacks?.onEdit?.(event);

        if (event.type === 'focusout') {
            try {
                this.callbacks?.onFocusOut?.(event as FocusEvent);
            } catch (error: unknown) {
                this.callbacks?.onError(error);
                return;
            }
        }
        this.schedule();
    }

    invalidate(): void {
        this.schedule();
    }

    /** Explicit boundary used after rendering a Stop action; preserves the session's root and options. */
    flush(): void {
        if (this.batchTimer !== null) this.view.clearTimeout(this.batchTimer);
        this.capturePendingChanges();
    }

    checkProperties(): void {
        if (this.disposed || this.options.propertyCheckIntervalMs === 0) return;
        try {
            const next = this.readProperties();
            const changed = next.size !== this.propertyStates.size ||
                [...next].some(([element, value]) => this.propertyStates.get(element) !== value);
            this.propertyStates = next;
            if (changed || !this.root.isConnected) this.schedule();
        } catch (error: unknown) {
            this.callbacks?.onError(error);
        }
    }

    /** Resets polling after a manual capture without changing this session's scope or portals. */
    resetPropertyBaseline(): void {
        if (this.disposed || this.options.propertyCheckIntervalMs === 0) return;
        this.propertyStates = this.readProperties();
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
        this.callbacks = null;
    }

    private connectOwnSources(): void {
        this.mutationObserver = new this.view.MutationObserver((records) => this.handleMutations(records));
        // Ancestor styles, external labels and overlays can affect even a scoped snapshot.
        this.mutationObserver.observe(this.document, {subtree: true, childList: true, attributes: true, characterData: true});

        for (const name of PAGE_EVENTS) {
            this.listen(this.document, name, (event) => this.handleEvent(event));
        }

        // Scroll alone is not a learning action. Virtualization/lazy loading is observed
        // through resulting DOM mutations; geometry can be refreshed by an explicit capture.
        this.listen(this.view, 'resize', () => this.schedule());

        if (this.options.propertyCheckIntervalMs > 0) {
            this.propertyTimer = this.view.setInterval(() => this.checkProperties(), this.options.propertyCheckIntervalMs);
        }
    }

    /** Dependencies must stay current even when native property polling is disabled. */
    private acceptSnapshot(snapshot: DomSnapshot): void {
        this.scope?.update(snapshot);
        if (this.disposed || this.options.propertyCheckIntervalMs === 0) return;

        this.relatedRoots = resolveRelatedRoots(snapshot, this.document);
        this.resetPropertyBaseline();
    }

    private schedule(): void {
        if (this.disposed || this.batchTimer !== null) {
            return;
        }

        this.batchTimer = this.view.setTimeout(() => this.capturePendingChanges(), this.options.batchDelayMs);
    }

    private capturePendingChanges(): void {
        this.batchTimer = null;
        const callbacks = this.callbacks;
        if (this.disposed || !callbacks) return;

        try {
            if (!this.root.isConnected) {
                throw new Error('The observed root was removed from the document. Start observation on a new root.');
            }

            const snapshot = callbacks.captureAndPublish();
            this.acceptSnapshot(snapshot);
        } catch (error: unknown) {
            callbacks.onError(error);
        }
    }

    private listen(target: EventTarget, name: string, listener: EventListener): void {
        target.addEventListener(name, listener, {capture: true, passive: true});
        this.cleanups.push(() => target.removeEventListener(name, listener, true));
    }

    private isRelevantMutation(record: MutationRecord): boolean {
        // Thumb position/size, hover transitions and track lifecycle are presentation only.
        if (isObserverUiMutation(record) || isScrollDecoration(record.target)) {
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
                !isObserverUi(node) && !isScrollDecoration(node) && !this.excludedAncestor(node));
            // A removed node may already have been moved inside an excluded subtree when this
            // callback runs. Its current ancestors must not hide removal from the observed parent.
            const removed = Array.from(record.removedNodes).some((node) =>
                !isObserverUi(node) && !(node.nodeType === 1 &&
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
            if ((!this.scope || this.scope.owns(element)) && !isObserverUi(element) && !isScrollDecoration(element) && !this.excludedAncestor(element)) {
                result.set(element, JSON.stringify(this.analyzer.state(element)));
            }
        }

        return result;
    }
}
