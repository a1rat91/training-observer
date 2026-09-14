/** Headless learner evaluator. Fields are unordered within the active recorded screen visit.
 * Consume blur-confirmed values, reject ambiguous targets and invalid transitions, emit feedback only
 * on changed error states. Loading/observation failures are never mistakes attributed to the learner.
 */
import type {ControlSnapshot} from '../models/control-snapshot';
import type {ScreenState} from '../models/screen-state';
import type {TrainingScenario, ScenarioStep} from './scenario';
import {matchControl} from './control-matcher';
export interface TrainingProgress {
    readonly status: 'waiting' | 'active' | 'blocked' | 'complete';
    readonly step: number;
    readonly total: number;
    readonly completedFields: number;
    readonly requiredFields: number;
    readonly feedback: readonly string[];
    readonly issue: string;
}
export class ScenarioRuntime {
    private index = 0;
    private previous: ScreenState | null = null;
    private readonly errors = new Map<string, string>();
    private baseline: Readonly<Record<string, ControlSnapshot>> = {};
    private entered = false;
    private readonly scenario: TrainingScenario;
    constructor(scenario: TrainingScenario) { this.scenario = structuredClone(scenario); }

    update(screen: ScreenState, confirmed: Readonly<Record<string, ControlSnapshot>>): TrainingProgress {
        const feedback: string[] = [];
        const result = (status: TrainingProgress['status'], completedFields = 0, issue = ''): TrainingProgress => ({
            status, step: this.index + 1, total: this.scenario.steps.length, completedFields,
            requiredFields: this.scenario.steps[this.index].fields.filter(f => !f.optional).length, feedback, issue,
        });
        if (screen.status !== 'ready') return result(screen.status === 'loading' ? 'waiting' : 'blocked', 0, 'Ожидаем доступный экран.');
        const step = this.scenario.steps[this.index];
        if (screen.key !== step.key) {
            const prior = this.previous ? this.evaluate(step, this.previous, confirmed) : null;
            if (this.entered && prior?.all && screen.key === this.scenario.steps[this.index + 1]?.key) {
                this.index++;
                this.entered = false;
                this.errors.clear();
            } else {
                const message = prior?.blocked ? 'Не удалось проверить поля предыдущего экрана. Вернитесь к нему.' : step.transitionMessage;
                if (!prior?.blocked) this.report('transition', String(screen.key), message, feedback);
                return result(prior?.blocked ? 'blocked' : 'active', 0, message);
            }
        }
        if (!this.entered) {
            this.baseline = {...confirmed};
            this.entered = true;
        }
        this.errors.delete('transition');
        this.previous = screen;
        const evaluation = this.evaluate(this.scenario.steps[this.index], screen, confirmed);
        for (const [key, value] of evaluation.wrong) this.report(key, value.value, value.message, feedback);
        for (const key of [...this.errors.keys()]) if (!evaluation.wrong.has(key)) this.errors.delete(key);
        if (evaluation.blocked) return result('blocked', evaluation.count, 'Не удалось однозначно прочитать все поля.');
        return result(evaluation.all && this.index === this.scenario.steps.length - 1 ? 'complete' : 'active', evaluation.count);
    }

    private evaluate(step: ScenarioStep, screen: ScreenState, confirmed: Readonly<Record<string, ControlSnapshot>>) {
        let count = 0;
        let blocked = false;
        const wrong = new Map<string, {value: string; message: string}>();
        const matches = step.fields.map(field => matchControl(field.descriptor, screen.controls));
        const assigned = matches.flatMap((m, i) => !step.fields[i].optional && m.status === 'matched' ? [m.control.id] : []);
        step.fields.forEach((field, index) => {
            if (field.optional) return;
            const match = matches[index];
            if (match.status !== 'matched' || assigned.filter(id => id === match.control.id).length !== 1) { blocked = true; return; }
            const raw = match.control;
            const blur = ['textbox', 'number', 'select', 'combobox'].includes(raw.kind);
            const control = blur ? confirmed[raw.id] : raw;
            if (!control || (blur && control === this.baseline[raw.id])) return;
            // Keep the same text-based ComboBox semantics as recording, including an empty value.
            const value = control.state.redacted || control.state.indeterminate ? undefined
                : control.kind === 'combobox' && control.choice
                    ? control.choice.displayValue ? [control.choice.displayValue] : []
                : control.choice
                ? control.choice.selection.status === 'observed' ? control.choice.selection.labels : undefined
                : control.state.checked ?? control.state.value;
            if (value === undefined) { blocked = true; return; }
            if (JSON.stringify(value) === JSON.stringify(field.expected)) count++;
            else wrong.set(String(index), {value: JSON.stringify(value), message: field.message});
        });
        return {count, blocked, wrong, all: !blocked && count === step.fields.filter(f => !f.optional).length};
    }
    private report(key: string, value: string, message: string, feedback: string[]): void {
        if (this.errors.get(key) !== value) feedback.push(message);
        this.errors.set(key, value);
    }
}
