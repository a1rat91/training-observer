/**
 * ElementRecorder — записывает подтверждённые действия и изменения состояния внутри переданного DOM-root.
 * Алгоритм: создаёт inventory и descriptors, принимает capture events, сопоставляет intent с контролом,
 * подтверждает input/select через DOM-значение и сохраняет действия отдельно от фоновых state updates.
 * Мутации и sampling properties обновляют inventory; dropdown требует доказанного owner.
 * Stop снимает listeners/observer/timer. Angular model, HTTP payload и setters не используются.
 */
import {
    type CapturedValue,
    type ElementDescriptor,
    type ObservedState,
    type RecorderDiagnostic,
    type Recording,
    type SemanticAction,
    serializeRecording,
    type ValuePolicy,
} from '../contracts';
import {
    accessibleName,
    CONTROLS,
    describe,
    editable,
    features,
    flags,
    normalize,
    readValue,
    selection,
} from './dom';

type ActionPayload = {
    [K in SemanticAction['kind']]: Omit<
        Extract<SemanticAction, {kind: K}>,
        'id' | 'sequence' | 'timeMs'
    >;
}[SemanticAction['kind']];

interface Tracked {
    element: Element;
    descriptor: ElementDescriptor;
    stateSignature: string;
    committed: string;
    composing: boolean;
    dirty: boolean;
}

interface PendingInput {
    intentToken?: unknown;
    target: Tracked;
    value: CapturedValue;
    trigger: 'change' | 'input';
    trusted: boolean;
    deadline: number;
    commit: 'blur' | 'change' | 'idle';
}

interface PendingSelection {
    intentToken?: unknown;
    target: Tracked;
    before: string;
    expected: string;
    trusted: boolean;
    trigger: 'keyboard' | 'pointer';
    deadline: number;
}
export interface RecorderOptions {
    valuePolicy: ValuePolicy;
    inputIdleMs?: number;
    pollMs?: number;
    onUpdate?(): void;
    /** Synchronous semantic intent; Element is ephemeral and never serialized. */
    onAction?(
        action: SemanticAction,
        target: Element | null,
        intentToken?: unknown,
    ): void;
    /** Pre-handler identity proof for delayed commits and controls removed by their own handler. */
    onIntent?(event: Event, target: Element): unknown;
    /** Explicit test/instrumented-event mode. The browser panel never enables this. */
    acceptUntrustedEvents?: boolean;
}

/** DOM-only recording. No Angular state, HTTP bodies, target attributes or patched setters. */
export class ElementRecorder {
    private readonly document: Document;
    private readonly tracked = new Map<Element, Tracked>();
    private readonly syntheticClicks = new WeakSet<Element>();
    private readonly cleanup: Array<() => void> = [];
    private observer?: MutationObserver;
    private pending?: PendingInput;
    private choice?: PendingSelection;
    private notification?: ReturnType<typeof setTimeout>;
    private startedAt = 0;
    private descriptorSequence = 0;
    private generation = 0;
    private size = 0;
    private lastPath = '';
    private report!: Recording;

    public running = false;

    constructor(
        private readonly root: HTMLElement,
        private readonly options: RecorderOptions,
    ) {
        this.document = root.ownerDocument;
        this.reset();
    }

    public start(): void {
        if (this.running) {
            return;
        }

        this.reset();
        this.running = true;
        this.startedAt = performance.now();
        this.lastPath = this.document.location.pathname;
        const listener = (event: Event): void => this.observe(event);

        for (const type of [
            'click',
            'keydown',
            'input',
            'change',
            'blur',
            'compositionstart',
            'compositionend',
        ]) {
            this.document.addEventListener(type, listener, true);
            this.cleanup.push(() =>
                this.document.removeEventListener(type, listener, true),
            );
        }

        this.observer = new MutationObserver(() => {
            if (this.running) {
                this.reconcile('mutation');
            }
        });
        this.observer.observe(this.root, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        const interval = setInterval(() => {
            if (!this.running) {
                return;
            }

            this.reconcile('property-observer');
            this.confirmChoice();

            if (
                this.pending &&
                !this.pending.target.composing &&
                performance.now() >= this.pending.deadline
            ) {
                this.flush();
            }

            this.navigation();
        }, this.options.pollMs ?? 100);

        this.cleanup.push(() => clearInterval(interval));
        this.reconcile('snapshot');
        this.notify();
    }

    public stop(): void {
        if (!this.running) {
            return;
        }

        this.confirmChoice();

        if (this.choice) {
            this.diagnostic(
                'unconfirmed-selection',
                'Запись остановлена до подтверждения выбора dropdown.',
            );
        }

        this.flush();
        this.navigation();
        this.reconcile('property-observer');
        this.shutdown();
        this.options.onUpdate?.();
    }

    public snapshot(): Recording {
        return JSON.parse(JSON.stringify(this.report)) as Recording;
    }

    public export(): string {
        return serializeRecording(this.report);
    }

    private reset(): void {
        this.generation++;
        this.tracked.clear();
        this.pending = undefined;
        this.choice = undefined;
        this.descriptorSequence = 0;
        this.size = 0;
        this.report = {
            kind: 'training-recording',
            version: 2,
            id: `recording-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            mode: {kind: 'dom-only'},
            valuePolicy: JSON.parse(
                JSON.stringify(this.options.valuePolicy),
            ) as ValuePolicy,
            descriptors: [],
            actions: [],
            states: [],
            diagnostics: [],
        };
    }

    private shutdown(): void {
        this.running = false;
        this.generation++;
        this.observer?.disconnect();
        this.cleanup.splice(0).forEach((dispose) => dispose());
        clearTimeout(this.notification);
        this.notification = undefined;
        this.pending = undefined;
        this.choice = undefined;
        this.tracked.clear();
    }

    private time(): number {
        return Math.max(0, Math.round(performance.now() - this.startedAt));
    }

    private reserve(value: unknown): boolean {
        const size = JSON.stringify(value).length + 1;

        if (
            this.size + size > 900000 ||
            this.report.descriptors.length >= 500 ||
            this.report.actions.length >= 1000 ||
            this.report.states.length >= 5000
        ) {
            this.diagnostic(
                'capacity-reached',
                'Достигнут лимит записи. Сохранены только предшествующие события.',
            );
            this.shutdown();
            this.options.onUpdate?.();

            return false;
        }

        this.size += size;

        return true;
    }

    private diagnostic(code: RecorderDiagnostic['code'], message: string): void {
        if (
            this.report.diagnostics!.length < 100 &&
            !this.report.diagnostics!.some(
                (entry) => entry.code === code && entry.message === message,
            )
        ) {
            this.report.diagnostics!.push({timeMs: this.time(), code, message});
            this.notify();
        }
    }

    private notify(): void {
        if (this.notification !== undefined) {
            return;
        }

        this.notification = setTimeout(() => {
            this.notification = undefined;
            this.options.onUpdate?.();
        }, 50);
    }

    private track(element: Element, refresh = false): Tracked | undefined {
        const existing = this.tracked.get(element);

        if (existing) {
            const unchanged =
                !refresh ||
                (JSON.stringify(features(element, this.root)) ===
                    JSON.stringify(existing.descriptor.fingerprint.features) &&
                    existing.descriptor.scope.pathname ===
                        this.document.location.pathname);

            if (unchanged) {
                return existing;
            }

            if (this.pending?.target === existing) {
                this.flush();
            }

            this.tracked.delete(element);
        }

        try {
            const descriptor = describe(
                element,
                this.root,
                `target-${++this.descriptorSequence}`,
            );

            if (!this.reserve(descriptor)) {
                return undefined;
            }

            const target: Tracked = {
                element,
                descriptor,
                stateSignature: '',
                committed: JSON.stringify(readValue(element, this.options.valuePolicy)),
                composing: false,
                dirty: false,
            };

            this.report.descriptors.push(descriptor);
            this.tracked.set(element, target);

            return target;
        } catch {
            this.diagnostic(
                'unsupported-control',
                'Не удалось сохранить проверяемые признаки одного из контролов.',
            );

            return undefined;
        }
    }

    private reconcile(source: ObservedState['source']): void {
        for (const element of this.root.querySelectorAll(CONTROLS)) {
            if (!this.running) {
                return;
            }

            if (!element.closest('[aria-hidden="true"],script,style')) {
                this.track(element);
            }
        }

        for (const target of this.tracked.values()) {
            if (!this.running) {
                return;
            }

            this.state(target, source);

            if (!target.element.isConnected || !this.root.contains(target.element)) {
                if (this.pending?.target === target) {
                    this.flush();
                }

                this.tracked.delete(target.element);
            }
        }
    }

    private state(target: Tracked, source: ObservedState['source']): void {
        const state = {
            ...flags(target.element),
            value: readValue(target.element, this.options.valuePolicy),
        };

        const signature = JSON.stringify(state);

        if (signature === target.stateSignature) {
            return;
        }

        const entry: ObservedState = {
            targetId: target.descriptor.id,
            timeMs: this.time(),
            source,
            ...state,
        };

        if (!this.reserve(entry)) {
            return;
        }

        target.stateSignature = signature;
        this.report.states.push(entry);
        this.notify();
    }

    private emit(action: ActionPayload, intentToken?: unknown): void {
        if (!this.running) {
            return;
        }

        // Confirm an earlier popup intent before emitting any later action.
        this.confirmChoice();

        if (this.choice) {
            this.diagnostic(
                'unconfirmed-selection',
                'Следующее действие началось до подтверждения выбора dropdown. Выбор не включён в последовательность.',
            );
            this.choice = undefined;
        }

        const sequence = this.report.actions.length + 1;
        const entry: SemanticAction = {
            ...action,
            id: `action-${sequence}`,
            sequence,
            timeMs: this.time(),
        };

        if (!this.reserve(entry)) {
            return;
        }

        this.report.actions.push(entry);
        const target =
            'targetId' in entry
                ? (Array.from(this.tracked.values()).find(
                      (item) => item.descriptor.id === entry.targetId,
                  )?.element ?? null)
                : null;

        this.options.onAction?.(
            JSON.parse(JSON.stringify(entry)) as SemanticAction,
            target,
            intentToken,
        );

        if (this.running) {
            this.notify();
        }
    }

    private flush(): void {
        const pending = this.pending;

        this.pending = undefined;

        if (!pending) {
            return;
        }

        if (pending.target.composing) {
            this.diagnostic(
                'composition-cancelled',
                'Незавершённый IME-ввод сохранён только как состояние.',
            );

            return;
        }

        const signature = JSON.stringify(pending.value);

        if (
            pending.value.status === 'captured' &&
            signature === pending.target.committed
        ) {
            pending.target.dirty = false;

            return;
        }

        pending.target.committed = signature;
        pending.target.dirty = false;
        this.emit(
            {
                kind: 'input',
                targetId: pending.target.descriptor.id,
                commit: pending.commit,
                value: pending.value,
                evidence: {trigger: pending.trigger, trusted: pending.trusted},
            },
            pending.intentToken,
        );
    }

    private byId(id: string): Element | null {
        // IDs are transient ownership evidence; never persisted as locators.
        // eslint-disable-next-line unicorn/prefer-query-selector
        return this.document.getElementById(id);
    }

    private owners(element: Element): Element[] {
        return Array.from(
            this.root.querySelectorAll('[aria-controls],[aria-owns]'),
        ).filter((owner) => {
            const ids =
                `${owner.getAttribute('aria-controls') ?? ''} ${owner.getAttribute('aria-owns') ?? ''}`
                    .trim()
                    .split(/\s+/);

            return ids.some((id) => id && this.byId(id)?.contains(element));
        });
    }

    private choose(option: Element, event: Event): void {
        const owners = this.owners(option);

        if (owners.length !== 1) {
            this.diagnostic(
                owners.length ? 'ambiguous-owner' : 'unsupported-control',
                'Dropdown не имеет единственного доказанного владельца через aria-controls/aria-owns.',
            );

            return;
        }

        const owner = owners[0]!;
        const target = this.track(owner, true);

        if (!target) {
            return;
        }

        this.flush();
        const intentToken = this.options.onIntent?.(event, owner);

        this.choice = {
            intentToken,
            target,
            before: JSON.stringify(
                readValue(owner, {...this.options.valuePolicy, mode: 'capture'}),
            ),
            expected: accessibleName(option),
            trusted: event.isTrusted,
            trigger:
                event.type === 'keydown' ||
                (event instanceof MouseEvent && event.detail === 0)
                    ? 'keyboard'
                    : 'pointer',
            deadline: performance.now() + 1000,
        };
        this.afterEvent(() => this.confirmChoice());
    }

    private confirmChoice(): void {
        const choice = this.choice;

        if (!choice) {
            return;
        }

        if (!choice.target.element.isConnected) {
            this.choice = undefined;
            this.diagnostic(
                'unconfirmed-selection',
                'Владелец dropdown исчез до подтверждения выбора.',
            );

            return;
        }

        const proof = readValue(choice.target.element, {
            ...this.options.valuePolicy,
            mode: 'capture',
        });

        if (
            JSON.stringify(proof) !== choice.before &&
            proof.status === 'captured' &&
            typeof proof.raw === 'string' &&
            normalize(proof.raw) === choice.expected
        ) {
            this.choice = undefined;
            const value = readValue(choice.target.element, this.options.valuePolicy);

            choice.target.committed = JSON.stringify(value);
            this.state(choice.target, 'property-observer');
            this.emit(
                {
                    kind: 'select',
                    targetId: choice.target.descriptor.id,
                    commit: 'confirmed-selection',
                    value,
                    evidence: {trigger: choice.trigger, trusted: choice.trusted},
                },
                choice.intentToken,
            );
        } else if (performance.now() >= choice.deadline) {
            this.choice = undefined;

            if (
                proof.status !== 'captured' ||
                typeof proof.raw !== 'string' ||
                normalize(proof.raw) !== choice.expected
            ) {
                this.diagnostic(
                    'unconfirmed-selection',
                    'Выбор option не подтверждён наблюдаемым значением владельца.',
                );
            }
        }
    }

    private afterEvent(callback: () => void): void {
        const generation = this.generation;

        queueMicrotask(() => {
            if (this.running && generation === this.generation) {
                callback();
            }
        });
    }

    private observe(event: Event): void {
        if (!this.running) {
            return;
        }

        const path = event
            .composedPath()
            .filter((node): node is Element => node instanceof Element);

        const option = path.find((node) => node.matches('[role="option"]'));

        if (
            option &&
            (event.type === 'click' ||
                (event instanceof KeyboardEvent && [' ', 'Enter'].includes(event.key)))
        ) {
            if (event.isTrusted || this.options.acceptUntrustedEvents) {
                this.choose(option, event);
            }

            return;
        }

        const element = path.find(
            (node) => this.root.contains(node) && node.matches(CONTROLS),
        );

        if (!element) {
            return;
        }

        if (element.getRootNode() !== this.document) {
            this.diagnostic(
                'unsupported-control',
                'Shadow DOM требует отдельного адаптера.',
            );

            return;
        }

        const target = this.track(element, true);

        if (!target) {
            return;
        }

        this.state(target, 'native-event');

        // element.click() can dispatch trusted native input/change as its default action.
        // Those secondary events still originate from a programmatic click.
        if (!this.options.acceptUntrustedEvents) {
            if (event.type === 'click' && !event.isTrusted) {
                this.syntheticClicks.add(element);
                queueMicrotask(() => {
                    this.syntheticClicks.delete(element);
                });
            }

            if (this.syntheticClicks.has(element)) {
                return;
            }
        }

        if (
            (!event.isTrusted && !this.options.acceptUntrustedEvents) ||
            !flags(element).enabled ||
            !flags(element).visible
        ) {
            return;
        }

        // Commit earlier interactions before proving the incoming intent's scenario step.
        this.confirmChoice();

        if (
            this.pending &&
            this.pending.target !== target &&
            ['change', 'click', 'compositionend', 'compositionstart', 'input'].includes(
                event.type,
            )
        ) {
            this.flush();
        }

        const intentToken = this.options.onIntent?.(event, element);

        if (event.type === 'compositionstart') {
            target.composing = true;

            return;
        }

        if (event.type === 'compositionend') {
            target.composing = false;
            target.dirty = true;
            this.input(target, event, intentToken);

            return;
        }

        if (event.type === 'keydown') {
            const keyboard = event as KeyboardEvent;

            if (element.matches('[role="combobox"]') && keyboard.key === 'Enter') {
                const active = this.byId(
                    element.getAttribute('aria-activedescendant') ?? '',
                );

                if (active?.matches('[role="option"]')) {
                    this.choose(active, event);
                }
            }

            return;
        }

        if (event.type === 'click') {
            if (!editable(element)) {
                this.flush();
                this.emit(
                    {
                        kind: 'click',
                        targetId: target.descriptor.id,
                        evidence: {
                            trigger:
                                (event as MouseEvent).detail === 0
                                    ? 'keyboard'
                                    : 'pointer',
                            trusted: event.isTrusted,
                        },
                    },
                    intentToken,
                );
            }

            return;
        }

        if (event.type === 'blur') {
            if (this.pending?.target === target && !target.composing) {
                this.pending.commit = 'blur';
                const pending = this.pending;

                this.afterEvent(() => {
                    if (this.pending === pending) {
                        this.flush();
                    }
                });
            }

            return;
        }

        if (!editable(element)) {
            return;
        }

        if (selection(element)) {
            if (event.type !== 'change') {
                return;
            }

            if (this.choice?.target === target) {
                this.confirmChoice();

                return;
            }

            this.flush();
            const value = readValue(element, this.options.valuePolicy);

            if (
                value.status === 'captured' &&
                JSON.stringify(value) === target.committed
            ) {
                return;
            }

            target.committed = JSON.stringify(value);
            this.emit(
                {
                    kind: 'select',
                    targetId: target.descriptor.id,
                    commit: 'change',
                    value,
                    evidence: {trigger: 'change', trusted: event.isTrusted},
                },
                intentToken,
            );
        } else if (event.type === 'input' || event.type === 'change') {
            if (event.type === 'input') {
                target.dirty = true;
            }

            this.input(target, event, intentToken);
        }
    }

    private input(target: Tracked, event: Event, intentToken?: unknown): void {
        if (this.pending && this.pending.target !== target) {
            this.flush();
        }

        const value = readValue(target.element, this.options.valuePolicy);

        if (
            event.type === 'change' &&
            !target.dirty &&
            JSON.stringify(value) === target.committed
        ) {
            return;
        }

        const pending: PendingInput = {
            intentToken,
            target,
            value,
            trusted: event.isTrusted,
            trigger: event.type === 'change' ? 'change' : 'input',
            commit: event.type === 'change' ? 'change' : 'idle',
            deadline: performance.now() + (this.options.inputIdleMs ?? 400),
        };

        this.pending = pending;
        this.afterEvent(() => {
            if (this.pending !== pending) {
                return;
            }

            // Sample synchronous formatting in this event turn, not arbitrary later backend updates.
            pending.value = readValue(target.element, this.options.valuePolicy);
            this.state(target, 'native-event');

            if (event.type === 'change' && !target.composing) {
                this.flush();
            }
        });
    }

    private navigation(): void {
        const pathname = this.document.location.pathname;

        if (pathname === this.lastPath) {
            return;
        }

        this.flush();
        this.lastPath = pathname;
        this.emit({
            kind: 'navigation',
            pathname,
            evidence: {trigger: 'navigation', trusted: null},
        });
    }
}
