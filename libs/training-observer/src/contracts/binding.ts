/**
 * Явная миграция v2: интеграция передаёт проверенные области и привязку каждой цели.
 * Функции не исследуют DOM и не выбирают MF по похожему имени. Новый документ проходит
 * полную проверку ссылок и JSON-контракта; исходный документ остаётся неизменным.
 */
import {type AreaBindings, type Recording, type Scenario} from './types';
import {readRecording, readScenario} from './validation';

export function bindRecordingAreas(recording: Recording, areas: AreaBindings): Recording {
    return readRecording({...readRecording(recording), version: 3, areas});
}

export function bindScenarioAreas(scenario: Scenario, areas: AreaBindings): Scenario {
    const document = readScenario(scenario);

    return readScenario({
        ...document,
        version: 'groups' in document ? document.version : 3,
        areas,
    });
}
