/** Учебная модель: упорядоченные посещения экранов и независимые ожидания полей внутри экрана. */
import type { ControlLocatorHints } from '@training-observer/core/models';
import type { RecordedValue } from './control-value';
export interface FieldExpectation {
    readonly descriptor: ControlLocatorHints;
    readonly expected: RecordedValue;
    readonly message: string;
    readonly optional: boolean;
}
export interface ScenarioStep {
    readonly key: string;
    readonly task: string;
    readonly transitionMessage: string;
    readonly fields: readonly FieldExpectation[];
}
export interface TrainingScenario {
    readonly kind: 'training-state-scenario';
    readonly version: 1;
    readonly steps: readonly ScenarioStep[];
}
