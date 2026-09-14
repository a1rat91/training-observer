import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    removeRecordedEvent,
    recordingProblem,
} from '../../libs/training-recording/src/lib/recording-edit.ts';
const recording = () => ({
    kind: 'training-state-recording',
    version: 1,
    complete: true,
    events: [
        { sequence: 1, kind: 'screen', visit: 1, screenKey: 'A' },
        { sequence: 2, kind: 'value', visit: 1, screenKey: 'A', field: { label: 'Name' }, value: 'Anna' },
        { sequence: 3, kind: 'screen', visit: 2, screenKey: 'B' },
    ],
});
test('deletion removes one row, renumbers sequences and does not mutate the original', () => {
    const original = recording();
    const edited = removeRecordedEvent(original, 2);
    assert.equal(original.events.length, 3);
    assert.equal(edited.events.length, 2);
    assert.equal(edited.events[1].sequence, 2);
    assert.equal(edited.events[1].visit, 2);
    assert.equal(edited.complete, true);
    edited.events[0].screenKey = 'Changed';
    assert.equal(original.events[0].screenKey, 'A');
});
test('removing a screen boundary cannot silently reassign its fields to another screen', () => {
    const edited = removeRecordedEvent(recording(), 1);
    assert.equal(edited.complete, false);
    assert.match(recordingProblem(edited), /отсутствует граница/);
    const repaired = removeRecordedEvent(edited, 1);
    assert.equal(repaired.complete, true);
    assert.equal(repaired.events[0].visit, 2);
});
test('explicitly excluding an unknown field clears that known issue, but not other issues', () => {
    const original = recording();
    original.complete = false;
    original.events[1] = { ...original.events[1], kind: 'unavailable', value: undefined, reason: 'unknown' };
    assert.equal(removeRecordedEvent(original, 2).complete, true);
    assert.equal(removeRecordedEvent(original, 3).complete, false);
});
test('empty or unexplained incomplete recordings are not made complete by deletion', () => {
    const original = recording();
    original.complete = false;
    assert.equal(removeRecordedEvent(original, 2).complete, false);
    assert.equal(removeRecordedEvent({ ...recording(), events: [recording().events[0]] }, 1).complete, false);
    assert.throws(() => removeRecordedEvent(recording(), 999));
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
    assert.throws(() => removeRecordedEvent(original, 3), /пропуск наблюдения нельзя удалить/);
});
