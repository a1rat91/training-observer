/** Проверка сценария без зависимости от записи или runtime. Общие descriptor/value guards защищают обе JSON-границы. */
import {
    type FieldExpectation,
    type ScenarioStep,
    type TrainingScenario,
} from './scenario.models';
import {hasOnlyKeys, isControlDescriptor, isObject, isRecordedValue} from './validation';

export function parseScenario(json: string): TrainingScenario {
    if (json.length > 1_000_000) {
        throw new Error('Сценарий слишком большой.');
    }

    const data: unknown = JSON.parse(json);

    if (
        !isObject(data) ||
        !hasOnlyKeys(data, ['kind', 'version', 'steps']) ||
        data['kind'] !== 'training-state-scenario' ||
        data['version'] !== 1 ||
        !Array.isArray(data['steps']) ||
        !data['steps'].length ||
        data['steps'].length > 500
    ) {
        throw new Error('Некорректный сценарий.');
    }

    return {
        kind: 'training-state-scenario',
        version: 1,
        steps: data['steps'].map(parseStep),
    };
}

function parseStep(step: unknown): ScenarioStep {
    if (
        !isObject(step) ||
        !hasOnlyKeys(step, ['key', 'task', 'transitionMessage', 'fields']) ||
        typeof step['key'] !== 'string' ||
        !step['key'] ||
        typeof step['task'] !== 'string' ||
        typeof step['transitionMessage'] !== 'string' ||
        !Array.isArray(step['fields'])
    ) {
        throw new Error('Некорректный экран.');
    }

    return {
        key: step['key'],
        task: step['task'],
        transitionMessage: step['transitionMessage'],
        fields: step['fields'].map(parseField),
    };
}

function parseField(field: unknown): FieldExpectation {
    if (
        !isObject(field) ||
        !hasOnlyKeys(field, ['descriptor', 'expected', 'message', 'optional']) ||
        typeof field['message'] !== 'string' ||
        typeof field['optional'] !== 'boolean' ||
        !isControlDescriptor(field['descriptor']) ||
        !isRecordedValue(field['expected'])
    ) {
        throw new Error('Некорректное ожидание.');
    }

    return {
        descriptor: field['descriptor'],
        expected: field['expected'],
        message: field['message'],
        optional: field['optional'],
    };
}
