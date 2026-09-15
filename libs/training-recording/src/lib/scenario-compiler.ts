/** Компилятор журнала в сценарий: сохраняет порядок посещений, внутри посещения оставляет последнее значение descriptor.
 * Исходная запись не меняется. Пропуски наблюдения блокируют компиляцию; тексты — редактируемые значения по умолчанию.
 */
import {
    type FieldExpectation,
    RecordingEventKind,
    type ScenarioStep,
    type StateRecording,
    type TrainingScenario,
} from '@training-observer/contracts';

interface RecordedScreen {
    readonly key: string;
    readonly fields: Map<string, FieldExpectation>;
}

export function compileScenario(recording: StateRecording): TrainingScenario {
    if (
        !recording.complete ||
        recording.events.some((event) => event.kind === RecordingEventKind.Unavailable)
    ) {
        throw new Error(
            'В записи есть неподтверждённые значения или пропуски. Запишите пример без них.',
        );
    }

    const visits = new Map<number, RecordedScreen>();

    for (const event of recording.events) {
        if (event.kind === RecordingEventKind.Screen) {
            visits.set(event.visit, {key: event.screenKey, fields: new Map()});
        }

        if (
            event.kind !== RecordingEventKind.Value ||
            !event.field ||
            event.value === undefined
        ) {
            continue;
        }

        const screen = visits.get(event.visit);

        if (screen?.key !== event.screenKey) {
            throw new Error('Нарушен порядок экранов записи.');
        }

        screen.fields.set(JSON.stringify(event.field), {
            descriptor: structuredClone(event.field),
            expected: structuredClone(event.value),
            message: `Проверьте поле «${event.field.label}».`,
            optional: false,
        });
    }

    if (!visits.size) {
        throw new Error('Запись не содержит экранов.');
    }

    return {
        kind: 'training-state-scenario',
        version: 1,
        steps: [...visits.values()].map(createStep),
    };
}

function createStep(screen: RecordedScreen): ScenarioStep {
    return {
        key: screen.key,
        task: 'Заполните поля и продолжите.',
        transitionMessage: 'Открыт неверный экран. Вернитесь и проверьте заполнение.',
        fields: [...screen.fields.values()],
    };
}
