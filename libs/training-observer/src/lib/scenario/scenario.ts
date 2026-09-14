/** A scenario is an ordered set of screen visits with unordered field expectations within each visit.
 * Compilation keeps the last confirmed value per recorded descriptor; incomplete recordings are rejected.
 */
import type {ControlLocatorHints} from '../models/control-snapshot';
import type {RecordedValue, StateRecording} from '../recording/state-recorder';
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
export function compileScenario(recording: StateRecording): TrainingScenario {
    if (!recording.complete || recording.events.some(e => e.kind === 'unavailable')) {
        throw new Error('В записи есть неподтверждённые значения или пропуски. Запишите пример без них.');
    }
    const visits = new Map<number, {key: string; fields: Map<string, FieldExpectation>}>();
    for (const event of recording.events) {
        if (event.kind === 'screen') visits.set(event.visit, {key: event.screenKey, fields: new Map()});
        if (event.kind === 'value' && event.field && event.value !== undefined) {
            const step = visits.get(event.visit);
            if (!step || step.key !== event.screenKey) throw new Error('Нарушен порядок экранов записи.');
            step.fields.set(JSON.stringify(event.field), {descriptor: structuredClone(event.field), expected: structuredClone(event.value),
                message: `Проверьте поле «${event.field.label}».`, optional: false});
        }
    }
    if (!visits.size) throw new Error('Запись не содержит экранов.');
    return {kind: 'training-state-scenario', version: 1, steps: [...visits.values()].map(s => ({key: s.key,
        task: 'Заполните поля и продолжите.', transitionMessage: 'Открыт неверный экран. Вернитесь и проверьте заполнение.', fields: [...s.fields.values()]}))};
}
