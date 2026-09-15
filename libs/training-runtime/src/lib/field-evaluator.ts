/** Оценка полей одного учебного шага.
 * Сначала сопоставляет цели один-к-одному, затем выбирает исходное или blur-подтверждённое значение.
 * Хранит только память текущего шага; не переключает экраны и не показывает уведомления.
 */
import {
    MatchStatus,
    readControlValue,
    requiresBlur,
    type ScenarioStep,
    valueFingerprint,
} from '@training-observer/contracts';
import {type ControlSnapshot, type ScreenState} from '@training-observer/core/models';

import {matchControl} from './control-matcher';
import {FeedbackKind, type TrainingFeedback} from './training-progress';

export type ConfirmedControls = Readonly<Record<string, ControlSnapshot>>;
export interface FieldFeedback extends TrainingFeedback {
    readonly value: string;
}
export interface FieldEvaluation {
    readonly completed: number;
    readonly blocked: boolean;
    readonly allComplete: boolean;
    readonly feedback: ReadonlyMap<string, FieldFeedback>;
}

interface ValueSource {
    readonly control: ControlSnapshot;
    readonly confirmed: boolean;
}

export class FieldEvaluator {
    private baseline: ConfirmedControls = {};
    private readonly immediateValues = new Map<number, {id: string; value: string}>();
    private readonly initialControls = new Map<number, ControlSnapshot>();

    public enter(confirmed: ConfirmedControls): void {
        this.baseline = {...confirmed};
        this.immediateValues.clear();
        this.initialControls.clear();
    }

    public evaluate(
        step: ScenarioStep,
        screen: ScreenState,
        confirmed: ConfirmedControls,
        observeChanges: boolean,
    ): FieldEvaluation {
        let completed = 0;
        let blocked = false;
        const feedback = new Map<string, FieldFeedback>();
        const matches = step.fields.map((field) =>
            matchControl(field.descriptor, screen.controls),
        );

        const assignments = new Map<string, number>();

        matches.forEach((match, index) => {
            if (!step.fields[index]?.optional && match.status === MatchStatus.Matched) {
                assignments.set(
                    match.control.id,
                    (assignments.get(match.control.id) ?? 0) + 1,
                );
            }
        });

        step.fields.forEach((field, index) => {
            if (field.optional) {
                return;
            }

            const match = matches[index];

            if (
                match?.status !== MatchStatus.Matched ||
                assignments.get(match.control.id) !== 1
            ) {
                blocked = true;

                return;
            }

            const source = this.resolveValueSource(
                index,
                match.control,
                confirmed,
                observeChanges,
            );

            if (!source) {
                return;
            }

            const value = readControlValue(source.control);

            if (value === undefined) {
                blocked = true;

                return;
            }

            const fingerprint = valueFingerprint(value);
            const notify = requiresBlur(match.control)
                ? source.confirmed
                : this.observeImmediateValue(
                      index,
                      match.control.id,
                      fingerprint,
                      observeChanges,
                  );

            const correct = fingerprint === valueFingerprint(field.expected);

            if (correct) {
                completed++;
            }

            if (notify) {
                feedback.set(String(index), {
                    value: fingerprint,
                    kind: correct ? FeedbackKind.Success : FeedbackKind.Error,
                    message: correct ? (field.successMessage ?? '') : field.message,
                });
            }
        });

        return {
            completed,
            blocked,
            feedback,
            allComplete: !blocked && completed === requiredFieldCount(step),
        };
    }

    private resolveValueSource(
        index: number,
        raw: ControlSnapshot,
        confirmed: ConfirmedControls,
        observeChanges: boolean,
    ): ValueSource | undefined {
        if (observeChanges && this.initialControls.get(index)?.id !== raw.id) {
            this.initialControls.set(index, raw);
        }

        if (!requiresBlur(raw)) {
            return {control: raw, confirmed: false};
        }

        const confirmation = confirmed[raw.id];

        if (confirmation && confirmation !== this.baseline[raw.id]) {
            return {control: confirmation, confirmed: true};
        }

        const initial = this.initialControls.get(index);

        return initial?.id === raw.id ? {control: initial, confirmed: false} : undefined;
    }

    private observeImmediateValue(
        index: number,
        id: string,
        value: string,
        observeChanges: boolean,
    ): boolean {
        if (!observeChanges) {
            return false;
        }

        const previous = this.immediateValues.get(index);

        this.immediateValues.set(index, {id, value});

        return previous?.id === id && previous.value !== value;
    }
}

export function requiredFieldCount(step: ScenarioStep): number {
    return step.fields.filter((field) => !field.optional).length;
}
