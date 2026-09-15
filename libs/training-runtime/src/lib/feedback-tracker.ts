/** Память обратной связи. Повторный подтверждённый ответ не повторяет сообщение; изменение ответа разрешает новое.
 * Пустые тексты не выводятся, но их состояние учитывается. Оформлением уведомлений занимается потребитель.
 */
import {type FieldFeedback} from './field-evaluator';
import {type TrainingFeedback} from './training-progress';

export class FeedbackTracker {
    private readonly reported = new Map<string, string>();

    public report(
        key: string,
        feedback: FieldFeedback,
        output: TrainingFeedback[],
    ): void {
        const signature = JSON.stringify([feedback.kind, feedback.value]);

        if (this.reported.get(key) !== signature && feedback.message.trim()) {
            output.push({kind: feedback.kind, message: feedback.message});
        }

        this.reported.set(key, signature);
    }

    public reconcile(
        feedback: ReadonlyMap<string, FieldFeedback>,
        output: TrainingFeedback[],
    ): void {
        for (const [key, item] of feedback) {
            this.report(key, item, output);
        }

        for (const key of this.reported.keys()) {
            if (!feedback.has(key)) {
                this.reported.delete(key);
            }
        }
    }

    public clearTransition(): void {
        this.reported.delete('transition');
    }

    public clear(): void {
        this.reported.clear();
    }
}
