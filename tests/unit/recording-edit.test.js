import {expect, test} from '@jest/globals';
import {
    removeRecordedEvent,
    recordingProblem,
} from '../../libs/training-recording/src/lib/recording-edit';
const recording = () => ({
    kind: 'training-state-recording',
    version: 1,
    complete: true,
    events: [
        {sequence: 1, kind: 'screen', visit: 1, screenKey: 'A'},
        {
            sequence: 2,
            kind: 'value',
            visit: 1,
            screenKey: 'A',
            field: {label: 'Name'},
            value: 'Anna',
        },
        {sequence: 3, kind: 'screen', visit: 2, screenKey: 'B'},
    ],
});
test('deletion removes one row, renumbers sequences and does not mutate the original', () => {
    const original = recording();
    const edited = removeRecordedEvent(original, 2);
    expect(original.events.length).toBe(3);
    expect(edited.events.length).toBe(2);
    expect(edited.events[1].sequence).toBe(2);
    expect(edited.events[1].visit).toBe(2);
    expect(edited.complete).toBe(true);
    edited.events[0].screenKey = 'Changed';
    expect(original.events[0].screenKey).toBe('A');
});
test('removing a screen boundary cannot silently reassign its fields to another screen', () => {
    const edited = removeRecordedEvent(recording(), 1);
    expect(edited.complete).toBe(false);
    expect(recordingProblem(edited)).toMatch(/отсутствует граница/);
    const repaired = removeRecordedEvent(edited, 1);
    expect(repaired.complete).toBe(true);
    expect(repaired.events[0].visit).toBe(2);
});
test('explicitly excluding an unknown field clears that known issue, but not other issues', () => {
    const original = recording();
    original.complete = false;
    original.events[1] = {
        ...original.events[1],
        kind: 'unavailable',
        value: undefined,
        reason: 'unknown',
    };
    expect(removeRecordedEvent(original, 2).complete).toBe(true);
    expect(removeRecordedEvent(original, 3).complete).toBe(false);
});
test('empty or unexplained incomplete recordings are not made complete by deletion', () => {
    const original = recording();
    original.complete = false;
    expect(removeRecordedEvent(original, 2).complete).toBe(false);
    expect(
        removeRecordedEvent({...recording(), events: [recording().events[0]]}, 1)
            .complete,
    ).toBe(false);
    expect(() => removeRecordedEvent(recording(), 999)).toThrow();
});
test('removing a global observation gap cannot certify the unknown path', () => {
    const original = recording();
    original.complete = false;
    original.events.splice(2, 0, {
        sequence: 3,
        kind: 'unavailable',
        visit: 1,
        screenKey: 'A',
        reason: 'root-missing',
    });
    original.events[3].sequence = 4;
    expect(() => removeRecordedEvent(original, 3)).toThrow(
        /пропуск наблюдения нельзя удалить/,
    );
});
