/**
 * LegacyScenarioRuntime сохраняет последовательную семантику Scenario v2/v3 внутри выбранного DOM-root.
 * Алгоритм: разрешает цель текущего шага, связывает intent и commit с поколением шага,
 * проверяет ожидаемое действие и отдельное completion, затем выбирает ветку либо ждёт изменения DOM.
 * TargetResolver ограничивает action и completion областью из wire v3; remount владельца отменяет intent.
 * XState отражает фазу; Conditions вычисляет true/false/unknown. Конец графа требует глобального completion.
 * Skip/retry/переход инвалидируют старые tokens; stop освобождает recorder, observer и timer.
 */
import {createActor} from 'xstate';

import {
    type CapturedValue,
    type LegacyScenario,
    readScenario,
    type Resolution,
    type ScenarioStep,
    type SemanticAction,
} from '../contracts';
import {flags} from '../dom/identity';
import {ElementRecorder} from '../recording';
import {TargetResolver} from '../resolution';
import {actionValueMatches, Conditions} from './conditions';
import {
    machine,
    type RuntimeOptions,
    type RuntimeSnapshot,
    type RuntimeStatus,
} from './state';

export class LegacyScenarioRuntime {
    private readonly scenario: LegacyScenario;
    private readonly actor = createActor(machine);
    private readonly resolver: TargetResolver;
    private unsubscribeAreas?: () => void;
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
    private areaUnavailable = false;

    constructor(
        private readonly root: HTMLElement,
        scenario: LegacyScenario,
        private readonly options: RuntimeOptions = {},
    ) {
        const document = readScenario(scenario);

        if (document.version === 4) {
            throw new Error('Grouped scenario requires the grouped interpreter');
        }

        this.scenario = document;

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
        this.resolver = new TargetResolver(this.scenario, root, options, options.areas);
        this.conditions = new Conditions(this.scenario, root, options, options.areas);
        this.recorder = new ElementRecorder(root, {
            valuePolicy: {
                mode: 'capture',
                sensitive: 'redact',
                normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
            },
            acceptUntrustedEvents: options.acceptUntrustedEvents,
            areas: options.areas,
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
        let previousAreas = this.options.areas?.snapshots() ?? [];

        this.unsubscribeAreas = this.options.areas?.subscribe(() => {
            const currentAreas = this.options.areas!.snapshots();
            const action = this.step?.action;
            const key =
                action && 'targetId' in action && this.scenario.version === 3
                    ? this.scenario.areas.targets.find(
                          (target) => target.targetId === action.targetId,
                      )?.areaKey
                    : undefined;

            if (
                key &&
                previousAreas.find((area) => area.key === key)?.generation !==
                    currentAreas.find((area) => area.key === key)?.generation
            ) {
                this.generation++;
                this.armed = false;
                this.committed = undefined;
            }

            previousAreas = currentAreas;
            this.tick();
        });
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
            uncommittedInput: this.recorder.hasUncommittedInput,
        };
    }

    private dispose(): void {
        this.unsubscribeAreas?.();
        this.unsubscribeAreas = undefined;
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

        if (!['change', 'compositionend', 'input'].includes(event.type)) {
            this.tick();
        }

        const step = this.step;

        if (!step || step.action.kind === 'navigation') {
            return;
        }

        const targetId = step.action.targetId;
        const descriptor = this.scenario.descriptors.find(
            (item) => item.id === targetId,
        )!;

        const result = this.resolver.resolve(descriptor);

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
            this.message = 'Область наблюдения удалена со страницы.';
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

            if (this.recorder.hasUncommittedInput) {
                this.message = 'Завершите ввод: выйдите из поля.';

                return;
            }

            this.message = '';

            if (this.conditions.evaluate(this.scenario.completion) === 'true') {
                this.actor.send({type: 'COMPLETE'});
                this.active = false;
                this.dispose();
            }

            return;
        }

        if (this.step.action.kind !== 'navigation') {
            const areaStatus = this.resolver.areaStatus(this.step.action.targetId);

            if (!['resolved', 'unscoped'].includes(areaStatus)) {
                this.areaUnavailable = true;
                this.resolution = null;
                this.message =
                    areaStatus === 'missing'
                        ? 'Ожидаем появления микрофронта.'
                        : 'Микрофронт недоступен или неоднозначен.';

                if (areaStatus === 'missing') {
                    this.actor.send({type: 'WAIT'});
                } else {
                    this.actor.send({
                        type: ['ambiguous', 'conflict'].includes(areaStatus)
                            ? 'AMBIGUOUS'
                            : 'BROKEN',
                    });
                }

                return;
            }
        }

        if (this.areaUnavailable) {
            this.areaUnavailable = false;
            this.message = '';
        }

        if (this.armed) {
            this.actor.send({type: 'CONFIRM'});

            if (this.recorder.hasUncommittedInput) {
                this.message = 'Завершите ввод: выйдите из поля.';

                return;
            }

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

        const result = this.resolver.resolve(descriptor);

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
