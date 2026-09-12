/**
 * ElementRecorder — записывает подтверждённые действия и изменения состояния внутри переданного DOM-root.
 * Алгоритм: создаёт inventory и descriptors, принимает capture events, сопоставляет intent с контролом,
 * подтверждает текст только после blur, select — после изменения/выбора через DOM-значение.
 * Действия сохраняются отдельно от фоновых state updates.
 * Мутации и sampling properties обновляют inventory; dropdown требует доказанного owner.
 * AreaRegistry ограничивает inventory/values и поколения pending действий; EventHub разделяет capture listeners.
 * Stop освобождает подписку, observers и timer. Angular model, HTTP payload и setters не используются.
 */
import {type AreaRegistry} from '../areas';
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
import {DocumentEventHub} from '../observation/event-hub';
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
import {sameInputValue} from './input-value';

type ActionPayload = {
    [K in SemanticAction['kind']]: Omit<
        Extract<SemanticAction, {kind: K}>,
        'id' | 'sequence' | 'timeMs'
    >;
}[SemanticAction['kind']];

interface Tracked {
    area?: {key: string; generation: number};
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
    blurred: boolean;
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
    /** Optional area boundary. Registry lifecycle belongs to the observation session. */
    areas?: AreaRegistry;
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
    private readonly observers = new Map<Element, MutationObserver>();
    private readonly targetAreas = new Map<string, string>();
    private synchronizing = false;
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

    /** Черновик не является действием; runtime не завершает сценарий до его подтверждения. */
    public get hasUncommittedInput(): boolean {
        return !!this.pending;
    }

    public start(): void {
        if (this.running) {
            return;
        }

        this.reset();
        this.running = true;
        this.startedAt = performance.now();
        this.lastPath = this.document.location.pathname;
        this.cleanup.push(
            DocumentEventHub.forDocument(this.document).subscribe((event) =>
                this.observe(event),
            ),
        );

        if (this.options.areas) {
            this.cleanup.push(this.options.areas.subscribe(() => this.syncAreas()));
        }

        this.syncAreas();
        const interval = setInterval(() => {
            if (!this.running) {
                return;
            }

            this.reconcile('property-observer');
            this.confirmChoice();

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

        this.commitBlurredInput();
        this.cancelInput('Запись остановлена до выхода из поля.');
        this.navigation();
        this.reconcile('property-observer');
        this.shutdown();
        this.options.onUpdate?.();
    }

    public snapshot(): Recording {
        const report = JSON.parse(JSON.stringify(this.report)) as Recording;

        if (!this.options.areas) {
            return report;
        }

        const targets = [...this.targetAreas].map(([targetId, areaKey]) => ({
            targetId,
            areaKey,
        }));

        return {
            ...report,
            version: 3,
            areas: {
                definitions: this.options.areas.definitions().map((definition) => ({
                    ...definition,
                    observe:
                        definition.observe ||
                        targets.some((target) => target.areaKey === definition.key),
                })),
                targets,
            },
        };
    }

    public export(): string {
        return serializeRecording(this.snapshot());
    }

    public areaForTarget(id: string): string | undefined {
        return this.targetAreas.get(id);
    }

    private reset(): void {
        this.generation++;
        this.tracked.clear();
        this.pending = undefined;
        this.choice = undefined;
        this.targetAreas.clear();
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

        for (const observer of this.observers.values()) {
            observer.disconnect();
        }

        this.observers.clear();
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

    private roots(): Element[] {
        const areas = this.options.areas;

        return areas
            ? areas
                  .snapshots()
                  .filter((area) => area.observe && area.status === 'resolved')
                  .map((area) => areas.root(area.key))
                  .filter((root): root is Element => !!root && this.root.contains(root))
            : [this.root];
    }

    private accepts(element: Element): boolean {
        return (
            this.root.contains(element) &&
            (!this.options.areas || this.options.areas.owner(element).status === 'owned')
        );
    }

    private current(target: Tracked): boolean {
        if (!this.options.areas) {
            return true;
        }

        const owner = this.options.areas.owner(target.element);

        return (
            owner.status === 'owned' &&
            owner.area.key === target.area?.key &&
            owner.area.generation === target.area.generation
        );
    }

    private discard(target: Tracked): void {
        if (!target.element.isConnected) {
            const state: ObservedState = {
                targetId: target.descriptor.id,
                timeMs: this.time(),
                source: 'mutation',
                connected: false,
                visible: null,
                enabled: null,
                readOnly: null,
                value: {status: 'unavailable', reason: 'detached'},
            };

            if (this.reserve(state)) {
                this.report.states.push(state);
                this.notify();
            }
        }

        if (this.pending?.target === target || this.choice?.target === target) {
            this.diagnostic(
                'unsupported-control',
                'Неподтверждённое действие отменено: область выключена или её экземпляр изменился.',
            );
        }

        if (this.pending?.target === target) {
            this.pending = undefined;
        }

        if (this.choice?.target === target) {
            this.choice = undefined;
        }

        this.tracked.delete(target.element);
    }

    private syncAreas(): void {
        if (!this.running || this.synchronizing) {
            return;
        }

        this.synchronizing = true;

        try {
            for (const target of this.tracked.values()) {
                if (!this.current(target)) {
                    this.discard(target);
                }
            }

            for (const observer of this.observers.values()) {
                observer.disconnect();
            }

            this.observers.clear();

            for (const root of this.roots()) {
                const observer = new MutationObserver((records) => {
                    if (
                        this.running &&
                        records.some(
                            (record) =>
                                record.target.nodeType !== 1 ||
                                this.accepts(record.target as Element),
                        )
                    ) {
                        this.reconcile('mutation');
                    }
                });

                observer.observe(root, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    characterData: true,
                });
                this.observers.set(root, observer);
            }

            this.reconcile('snapshot');
        } finally {
            this.synchronizing = false;
        }
    }

    private track(element: Element, refresh = false): Tracked | undefined {
        if (!this.accepts(element)) {
            return undefined;
        }

        const owner = this.options.areas?.owner(element);
        const area =
            owner?.status === 'owned'
                ? {key: owner.area.key, generation: owner.area.generation}
                : undefined;

        const contextRoot = area ? this.options.areas!.root(area.key)! : this.root;
        let existing = this.tracked.get(element);

        if (existing && !this.current(existing)) {
            this.discard(existing);
            existing = undefined;
        }

        if (existing) {
            const unchanged =
                !refresh ||
                (JSON.stringify(features(element, contextRoot)) ===
                    JSON.stringify(existing.descriptor.fingerprint.features) &&
                    existing.descriptor.scope.pathname ===
                        this.document.location.pathname);

            if (unchanged) {
                return existing;
            }

            if (this.pending?.target === existing) {
                this.cancelInput('Описание поля изменилось до выхода из него.');
            }

            this.tracked.delete(element);
        }

        try {
            const descriptor = describe(
                element,
                contextRoot,
                `target-${++this.descriptorSequence}`,
                CONTROLS,
                (candidate) => !area || this.options.areas!.accepts(area.key, candidate),
            );

            if (!this.reserve(descriptor)) {
                return undefined;
            }

            if (area) {
                this.targetAreas.set(descriptor.id, area.key);
            }

            const target: Tracked = {
                area,
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
        const elements = new Set(
            this.roots().flatMap((root) => [...root.querySelectorAll(CONTROLS)]),
        );

        for (const element of elements) {
            if (!this.running) {
                return;
            }

            if (
                this.accepts(element) &&
                !element.closest('[aria-hidden="true"],script,style')
            ) {
                this.track(element);
            }
        }

        for (const target of this.tracked.values()) {
            if (!this.running) {
                return;
            }

            if (!this.current(target)) {
                this.discard(target);
                continue;
            }

            this.state(target, source);

            if (!target.element.isConnected || !this.root.contains(target.element)) {
                if (this.pending?.target === target) {
                    this.cancelInput('Поле удалено до выхода из него.');
                }

                this.tracked.delete(target.element);
            }
        }
    }

    private state(target: Tracked, source: ObservedState['source']): void {
        if (!this.current(target)) {
            return;
        }

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

    private commitBlurredInput(): void {
        const pending = this.pending;

        if (!pending?.blurred) {
            return;
        }

        this.pending = undefined;

        if (!this.current(pending.target)) {
            this.discard(pending.target);

            return;
        }

        if (pending.target.composing) {
            this.diagnostic(
                'composition-cancelled',
                'Незавершённый IME-ввод сохранён только как состояние.',
            );

            return;
        }

        if (pending.target.element.isConnected) {
            pending.value = readValue(pending.target.element, this.options.valuePolicy);
            this.state(pending.target, 'native-event');
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
                commit: 'blur',
                value: pending.value,
                evidence: {trigger: pending.trigger, trusted: pending.trusted},
            },
            pending.intentToken,
        );
    }

    private cancelInput(message: string): void {
        if (!this.pending) {
            return;
        }

        const composing = this.pending.target.composing;

        this.pending.target.dirty = false;
        this.pending = undefined;
        this.diagnostic(
            composing ? 'composition-cancelled' : 'unsupported-control',
            composing ? 'Незавершённый IME-ввод сохранён только как состояние.' : message,
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

        this.commitBlurredInput();

        // Confirmed option selection supersedes the search draft in this same combobox.
        if (this.pending?.target === target) {
            this.pending = undefined;
        }

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

        if (!this.current(choice.target)) {
            this.discard(choice.target);

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

        if (path[0] && !this.accepts(path[0])) {
            return;
        }

        const element = path.find((node) => this.accepts(node) && node.matches(CONTROLS));

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

        // Only an actual blur can confirm text before proving the next action's intent.
        this.confirmChoice();

        if (
            this.pending &&
            this.pending.target !== target &&
            ['change', 'click', 'compositionend', 'compositionstart', 'input'].includes(
                event.type,
            )
        ) {
            this.commitBlurredInput();
        }

        const intentToken = this.options.onIntent?.(event, element);

        if (event.type === 'compositionstart') {
            target.composing = true;

            return;
        }

        if (event.type === 'compositionend') {
            target.composing = false;

            if (this.pending?.target === target) {
                this.input(target, event, intentToken);
            }

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
                this.commitBlurredInput();
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
            const pending = this.pending;

            if (pending?.target === target) {
                if (target.composing) {
                    this.cancelInput('Незавершённый IME-ввод.');

                    return;
                }

                if (
                    !sameInputValue(
                        readValue(element, this.options.valuePolicy),
                        pending.value,
                    )
                ) {
                    this.cancelInput(
                        'Значение поля изменено без input до выхода из него.',
                    );

                    return;
                }

                pending.blurred = true;
                this.afterEvent(() => {
                    if (this.pending === pending && this.current(target)) {
                        this.commitBlurredInput();
                    }
                });
            }

            return;
        }

        if (!editable(element)) {
            return;
        }

        if (element.matches('[role="combobox"]')) {
            if (this.choice?.target === target) {
                this.confirmChoice();
            } else if (
                event.type === 'input' ||
                (event.type === 'change' && this.pending?.target === target)
            ) {
                if (!flags(element).readOnly) {
                    this.input(target, event, intentToken);
                }
            }

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

            this.commitBlurredInput();
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
        this.commitBlurredInput();

        if (this.pending && this.pending.target !== target) {
            this.cancelInput('Начат ввод в другом поле без подтверждения предыдущего.');
        }

        const value = readValue(target.element, this.options.valuePolicy);

        if (
            event.type === 'change' &&
            this.pending?.target === target &&
            !sameInputValue(value, this.pending.value)
        ) {
            this.cancelInput('Значение поля изменено без input до выхода из него.');

            return;
        }

        if (
            event.type === 'change' &&
            !target.dirty &&
            JSON.stringify(value) === target.committed
        ) {
            return;
        }

        const pending: PendingInput = {
            intentToken:
                event.type !== 'input' && this.pending?.target === target
                    ? this.pending.intentToken
                    : intentToken,
            target,
            value,
            trusted: event.isTrusted,
            trigger: event.type === 'change' ? 'change' : 'input',
            blurred: false,
        };

        this.pending = pending;
        this.afterEvent(() => {
            if (this.pending !== pending || !this.current(target)) {
                return;
            }

            // Sample synchronous formatting in this event turn, not arbitrary later backend updates.
            pending.value = readValue(target.element, this.options.valuePolicy);
            this.state(target, 'native-event');
        });
    }

    private navigation(): void {
        const pathname = this.document.location.pathname;

        if (pathname === this.lastPath) {
            return;
        }

        this.commitBlurredInput();
        this.cancelInput('Навигация произошла до выхода из поля.');
        this.lastPath = pathname;
        this.emit({
            kind: 'navigation',
            pathname,
            evidence: {trigger: 'navigation', trusted: null},
        });
    }
}
