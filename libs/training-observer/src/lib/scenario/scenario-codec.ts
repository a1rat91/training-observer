/** Validates the learner document independently of storage/UI; reuses descriptor/value validation
 * from the recording contract and rejects unknown shape/version before starting a runtime.
 */
import {parseStateRecording} from '../recording/recording-codec';
import type {TrainingScenario} from './scenario';
export function parseScenario(json: string): TrainingScenario {
    if (json.length > 1_000_000) throw new Error('Сценарий слишком большой.');
    const data = JSON.parse(json);
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
    if (!object(data) || !keys(data, ['kind', 'version', 'steps']) || data['kind'] !== 'training-state-scenario' || data['version'] !== 1 ||
        !Array.isArray(data['steps']) || !data['steps'].length || data['steps'].length > 500) throw new Error('Некорректный сценарий.');
    for (const step of data['steps']) {
        if (!object(step) || !keys(step, ['key', 'task', 'transitionMessage', 'fields']) || typeof step['key'] !== 'string' || !step['key'] ||
            typeof step['task'] !== 'string' || typeof step['transitionMessage'] !== 'string' || !Array.isArray(step['fields'])) throw new Error('Некорректный экран.');
        for (const field of step['fields']) {
            if (!object(field) || !keys(field, ['descriptor', 'expected', 'message', 'optional']) ||
                typeof field['message'] !== 'string' || typeof field['optional'] !== 'boolean') throw new Error('Некорректное ожидание.');
            parseStateRecording(JSON.stringify({kind: 'training-state-recording', version: 1, complete: true,
                events: [{sequence: 1, visit: 1, screenKey: step['key'], kind: 'value', field: field['descriptor'], value: field['expected']}]}));
        }
    }
    return data as unknown as TrainingScenario;
}
