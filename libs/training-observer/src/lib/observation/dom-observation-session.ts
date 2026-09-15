/** Ресурсы одного browser-сеанса: listeners, MutationObserver, таймеры и polling свойств. Объединяет изменения и освобождает всё в dispose. */
import {DestroyRef, inject, Injectable} from '@angular/core';
import {type ControlSnapshot, type DomSnapshot} from '@training-observer/core/models';
import {Subject} from 'rxjs';

import {DomElementAnalyzer} from '../capture/dom-element-analyzer';
import {
    isScrollDecoration,
    SCROLL_DECORATION_SELECTOR,
} from '../capture/dom-scroll-decoration';
import {DomSnapshotBuilder} from '../capture/dom-snapshot-builder';
import {resolveRelatedRoots} from '../capture/snapshot-references';
import {ControlSnapshotBuilder} from '../controls/control-snapshot-builder';
import {BlurConfirmation} from './blur-confirmation';
import {DomObservationScope} from './dom-observation-scope';
import {isObserverUi, isObserverUiMutation} from './dom-observer-ui';
import {SESSION_CONTEXT, SessionSourceMode} from './session-context';

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

export interface SessionSnapshot {
    readonly snapshot: DomSnapshot;
    readonly controls: readonly ControlSnapshot[];
    readonly confirmedControls: Readonly<Record<string, ControlSnapshot>>;
}

/** Browser-ресурсы одного цикла start/stop. Создаются вне Angular zone. */
@Injectable()
export class DomObservationSession {
    private readonly context = inject(SESSION_CONTEXT);
    private readonly root = this.context.root;
    private readonly options = this.context.options;
    private readonly analyzer = inject(DomElementAnalyzer);
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly controlBuilder = inject(ControlSnapshotBuilder);
    private readonly confirmations = inject(BlurConfirmation);
    private readonly snapshots = new Subject<SessionSnapshot>();
    private readonly failures = new Subject<unknown>();
    private current: SessionSnapshot | null = null;
    private readonly document: Document;
    private readonly view: Window & typeof globalThis;
    private readonly cleanups: Array<() => void> = [];
    private mutationObserver: MutationObserver | null = null;
    private batchTimer: number | null = null;
    private propertyTimer: number | null = null;
    private propertyStates = new Map<Element, string>();
    private relatedRoots: Element[] = [];
    private disposed = false;
    private readonly scope: DomObservationScope | undefined;

    public readonly snapshots$ = this.snapshots.asObservable();
    public readonly errors$ = this.failures.asObservable();

    constructor() {
        this.document = this.root.ownerDocument;
        this.view = this.document.defaultView!;
        this.scope = new DomObservationScope(
            this.root,
            this.options.ignoreSelector,
            this.options.boundarySelector ?? '',
        );
        inject(DestroyRef).onDestroy(() => this.dispose());
    }

    public start(snapshot: DomSnapshot): SessionSnapshot {
        if (this.disposed || this.current) {
            throw new Error('Create a new session for each start.');
        }

        const result = this.project(snapshot);

        this.acceptSnapshot(snapshot);

        if (this.context.mode === SessionSourceMode.Standalone) {
            this.connectOwnSources();
        }

        return result;
    }

    /** Подготовка результата синхронна: blur подтверждается до публикации, без effect или scheduler. */
    public project(snapshot: DomSnapshot): SessionSnapshot {
        const controls = this.controlBuilder.build(snapshot);
        const confirmedControls = this.confirmations.settle(
            snapshot,
            controls,
            this.current?.confirmedControls ?? {},
        );

        this.current = {snapshot, controls, confirmedControls};

        return this.current;
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
                (this.context.mode === SessionSourceMode.Standalone ||
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
                    this.excludedAncestor(target))) ||
            this.disposed
        ) {
            return;
        }

        // Только одиночный фасад публикует blur-подтверждения; shared-области сохраняют прежний контракт снимков.
        if (this.current && this.context.mode === SessionSourceMode.Standalone) {
            try {
                if (event.type === 'input' || event.type === 'reset') {
                    this.confirmations.onEdit(
                        event,
                        this.current.snapshot,
                        this.current.controls,
                    );
                }

                if (event.type === 'focusout') {
                    this.confirmations.onFocusOut(
                        event as FocusEvent,
                        this.current.snapshot,
                        this.current.controls,
                        this.context,
                    );
                }
            } catch (error: unknown) {
                this.failures.next(error);

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
            this.failures.next(error);
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
        this.current = null;
        this.confirmations.reset();
        this.snapshots.complete();
        this.failures.complete();
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

        if (this.disposed || !this.current) {
            return;
        }

        try {
            if (!this.root.isConnected) {
                throw new Error(
                    'The observed root was removed from the document. Start observation on a new root.',
                );
            }

            const snapshot = this.builder.build(this.root, this.options);

            this.snapshots.next(this.project(snapshot));

            this.acceptSnapshot(snapshot);
        } catch (error: unknown) {
            this.failures.next(error);
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
