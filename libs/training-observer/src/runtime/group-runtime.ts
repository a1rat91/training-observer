/**
 * GroupRuntime проверяет независимые ожидания только активной группы.
 * Capture сохраняет кандидатов, поколения области/группы и разрешение перехода до обработчика приложения.
 * Commit выбирает единственное соответствие типа/значения. Условия полей перепроверяются; click-evidence
 * сохраняется после подтверждённого результата. Переход ждёт postcondition, не выводится из DOM-мутации.
 * Фоновая проверка использует цикл recorder без отдельного observer/timer; capture/commit синхронны.
 * Никаких знаний о маршрутах, компонентах или бизнес-действиях приложения здесь нет.
 */
import {createActor} from 'xstate';

import {
    type ElementDescriptor,
    type Expectation,
    type ExpectationGroup,
    type GroupedScenario,
    type GroupTransition,
    type SemanticAction,
} from '../contracts';
import {flags} from '../dom/identity';
import {ElementRecorder} from '../recording';
import {TargetResolver} from '../resolution';
import {Conditions, valueMatches} from './conditions';
import {
    type ExpectationSnapshot,
    machine,
    type RuntimeOptions,
    type RuntimeSnapshot,
} from './state';

type Job = Expectation | GroupTransition;

interface Stamp {
    key: string;
    generation: number;
}

interface Receipt {
    stamp?: Stamp;
    confirmed: boolean;
}

interface Intent {
    epoch: number;
    stamp?: Stamp;
    candidates: Array<{job: Job; permitted: boolean}>;
}

export class GroupRuntime {
    private readonly actor = createActor(machine);
    private readonly resolver: TargetResolver;
    private readonly conditions: Conditions;
    private readonly recorder: ElementRecorder;
    private readonly receipts = new Map<string, Receipt>();
    private readonly editing = new Set<string>();
    private readonly mismatches = new Set<string>();
    private readonly ambiguous = new Set<string>();
    private readonly skipped = new Set<string>();
    private readonly minted = new WeakSet();
    private group: ExpectationGroup;
    private states = new Map<string, ExpectationSnapshot['status']>();
    private entered = false;
    private active = false;
    private epoch = 0;
    private completed = 0;
    private message = '';
    private deadline = 0;
    private signature = '';
    private evaluating = false;
    private pending?: {jobs: GroupTransition[]; stamp?: Stamp};

    constructor(
        private readonly root: HTMLElement,
        private readonly scenario: GroupedScenario,
        private readonly options: RuntimeOptions,
    ) {
        if (scenario.mode.kind !== 'dom-only') {
            throw new Error('Shared adapter runtime не реализован.');
        }

        if (
            !Number.isFinite(options.timeoutMs ?? 15000) ||
            (options.timeoutMs ?? 15000) <= 0
        ) {
            throw new Error('Некорректный timeout.');
        }

        this.group = scenario.groups.find((entry) => entry.id === scenario.startGroupId)!;
        this.resolver = new TargetResolver(scenario, root, options, options.areas);
        this.conditions = new Conditions(scenario, root, options, options.areas);
        this.recorder = new ElementRecorder(root, {
            areas: options.areas,
            deduplicateInputs: false,
            valuePolicy: {
                mode: 'capture',
                sensitive: 'redact',
                normalizers: ['date-dmy-v1', 'decimal-comma-v1'],
            },
            acceptUntrustedEvents: options.acceptUntrustedEvents,
            onObservation: () => this.tick(),
            onIntent: (event, element) => this.capture(event, element),
            onAction: (action, _element, token) => this.accept(action, token),
        });
    }

    public start(): void {
        if (this.active || this.actor.getSnapshot().status === 'done') {
            return;
        }

        this.active = true;
        this.actor.start();
        this.resetDeadline();
        this.recorder.start();
        this.tick();
    }

    public stop(): void {
        if (!this.active) {
            return;
        }

        this.active = false;
        this.actor.send({type: 'STOP'});
        this.dispose();
        this.publish();
    }

    public retry(): void {
        if (!this.active) {
            return;
        }

        this.epoch++;
        this.pending = undefined;
        this.message = '';
        this.editing.clear();
        this.ambiguous.clear();
        this.resetDeadline();
        this.actor.send({type: 'WAIT'});
        this.tick();
    }

    public skip(id?: string): void {
        const expectation = this.group.expectations.find((entry) => entry.id === id);

        if (!this.active || !expectation?.optional) {
            return;
        }

        this.epoch++;
        this.skipped.add(expectation.id);
        this.receipts.delete(expectation.id);
        this.editing.delete(expectation.id);
        this.tick();
    }

    public snapshot(): RuntimeSnapshot {
        return {
            status: this.actor.getSnapshot().value as RuntimeSnapshot['status'],
            stepId: null,
            instruction: this.group.title,
            hint: null,
            optional: false,
            completedSteps:
                this.completed +
                [...this.states.values()].filter((value) => value === 'satisfied').length,
            message: this.message,
            resolution: null,
            uncommittedInput: this.recorder.hasUncommittedInput,
            groupId: this.group.id,
            groupTitle: this.group.title,
            expectations: this.group.expectations.map((entry) => ({
                id: entry.id,
                instruction: entry.instruction,
                hint: entry.hint,
                optional: entry.optional,
                status: this.states.get(entry.id) ?? 'waiting',
            })),
            transitions: this.group.transitions.map((entry) => ({
                id: entry.id,
                instruction: entry.instruction,
                ready: this.transitionAllowed(entry),
            })),
        };
    }

    private dispose(): void {
        this.epoch++;
        this.pending = undefined;
        this.recorder.stop();
        this.receipts.clear();
        this.editing.clear();
    }

    private resetDeadline(): void {
        this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
    }

    private descriptor(job: Job): ElementDescriptor | undefined {
        const action = job.action;

        return 'targetId' in action
            ? this.scenario.descriptors.find((entry) => entry.id === action.targetId)!
            : undefined;
    }

    private stamp(element: Element): Stamp | undefined {
        const owner = this.options.areas!.owner(element);

        return owner.status === 'owned'
            ? {key: owner.area.key, generation: owner.area.generation}
            : undefined;
    }

    private current(stamp?: Stamp): boolean {
        if (!stamp) {
            return true;
        }

        const area = this.options
            .areas!.snapshots()
            .find((entry) => entry.key === stamp.key);

        return (
            area?.status === 'resolved' &&
            area.observe &&
            area.generation === stamp.generation
        );
    }

    private available(job: Job): boolean {
        return !job.when || this.conditions.evaluate(job.when) === 'true';
    }

    private dependencies(job: Job): boolean {
        return job.requires.every((id) => this.states.get(id) === 'satisfied');
    }

    private requiredSatisfied(): boolean {
        return (
            this.entered &&
            this.group.expectations.every((entry) => {
                const status = this.states.get(entry.id);

                return entry.optional || status === 'inactive' || status === 'satisfied';
            })
        );
    }

    private transitionAllowed(job: GroupTransition, committingOwnInput = false): boolean {
        return (
            this.requiredSatisfied() &&
            this.dependencies(job) &&
            this.available(job) &&
            (!this.recorder.hasUncommittedInput || committingOwnInput)
        );
    }

    private refresh(): void {
        const states = new Map<string, ExpectationSnapshot['status']>();
        const status = (job: Expectation): ExpectationSnapshot['status'] => {
            const cached = states.get(job.id);

            if (cached) {
                return cached;
            }

            const save = (
                value: ExpectationSnapshot['status'],
            ): ExpectationSnapshot['status'] => {
                states.set(job.id, value);

                return value;
            };

            const when = job.when ? this.conditions.evaluate(job.when) : 'true';

            if (when !== 'true') {
                this.receipts.delete(job.id);

                return save(when === 'false' ? 'inactive' : 'waiting');
            }

            if (
                !job.requires.every(
                    (id) =>
                        status(
                            this.group.expectations.find((entry) => entry.id === id)!,
                        ) === 'satisfied',
                )
            ) {
                this.receipts.delete(job.id);

                return save('blocked');
            }

            if (this.skipped.has(job.id)) {
                return save('skipped');
            }

            const receipt = this.receipts.get(job.id);

            if (receipt && !this.current(receipt.stamp)) {
                this.receipts.delete(job.id);

                return save('waiting');
            }

            if (this.ambiguous.has(job.id)) {
                return save('ambiguous');
            }

            if (this.editing.has(job.id)) {
                return save('editing');
            }

            if (receipt) {
                if (receipt.confirmed && job.action.kind === 'click') {
                    return save('satisfied');
                }

                const result = this.conditions.evaluate(
                    'value' in job.action
                        ? {
                              kind: 'all',
                              conditions: [
                                  job.completion,
                                  {
                                      kind: 'value',
                                      targetId: job.action.targetId,
                                      condition: job.action.value,
                                  },
                              ],
                          }
                        : job.completion,
                );

                if (result === 'true') {
                    receipt.confirmed = true;

                    return save('satisfied');
                }

                if (receipt.confirmed) {
                    this.receipts.delete(job.id);
                    this.mismatches.add(job.id);
                } else {
                    return save('confirming');
                }
            }

            const descriptor = this.descriptor(job);

            if (!descriptor) {
                return save(this.mismatches.has(job.id) ? 'mismatch' : 'ready');
            }

            const resolution = this.resolver.resolve(descriptor);

            if (
                resolution.report.status === 'ambiguous' ||
                ['ambiguous', 'conflict'].includes(
                    this.resolver.areaStatus(descriptor.id),
                )
            ) {
                return save('ambiguous');
            }

            return !resolution.element ||
                (job.action.kind !== 'click' && flags(resolution.element).readOnly)
                ? save('waiting')
                : save(this.mismatches.has(job.id) ? 'mismatch' : 'ready');
        };

        this.group.expectations.forEach((job) => {
            status(job);
        });
        this.states = states;
    }

    private capture(event: Event, element: Element): Intent | undefined {
        if (
            !this.active ||
            ![
                'change',
                'click',
                'compositionend',
                'compositionstart',
                'input',
                'keydown',
            ].includes(event.type)
        ) {
            return;
        }

        const textEdit = ['compositionstart', 'input'].includes(event.type);

        if (textEdit) {
            this.pending = undefined;
            this.epoch++;
        } else {
            this.tick();
        }

        if (!this.entered) {
            this.entered = this.conditions.evaluate(this.group.entry) === 'true';
        }

        if (!this.entered || !this.active) {
            return;
        }

        const stamp = this.stamp(element);

        if (!stamp) {
            return;
        }

        const jobs = [...this.group.expectations, ...this.group.transitions].filter(
            (job) => {
                const descriptor = this.descriptor(job);

                return (
                    !!descriptor && this.resolver.resolve(descriptor).element === element
                );
            },
        );

        if (textEdit) {
            for (const job of jobs) {
                if (!('toGroupId' in job)) {
                    this.receipts.delete(job.id);
                    this.mismatches.delete(job.id);
                    this.ambiguous.delete(job.id);
                    this.editing.add(job.id);
                }
            }
        }

        this.refresh();
        const candidates = jobs
            .filter((job) => this.available(job))
            .map((job) => ({
                job,
                permitted:
                    'toGroupId' in job
                        ? this.transitionAllowed(
                              job,
                              job.action.kind === 'input' &&
                                  this.recorder.isInputPending(element),
                          )
                        : this.dependencies(job),
            }));

        const token: Intent = {epoch: this.epoch, stamp, candidates};

        this.minted.add(token);

        return token;
    }

    private accept(action: SemanticAction, token: unknown): void {
        if (!this.active || this.actor.getSnapshot().value === 'timedOut') {
            return;
        }

        // Navigation has no captured DOM target: only explicit pathname expectations are eligible.
        let intent: Intent;

        if (action.kind === 'navigation') {
            this.tick();

            if (!this.active || !this.entered) {
                return;
            }

            const candidates = [
                ...this.group.expectations,
                ...this.group.transitions,
            ].filter(
                (job) =>
                    job.action.kind === 'navigation' &&
                    job.action.pathname === action.pathname &&
                    this.available(job),
            );

            intent = {
                epoch: this.epoch,
                candidates: candidates.map((job) => ({
                    job,
                    permitted:
                        'toGroupId' in job
                            ? this.transitionAllowed(job)
                            : this.dependencies(job),
                })),
            };
        } else {
            if (!token || typeof token !== 'object' || !this.minted.has(token)) {
                return;
            }

            intent = token as Intent;
        }

        if (intent.epoch !== this.epoch || !this.current(intent.stamp)) {
            return;
        }

        const candidates = intent.candidates.filter(
            ({job}) => job.action.kind === action.kind,
        );

        for (const {job} of candidates) {
            this.editing.delete(job.id);
        }

        if (!candidates.length) {
            return;
        }

        const allowed = candidates.filter(({permitted}) => permitted);

        if (!allowed.length) {
            this.message = 'Сначала выполните обязательные задания и зависимости.';
            this.tick();

            return;
        }

        const matching = allowed.filter(
            ({job}) =>
                !('value' in action) ||
                ('value' in job.action && valueMatches(action.value, job.action.value)),
        );

        if (!matching.length) {
            for (const {job} of allowed) {
                this.receipts.delete(job.id);
                this.mismatches.add(job.id);
            }

            this.message = 'Значение не соответствует заданию.';
            this.tick();

            return;
        }

        const transitions = matching.filter(
            (entry): entry is {job: GroupTransition; permitted: boolean} =>
                'toGroupId' in entry.job,
        );

        if (matching.length > 1 && transitions.length !== matching.length) {
            this.message = 'Действие соответствует нескольким ожиданиям.';

            for (const {job} of matching) {
                this.ambiguous.add(job.id);
                this.states.set(job.id, 'ambiguous');
            }

            this.actor.send({type: 'AMBIGUOUS'});
            this.publish();

            return;
        }

        this.message = '';

        if (transitions.length) {
            this.pending = {
                jobs: transitions.map((entry) => entry.job),
                stamp: intent.stamp,
            };
            this.resetDeadline();
        } else {
            this.receipts.set(matching[0]!.job.id, {
                stamp: intent.stamp,
                confirmed: false,
            });
            this.mismatches.delete(matching[0]!.job.id);
        }

        this.tick();
    }

    private tick(): void {
        if (
            !this.active ||
            this.evaluating ||
            this.actor.getSnapshot().value === 'timedOut'
        ) {
            return;
        }

        this.evaluating = true;

        try {
            if (!this.root.isConnected) {
                this.message = 'Область наблюдения удалена со страницы.';
                this.stop();

                return;
            }

            if (!this.recorder.running) {
                this.actor.send({type: 'BROKEN'});

                return;
            }

            if (this.pending && !this.current(this.pending.stamp)) {
                this.pending = undefined;
                this.epoch++;
            }

            if (!this.entered) {
                this.entered = this.conditions.evaluate(this.group.entry) === 'true';
            }

            if (!this.entered) {
                this.wait('WAIT');

                return;
            }

            if (this.pending) {
                const outcomes = this.pending.jobs.map((job) => ({
                    job,
                    result: this.conditions.evaluate(job.completion),
                }));

                const matches = outcomes.filter((entry) => entry.result === 'true');

                if (matches.length > 1) {
                    this.message = 'Подтверждены несколько переходов.';
                    this.actor.send({type: 'AMBIGUOUS'});

                    return;
                }

                if (
                    matches.length === 1 &&
                    outcomes.every((entry) => entry.result !== 'unknown')
                ) {
                    if (this.recorder.hasUncommittedInput) {
                        this.wait('CONFIRM');

                        return;
                    }

                    const nextId = matches[0]!.job.toGroupId;

                    if (nextId === null) {
                        this.finalizeTransition();
                    } else {
                        this.advance(nextId);
                    }

                    return;
                }

                this.wait('CONFIRM');

                return;
            }

            this.refresh();

            if (
                !this.group.transitions.length &&
                this.requiredSatisfied() &&
                !this.recorder.hasUncommittedInput
            ) {
                if (this.conditions.evaluate(this.scenario.completion) === 'true') {
                    this.complete();
                } else {
                    this.wait('FINALIZE');
                }

                return;
            }

            if ([...this.states.values()].includes('ambiguous')) {
                this.actor.send({type: 'AMBIGUOUS'});

                return;
            }

            const available =
                [...this.states.values()].some((status) =>
                    ['editing', 'mismatch', 'ready', 'satisfied'].includes(status),
                ) ||
                this.group.transitions.some((job) => {
                    const descriptor = this.descriptor(job);

                    return !descriptor || !!this.resolver.resolve(descriptor).element;
                });

            if (available) {
                this.resetDeadline();
                this.actor.send({type: 'READY'});
            } else {
                this.wait('WAIT');
            }
        } finally {
            this.evaluating = false;
            this.publish();
        }
    }

    private finalizeTransition(): void {
        if (this.conditions.evaluate(this.scenario.completion) === 'true') {
            this.completed++;
            this.complete();
        } else {
            this.wait('FINALIZE');
        }
    }

    private advance(id: string): void {
        this.completed +=
            [...this.states.values()].filter((value) => value === 'satisfied').length + 1;
        this.group = this.scenario.groups.find((entry) => entry.id === id)!;
        this.epoch++;
        this.entered = false;
        this.pending = undefined;
        this.receipts.clear();
        this.editing.clear();
        this.mismatches.clear();
        this.skipped.clear();
        this.ambiguous.clear();
        this.states.clear();
        this.resetDeadline();
        this.actor.send({type: 'WAIT'});
    }

    private complete(): void {
        this.actor.send({type: 'COMPLETE'});
        this.active = false;
        this.dispose();
    }

    private wait(type: 'CONFIRM' | 'FINALIZE' | 'WAIT'): void {
        if (performance.now() >= this.deadline) {
            this.message = 'Время ожидания истекло. Можно повторить ожидание.';
            this.actor.send({type: 'TIMEOUT'});
        } else {
            this.actor.send({type});
        }
    }

    private publish(): void {
        const snapshot = this.snapshot();
        const signature = JSON.stringify(snapshot);

        if (signature !== this.signature) {
            this.signature = signature;
            this.options.onUpdate?.(snapshot);
        }
    }
}
