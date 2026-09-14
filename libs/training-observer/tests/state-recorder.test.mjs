import assert from 'node:assert/strict';
import {test} from 'node:test';
import {StateRecorder} from '../src/lib/recording/state-recorder.ts';
import {parseStateRecording} from '../src/lib/recording/recording-codec.ts';
const field = (id, value, extra = {}) => ({id, targetNodeId: id, kind: 'textbox', state: {value, redacted: false},
    locatorHints: {kind: 'textbox', label: id, role: 'textbox', tagName: 'input', context: []}, ...extra});
const screen = (key, controls = []) => ({status: 'ready', reason: 'ready', key, rootNodeId: key, controls});

test('does not record before start, replays no old confirmations and preserves editing order', () => {
    const r = new StateRecorder();
    const a = field('a', 'old'), b = field('b', 'old');
    r.observe(screen('A', [a]), {a});
    assert.equal(r.snapshot().events.length, 0);
    r.start(screen('A', [a, b]), {a});
    const b2 = field('b', 'second'), a2 = field('a', 'first');
    r.observe(screen('A', [a2, b2]), {a, b: b2});
    r.observe(screen('A', [a2, b2]), {a: a2, b: b2});
    r.observe(screen('A', [a2, b2]), {a: a2, b: b2});
    assert.deepEqual(r.stop().events.filter(e => e.kind === 'value').map(e => e.value), ['second', 'first']);
    r.observe(screen('B'), {});
    assert.equal(r.snapshot().events.length, 3);
});
test('attributes departure blur to A before recording B, and counts return visits', () => {
    const r = new StateRecorder(); const a = field('a', '');
    r.start(screen('A', [a]), {});
    r.observe(screen('B'), {a: field('a', 'last')});
    r.observe(screen('A', [field('new-a', '')]), {});
    const events = r.stop().events;
    assert.deepEqual(events.map(e => [e.kind, e.screenKey, e.visit]), [['screen','A',1], ['value','A',1], ['screen','B',2], ['screen','A',3]]);
});
test('loading and remount do not invent transitions; missing observation is explicit', () => {
    const r = new StateRecorder(); r.start(screen('A'), {});
    r.observe({...screen('B'), status: 'loading'}, {});
    r.observe({...screen('A'), rootNodeId: 'new'}, {});
    r.observe({...screen(null), status: 'unavailable', reason: 'root-missing'}, {});
    r.observe({...screen(null), status: 'unavailable', reason: 'root-missing'}, {});
    assert.equal(r.stop().events.length, 2);
    assert.equal(r.snapshot().complete, false);
});
test('unknown selection is not an empty expected answer, redacted values are not persisted', () => {
    const r = new StateRecorder(); const a = field('a', ''), b = field('b', '');
    r.start(screen('A', [a, b]), {});
    r.observe(screen('A', [a, b]), {a: field('a', 'query', {choice: {selection: {status: 'unknown'}}}), b: field('b', 'secret', {state: {value: 'secret', redacted: true}})});
    const result = r.stop();
    assert.equal(result.complete, false);
    assert.equal(result.events[1].kind, 'unavailable');
    assert.ok(!JSON.stringify(result).includes('secret'));
});
test('empty string and false remain values; returned documents cannot mutate the recorder', () => {
    const r = new StateRecorder(); const a = field('a', 'old');
    r.start(screen('A', [a]), {});
    r.observe(screen('A', [a]), {a: field('a', '')});
    const doc = r.snapshot(); doc.events[1].field.label = 'changed';
    assert.equal(r.snapshot().events[1].field.label, 'a');
    assert.equal(r.snapshot().events[1].value, '');
    assert.deepEqual(parseStateRecording(JSON.stringify(r.stop())), r.snapshot());
});
test('codec rejects old action format, malformed fields and inconsistent complete flag', () => {
    assert.throws(() => parseStateRecording('{"kind":"training-recording","version":2}'));
    const r = new StateRecorder(); r.start(screen('A'), {});
    const doc = r.stop(); doc.events[0].unexpected = true;
    assert.throws(() => parseStateRecording(JSON.stringify(doc)));
    assert.throws(() => parseStateRecording('{"kind":"training-state-recording","version":1,"complete":true,"events":[{"sequence":1,"visit":1,"screenKey":"A","kind":"unavailable","reason":"missing"}]}'));
});

test('new dynamic field can arrive together with its first blur confirmation', () => {
    const r = new StateRecorder(); r.start(screen('A'), {});
    const a = field('new-field', 'value');
    r.observe(screen('A', [a]), {[a.id]: a});
    assert.equal(r.stop().events[1].value, 'value');
});
test('checkbox records false on change, not on disabled or initial rendering', () => {
    const r = new StateRecorder();
    const a = field('check', undefined, {kind: 'checkbox', state: {checked: true}, locatorHints: {kind: 'checkbox', label: 'Check', tagName: 'input', role: 'checkbox', context: []}});
    r.start(screen('A', [a]), {});
    r.observe(screen('A', [{...a, state: {checked: true, disabled: true}}]), {});
    assert.equal(r.snapshot().events.length, 1);
    r.observe(screen('A', [{...a, state: {checked: false}}]), {});
    assert.equal(r.stop().events[1].value, false);
});
