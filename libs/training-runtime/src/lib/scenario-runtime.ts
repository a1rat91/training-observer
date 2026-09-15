/** Координатор прохождения: проверяет готовность, переход и текущие ожидания именно в таком порядке.
 * FieldEvaluator отвечает за поля, FeedbackTracker — за повторы сообщений. Runtime не зависит от Angular/UI.
 * Один экземпляр — одна попытка. Сценарий копируется при создании и не изменяется во время прохождения.
 */
import {
    type ScenarioStep,
    type TrainingScenario,
    TrainingStatus,
} from '@training-observer/contracts';
import {type ScreenState, ScreenStatus} from '@training-observer/core/models';

import {FeedbackTracker} from './feedback-tracker';
import {
    type ConfirmedControls,
    FieldEvaluator,
    requiredFieldCount,
} from './field-evaluator';
import {
    FeedbackKind,
    type TrainingFeedback,
    type TrainingProgress,
} from './training-progress';

export type {TrainingProgress} from './training-progress';

export class ScenarioRuntime {
    private stepIndex = 0;
    private previousScreen: ScreenState | null = null;
    private entered = false;
    private readonly fields = new FieldEvaluator();
    private readonly feedback = new FeedbackTracker();
    private readonly scenario: TrainingScenario;

    constructor(scenario: TrainingScenario) {
        this.scenario = structuredClone(scenario);
    }

    public update(screen: ScreenState, confirmed: ConfirmedControls): TrainingProgress {
        const messages: TrainingFeedback[] = [];

        if (screen.status !== ScreenStatus.Ready) {
            return this.progress(
                screen.status === ScreenStatus.Loading
                    ? TrainingStatus.Waiting
                    : TrainingStatus.Blocked,
                messages,
                0,
                'Ожидаем доступный экран.',
            );
        }

        if (screen.key !== this.currentStep.key) {
            const rejected = this.tryTransition(screen, confirmed, messages);

            if (rejected) {
                return rejected;
            }
        }

        if (!this.entered) {
            this.fields.enter(confirmed);
            this.entered = true;
        }

        this.feedback.clearTransition();
        this.previousScreen = screen;
        const evaluation = this.fields.evaluate(
            this.currentStep,
            screen,
            confirmed,
            true,
        );

        this.feedback.reconcile(evaluation.feedback, messages);

        if (evaluation.blocked) {
            return this.progress(
                TrainingStatus.Blocked,
                messages,
                evaluation.completed,
                'Не удалось однозначно прочитать все поля.',
            );
        }

        const complete =
            evaluation.allComplete && this.stepIndex === this.scenario.steps.length - 1;

        return this.progress(
            complete ? TrainingStatus.Complete : TrainingStatus.Active,
            messages,
            evaluation.completed,
        );
    }

    private get currentStep(): ScenarioStep {
        const step = this.scenario.steps[this.stepIndex];

        if (!step) {
            throw new Error('Scenario step is unavailable.');
        }

        return step;
    }

    private tryTransition(
        screen: ScreenState,
        confirmed: ConfirmedControls,
        messages: TrainingFeedback[],
    ): TrainingProgress | undefined {
        // Последний blur может прийти после удаления старого DOM; проверяем его до перехода.
        const previous = this.previousScreen
            ? this.fields.evaluate(
                  this.currentStep,
                  this.previousScreen,
                  confirmed,
                  false,
              )
            : null;

        const expectedScreen = this.scenario.steps[this.stepIndex + 1]?.key;

        if (this.entered && previous?.allComplete && screen.key === expectedScreen) {
            // Последний blur мог подтвердиться одновременно с переходом: доставляем его сообщение до смены шага.
            this.feedback.reconcile(previous.feedback, messages);
            this.stepIndex++;
            this.entered = false;
            this.feedback.clear();

            return undefined;
        }

        const issue = previous?.blocked
            ? 'Не удалось проверить поля предыдущего экрана. Вернитесь к нему.'
            : this.currentStep.transitionMessage;

        if (!previous?.blocked) {
            this.feedback.report(
                'transition',
                {value: String(screen.key), message: issue, kind: FeedbackKind.Error},
                messages,
            );
        }

        return this.progress(
            previous?.blocked ? TrainingStatus.Blocked : TrainingStatus.Active,
            messages,
            0,
            issue,
        );
    }

    private progress(
        status: TrainingStatus,
        feedback: readonly TrainingFeedback[],
        completedFields = 0,
        issue = '',
    ): TrainingProgress {
        return {
            status,
            step: this.stepIndex + 1,
            total: this.scenario.steps.length,
            completedFields,
            requiredFields: requiredFieldCount(this.currentStep),
            feedback,
            issue,
        };
    }
}
