import {createActor, createMachine} from 'xstate';

import {
    type CapturedValue,
    readScenario,
    type Resolution,
    type Scenario,
    type ScenarioStep,
    type SemanticAction,
} from '../contracts';
import {flags} from '../dom/identity';
import {ElementRecorder} from '../recording';
import {ElementResolver, type ResolverOptions} from '../resolution';
import {actionValueMatches, Conditions} from './conditions';

const machine = createMachine({
    id: 'training',
    initial: 'waiting',
    states: {
        waiting: {},
        ready: {},
        confirming: {},
        ambiguous: {},
        broken: {},
        timedOut: {},
        finalizing: {},
        completed: {type: 'final'},
        stopped: {type: 'final'},
    },
    on: {
        WAIT: '.waiting',
        READY: '.ready',
        CONFIRM: '.confirming',
        AMBIGUOUS: '.ambiguous',
        BROKEN: '.broken',
        TIMEOUT: '.timedOut',
        FINALIZE: '.finalizing',
        COMPLETE: '.completed',
        STOP: '.stopped',
    },
});
export type RuntimeStatus =
    | 'ambiguous'
    | 'broken'
    | 'completed'
    | 'confirming'
    | 'finalizing'
    | 'ready'
    | 'stopped'
    | 'timedOut'
    | 'waiting';
export interface RuntimeSnapshot {
    status: RuntimeStatus;
    stepId: string | null;
    instruction: string;
    hint: string | null;
    optional: boolean;
    completedSteps: number;
    message: string;
    resolution: Resolution | null;
}
export interface RuntimeOptions extends ResolverOptions {
    timeoutMs?: number;
    onUpdate?(snapshot: RuntimeSnapshot): void;
    /** Test fixtures only, never enabled in the learner page. */
    acceptUntrustedEvents?: boolean;
}
export class ScenarioRuntime {
    private readonly scenario: Scenario;
    private readonly actor = createActor(machine);
    private readonly resolver: ElementResolver;
    private readonly conditions: Conditions;
    private readonly recorder: ElementRecorder;
    private observer?: MutationObserver;
    private interval?: ReturnType<typeof setInterval>;
    private step: ScenarioStep | null;
    private armed = false;
    private generation = 0;
    private committed?: {targetId: string; value: CapturedValue};
    private active = false;
    private deadline = 0;
    private completedSteps = 0;
    private message = '';
    private resolution: Resolution | null = null;
    private signature = '';
    private evaluating = false;

    constructor(
        private readonly root: HTMLElement,
        scenario: Scenario,
        private readonly options: RuntimeOptions = {},
    ) {
        this.scenario = readScenario(scenario);

        if (this.scenario.mode.kind !== 'dom-only') {
            throw new Error('Shared adapter runtime не реализован.');
        }

        if (
            !Number.isFinite(options.timeoutMs ?? 15000) ||
            (options.timeoutMs ?? 15000) <= 0
        ) {
            throw new Error('Некорректный timeout.');
        }

        this.step = this.scenario.steps.find(
            (item) => item.id === this.scenario.startStepId,
        )!;
        this.resolver = new ElementResolver(options);
        this.conditions = new Conditions(this.scenario, root, options);
        this.recorder = new ElementRecorder(root, {
            valuePolicy: {
                mode: 'capture',
                sensitive: 'redact',
                normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
            },
            acceptUntrustedEvents: options.acceptUntrustedEvents,
            onAction: (action, element, intentToken) =>
                this.action(action, element, intentToken),
            onIntent: (event, element) => this.capture(event, element),
        });
    }

    public start(): void {
        if (this.active || this.actor.getSnapshot().status === 'done') {
            return;
        }

        this.active = true;
        this.actor.start();
        this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
        this.recorder.start();
        this.observer = new MutationObserver(() => this.tick());
        this.observer.observe(this.root, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        this.interval = setInterval(() => this.tick(), 100);
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

        this.armed = false;
        this.committed = undefined;
        this.generation++;
        this.message = '';
        this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
        this.actor.send({type: this.step ? 'WAIT' : 'FINALIZE'});
        this.tick();
    }

    public skip(): void {
        if (
            !this.active ||
            !this.step?.optional ||
            this.snapshot().status === 'timedOut'
        ) {
            return;
        }

        this.advance(this.step.nextStepId);
        this.tick();
    }

    public snapshot(): RuntimeSnapshot {
        return {
            status: this.actor.getSnapshot().value as RuntimeStatus,
            stepId: this.step?.id ?? null,
            instruction: this.step?.instruction ?? 'Дождитесь подтверждения результата',
            hint: this.step?.hint ?? null,
            optional: this.step?.optional ?? false,
            completedSteps: this.completedSteps,
            message: this.message,
            resolution: this.resolution,
        };
    }

    private dispose(): void {
        clearInterval(this.interval);
        this.observer?.disconnect();
        this.recorder.stop();
    }

    private publish(): void {
        const snapshot = this.snapshot();
        const signature = JSON.stringify(snapshot);

        if (signature === this.signature) {
            return;
        }

        this.signature = signature;
        this.options.onUpdate?.(snapshot);
    }

    private capture(event: Event, element: Element): number | undefined {
        if (
            !['change', 'click', 'compositionend', 'input', 'keydown'].includes(
                event.type,
            ) ||
            !this.active
        ) {
            return;
        }

        this.tick();
        const step = this.step;

        if (!step || step.action.kind === 'navigation') {
            return;
        }

        const targetId = step.action.targetId;
        const descriptor = this.scenario.descriptors.find(
            (item) => item.id === targetId,
        )!;

        const result = this.resolver.resolve(descriptor, this.root);

        return result.report.status === 'resolved' &&
            result.element === element &&
            (step.action.kind === 'click' || !flags(element).readOnly)
            ? this.generation
            : undefined;
    }

    private action(
        action: SemanticAction,
        element: Element | null,
        intentToken?: unknown,
    ): void {
        if (!this.active || this.snapshot().status === 'timedOut') {
            return;
        }

        this.tick();
        const step = this.step;

        if (!this.active || action.kind !== step?.action.kind) {
            return;
        }

        if (step.action.kind === 'navigation') {
            if (
                action.kind !== 'navigation' ||
                !this.conditions.pathname(step.action.pathname)
            ) {
                return;
            }
        } else {
            // Every non-navigation action must carry proof from this step's capture phase.
            // A fresh live match alone could accept a delayed commit from a skipped step.
            const proved = !!element && intentToken === this.generation;

            if (!proved) {
                return;
            }

            if (
                'value' in action &&
                !actionValueMatches(step.completion, step.action.targetId, action.value)
            ) {
                this.armed = false;
                this.message = 'Значение не соответствует заданию.';
                this.publish();

                return;
            }
        }

        if (!this.armed) {
            this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
        }

        this.committed =
            'value' in action && 'targetId' in step.action
                ? {targetId: step.action.targetId, value: action.value}
                : undefined;
        this.armed = true;
        this.message = '';
        this.tick();
    }

    private advance(nextId: string | null): void {
        this.completedSteps++;
        this.step = nextId
            ? this.scenario.steps.find((item) => item.id === nextId)!
            : null;
        this.armed = false;
        this.committed = undefined;
        this.generation++;
        this.resolution = null;
        this.message = '';
        this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
        this.actor.send({type: this.step ? 'WAIT' : 'FINALIZE'});
    }

    private tick(): void {
        if (!this.active || this.evaluating || this.snapshot().status === 'timedOut') {
            return;
        }

        this.evaluating = true;

        try {
            this.evaluate();
        } finally {
            this.evaluating = false;
            this.publish();
        }
    }

    private evaluate(): void {
        if (!this.root.isConnected) {
            this.message = 'Плеер удалён со страницы.';
            this.stop();

            return;
        }

        if (!this.recorder.running) {
            this.message = 'Наблюдение действий остановлено. Начните новое прохождение.';
            this.actor.send({type: 'BROKEN'});

            return;
        }

        if (this.snapshot().status === 'ready') {
            this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
        }

        if (performance.now() >= this.deadline) {
            this.message = 'Время ожидания истекло. Можно повторить ожидание.';
            this.actor.send({type: 'TIMEOUT'});

            return;
        }

        if (!this.step) {
            this.actor.send({type: 'FINALIZE'});

            if (this.conditions.evaluate(this.scenario.completion) === 'true') {
                this.actor.send({type: 'COMPLETE'});
                this.active = false;
                this.dispose();
            }

            return;
        }

        if (this.armed) {
            this.actor.send({type: 'CONFIRM'});

            if (
                this.conditions.evaluate(this.step.completion, this.committed) !== 'true'
            ) {
                return;
            }

            const branches = this.step.branches.map((branch) => ({
                branch,
                result: this.conditions.evaluate(branch.when, this.committed),
            }));

            const matches = branches.filter((branch) => branch.result === 'true');

            if (matches.length > 1) {
                this.message = 'Одновременно подходят несколько веток.';
                this.actor.send({type: 'AMBIGUOUS'});

                return;
            }

            if (branches.some((branch) => branch.result === 'unknown')) {
                this.message = 'Недостаточно наблюдаемых данных для выбора ветки.';

                return;
            }

            this.advance(matches[0]?.branch.nextStepId ?? this.step.nextStepId);

            // Evaluate final completion independently, but never consume a second step's action.
            if (!this.step) {
                this.evaluate();
            }

            return;
        }

        if (this.step.action.kind === 'navigation') {
            this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
            this.actor.send({type: 'READY'});

            return;
        }

        const targetId = this.step.action.targetId;
        const descriptor = this.scenario.descriptors.find(
            (item) => item.id === targetId,
        )!;

        const result = this.resolver.resolve(descriptor, this.root);

        this.resolution = result.report;

        if (result.report.status === 'ambiguous') {
            this.actor.send({type: 'AMBIGUOUS'});

            return;
        }

        if (
            result.report.status === 'resolved' &&
            result.element &&
            (this.step.action.kind === 'click' || !flags(result.element).readOnly)
        ) {
            this.deadline = performance.now() + (this.options.timeoutMs ?? 15000);
            this.actor.send({type: 'READY'});

            return;
        }

        if (
            result.report.status === 'broken' &&
            ['identity-conflict', 'unsupported'].includes(result.report.reason)
        ) {
            this.actor.send({type: 'BROKEN'});

            return;
        }

        this.actor.send({type: 'WAIT'});
    }
}
