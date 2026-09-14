/** Immutable journal editing. Keep visit IDs when deleting rows so orphaned fields cannot silently
 * move to another screen. Recompute known quality problems, but retain unexplained incomplete status.
 * Undo/history and persistence are owned by the editor, not this headless transformation.
 */
import type {StateRecording} from './state-recorder';

export function recordingProblem(recording: StateRecording): string {
    if (!recording.events.length) return 'Запись пуста. Отмените удаление или запишите новый пример.';
    const screens = new Map<number, string>();
    for (const event of recording.events) {
        if (event.kind === 'screen') {
            if (screens.has(event.visit)) return 'В записи повторяется граница одного посещения экрана.';
            screens.set(event.visit, event.screenKey);
        } else if (screens.get(event.visit) !== event.screenKey) {
            return `Для строки ${event.sequence} отсутствует граница экрана. Удалите связанные строки или отмените удаление.`;
        }
        if (event.kind === 'unavailable') return 'В записи осталось неподтверждённое значение или пропуск наблюдения.';
    }
    return '';
}

export function removeRecordedEvent(recording: StateRecording, sequence: number): StateRecording {
    const removed = recording.events.find(event => event.sequence === sequence);
    if (!removed) throw new Error('Строка записи не найдена.');
    if (removed.kind === 'unavailable' && !removed.field) {
        throw new Error('Общий пропуск наблюдения нельзя удалить: неизвестно, какие действия были пропущены.');
    }
    const unexplainedIncomplete = !recording.complete && !recordingProblem(recording);
    const events = recording.events.filter(event => event.sequence !== sequence).map((event, index) => ({...event, sequence: index + 1}));
    const result: StateRecording = {kind: recording.kind, version: recording.version, complete: true, events};
    return structuredClone({...result, complete: !unexplainedIncomplete && !recordingProblem(result)});
}
