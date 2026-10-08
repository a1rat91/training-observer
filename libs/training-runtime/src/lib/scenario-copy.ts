/** Копия сценария одной попытки: ожидания, значения и контекст не разделяются с редактируемым документом. */
import {type TrainingScenario} from '@training-observer/contracts';

export function copyTrainingScenario(scenario: TrainingScenario): TrainingScenario {
    return {
        ...scenario,
        steps: scenario.steps.map((step) => ({
            ...step,
            fields: step.fields.map((field) => ({
                ...field,
                descriptor: {
                    ...field.descriptor,
                    context: field.descriptor.context.map((context) => ({...context})),
                },
                expected:
                    typeof field.expected === 'object'
                        ? [...field.expected]
                        : field.expected,
            })),
        })),
    };
}
