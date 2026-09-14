/** Память уже сообщённых ошибок. Повторный снимок не повторяет сообщение; исправление разрешает новую ошибку. */
import type { FieldError } from './field-evaluator';

export class FeedbackTracker {
    private readonly reported = new Map<string, string>();

    report(key: string, value: string, message: string, output: string[]): void {
        if (this.reported.get(key) !== value) output.push(message);
        this.reported.set(key, value);
    }

    reconcile(errors: ReadonlyMap<string, FieldError>, output: string[]): void {
        for (const [key, error] of errors) this.report(key, error.value, error.message, output);
        for (const key of this.reported.keys()) if (!errors.has(key)) this.reported.delete(key);
    }

    clearTransition(): void {
        this.reported.delete('transition');
    }
    clear(): void {
        this.reported.clear();
    }
}
