/** Ресурсы одного browser-сеанса: listeners, MutationObserver, таймеры и polling свойств. Объединяет изменения и освобождает всё в dispose. */
import {type DomSnapshot} from '@training-observer/core/models';

import {type DomElementAnalyzer} from '../capture/dom-element-analyzer';
import {
    isScrollDecoration,
    SCROLL_DECORATION_SELECTOR,
} from '../capture/dom-scroll-decoration';
import {resolveRelatedRoots} from '../capture/snapshot-references';
import {type DomObservationOptions} from '../tokens/dom-observation-options';
import {DomObservationScope} from './dom-observation-scope';
import {isObserverUi, isObserverUiMutation} from './dom-observer-ui';

const PROPERTY_CONTROLS = 'input,textarea,select,option';

export const PAGE_EVENTS = [
    'input',
    'change',
    'reset',
    'toggle',
    'focusin',
    'focusout',
    'load',
    'transitionend',
    'animationend',
];
// Эти переходы меняют декорацию, а не представленное в снимке состояние или геометрию.
// Неизвестные свойства, opacity, visibility и изменения раскладки учитываются: они могут показать контролы.
const DECORATIVE_TRANSITION_PROPERTIES = new Set([
    'background-color',
    'border-block-color',
    'border-block-end-color',
    'border-block-start-color',
    'border-bottom-color',
    'border-color',
    'border-inline-color',
    'border-inline-end-color',
    'border-inline-start-color',
    'border-left-color',
    'border-right-color',
    'border-top-color',
    'box-shadow',
    'caret-color',
    'color',
    'column-rule-color',
    'outline-color',
    'text-decoration-color',
    'text-emphasis-color',
    'text-shadow',
]);

type SessionSources =
    | {readonly mode: 'shared'; readonly scope: DomObservationScope}
    | {readonly mode: 'standalone'};

interface SessionCallbacks {
    onEdit?(event: Event): void;
    onFocusOut?(event: FocusEvent): void;
    captureAndPublish(): DomSnapshot;
    onError(error: unknown): void;
}

/** Browser-ресурсы одного цикла start/stop. Создаются вне Angular zone. */
export class DomObservationSession {
    private readonly document: Document;
    private readonly view: Window & typeof globalThis;
    private readonly cleanups: Array<() => void> = [];
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
        this.scope =
            sources.mode === 'shared'
                ? sources.scope
                : new DomObservationScope(
                      root,
                      options.ignoreSelector,
                      options.boundarySelector ?? '',
                  );
    }

    public start(snapshot: DomSnapshot, callbacks: SessionCallbacks): void {
        this.callbacks = callbacks;
        this.acceptSnapshot(snapshot);

        if (this.sources.mode === 'standalone') {
            this.connectOwnSources();
        }
    }

    public handleMutations(records: readonly MutationRecord[]): void {
        if (!this.root.isConnected) {
            this.schedule();

            return;
        }

        const relevant = records.some(
            (record) =>
                // В одиночном режиме несвязанный внешний overlay тоже может перекрыть область.
                // Shared-режим сохраняет изоляцию областей и требует refresh для внешней геометрии.
                (this.sources.mode === 'standalone' ||
                    !this.scope ||
                    this.scope.acceptsMutation(record)) &&
                this.isRelevantMutation(record),
        );

        if (relevant) {
            this.schedule();
        }
    }

    public handleEvent(event: Event): void {
        if (
            event.type === 'transitionend' &&
            DECORATIVE_TRANSITION_PROPERTIES.has((event as TransitionEvent).propertyName)
        ) {
            return;
        }

        const target = event.target as Node | null;

        if (
            (target && this.scope && !this.scope.acceptsEvent(target, event.type)) ||
            (target &&
                (isObserverUi(target) ||
                    isScrollDecoration(target) ||
                    this.excludedAncestor(target)))
        ) {
            return;
        }

        if (event.type === 'input' || event.type === 'reset') {
            this.callbacks?.onEdit?.(event);
        }

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

    public invalidate(): void {
        this.schedule();
    }

    /** Явная граница после рендера действия Stop; root и options сеанса сохраняются. */
    public flush(): void {
        if (this.batchTimer !== null) {
            this.view.clearTimeout(this.batchTimer);
        }

        this.capturePendingChanges();
    }

    public checkProperties(): void {
        if (this.disposed || this.options.propertyCheckIntervalMs === 0) {
            return;
        }

        try {
            const next = this.readProperties();
            const changed =
                next.size !== this.propertyStates.size ||
                [...next].some(
                    ([element, value]) => this.propertyStates.get(element) !== value,
                );

            this.propertyStates = next;

            if (changed || !this.root.isConnected) {
                this.schedule();
            }
        } catch (error: unknown) {
            this.callbacks?.onError(error);
        }
    }

    /** Обновляет baseline polling после ручного capture, не меняя область или popup сеанса. */
    public resetPropertyBaseline(): void {
        if (this.disposed || this.options.propertyCheckIntervalMs === 0) {
            return;
        }

        this.propertyStates = this.readProperties();
    }

    public dispose(): void {
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
        this.mutationObserver = new this.view.MutationObserver((records) =>
            this.handleMutations(records),
        );
        // Стили предков, внешние подписи и перекрытия могут влиять даже на снимок ограниченной области.
        this.mutationObserver.observe(this.document, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });

        for (const name of PAGE_EVENTS) {
            this.listen(this.document, name, (event) => this.handleEvent(event));
        }

        // Сам scroll не меняет наблюдаемое состояние. Виртуализация и отложенная загрузка обнаруживаются
        // по результирующим DOM-изменениям; геометрию можно обновить явным capture.
        this.listen(this.view, 'resize', () => this.schedule());

        if (this.options.propertyCheckIntervalMs > 0) {
            this.propertyTimer = this.view.setInterval(
                () => this.checkProperties(),
                this.options.propertyCheckIntervalMs,
            );
        }
    }

    /** Зависимости должны обновляться даже при отключённой проверке native-свойств. */
    private acceptSnapshot(snapshot: DomSnapshot): void {
        this.scope?.update(snapshot);

        if (this.disposed || this.options.propertyCheckIntervalMs === 0) {
            return;
        }

        this.relatedRoots = resolveRelatedRoots(snapshot, this.document);
        this.resetPropertyBaseline();
    }

    private schedule(): void {
        if (this.disposed || this.batchTimer !== null) {
            return;
        }

        this.batchTimer = this.view.setTimeout(
            () => this.capturePendingChanges(),
            this.options.batchDelayMs,
        );
    }

    private capturePendingChanges(): void {
        this.batchTimer = null;
        const callbacks = this.callbacks;

        if (this.disposed || !callbacks) {
            return;
        }

        try {
            if (!this.root.isConnected) {
                throw new Error(
                    'The observed root was removed from the document. Start observation on a new root.',
                );
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
        // Положение ползунка, hover и жизненный цикл трека относятся только к представлению.
        if (isObserverUiMutation(record) || isScrollDecoration(record.target)) {
            return false;
        }

        const excluded = this.excludedAncestor(record.target);

        if (excluded) {
            // Изменение самой границы может исключить ранее захваченное содержимое.
            // Изменения UI потомков, включая JSON инспектора, не должны повторно запускать capture.
            return record.type === 'attributes' && record.target === excluded;
        }

        if (record.type === 'childList') {
            const added = Array.from(record.addedNodes).some(
                (node) =>
                    !isObserverUi(node) &&
                    !isScrollDecoration(node) &&
                    !this.excludedAncestor(node),
            );
            // К моменту callback удалённый узел уже может находиться в исключённом поддереве.
            // Новые предки узла не должны скрывать факт удаления из наблюдаемого родителя.
            const removed = Array.from(record.removedNodes).some((node) => {
                if (isObserverUi(node)) {
                    return false;
                }

                if (node.nodeType !== 1) {
                    return true;
                }

                const element = node as Element;

                return element.matches(SCROLL_DECORATION_SELECTOR)
                    ? false
                    : !this.options.ignoreSelector ||
                          !element.matches(this.options.ignoreSelector);
            });

            return added || removed;
        }

        return true;
    }

    private excludedAncestor(node: Node): Element | null {
        const element = node.nodeType === 1 ? (node as Element) : node.parentElement;

        return this.options.ignoreSelector
            ? (element?.closest(this.options.ignoreSelector) ?? null)
            : null;
    }

    private readProperties(): Map<Element, string> {
        const result = new Map<Element, string>();
        const controls = new Set<Element>();

        for (const root of [this.root, ...this.relatedRoots]) {
            if (!root.isConnected) {
                continue;
            }

            if (root.matches(PROPERTY_CONTROLS)) {
                controls.add(root);
            }

            root.querySelectorAll(PROPERTY_CONTROLS).forEach((element) => {
                controls.add(element);
            });
        }

        for (const element of controls) {
            if (
                (!this.scope || this.scope.owns(element)) &&
                !isObserverUi(element) &&
                !isScrollDecoration(element) &&
                !this.excludedAncestor(element)
            ) {
                result.set(element, JSON.stringify(this.analyzer.state(element)));
            }
        }

        return result;
    }
}
