import {expect, test} from '@jest/globals';
import {StateRecorder} from '../../libs/training-recording/src/lib/state-recorder';
import {parseStateRecording} from '../../libs/training-contracts/src/lib/recording-codec';
const field = (id, value, extra = {}) => ({
    id,
    targetNodeId: id,
    kind: 'textbox',
    state: {value, redacted: false},
    locatorHints: {
        kind: 'textbox',
        label: id,
        role: 'textbox',
        tagName: 'input',
        context: [],
    },
    ...extra,
});
const screen = (key, controls = []) => ({
    status: 'ready',
    reason: 'ready',
    key,
    rootNodeId: key,
    controls,
});

test('does not record before start, replays no old confirmations and preserves editing order', () => {
    const r = new StateRecorder();
    const a = field('a', 'old'),
        b = field('b', 'old');
    r.observe(screen('A', [a]), {a});
    expect(r.snapshot().events.length).toBe(0);
    r.start(screen('A', [a, b]), {a});
    const b2 = field('b', 'second'),
        a2 = field('a', 'first');
    r.observe(screen('A', [a2, b2]), {a, b: b2});
    r.observe(screen('A', [a2, b2]), {a: a2, b: b2});
    r.observe(screen('A', [a2, b2]), {a: a2, b: b2});
    expect(
        r
            .stop()
            .events.filter((e) => e.kind === 'value')
            .map((e) => e.value),
    ).toEqual(['second', 'first']);
    r.observe(screen('B'), {});
    expect(r.snapshot().events.length).toBe(3);
});
test('attributes departure blur to A before recording B, and counts return visits', () => {
    const r = new StateRecorder();
    const a = field('a', '');
    r.start(screen('A', [a]), {});
    r.observe(screen('B'), {a: field('a', 'last')});
    r.observe(screen('A', [field('new-a', '')]), {});
    const events = r.stop().events;
    expect(events.map((e) => [e.kind, e.screenKey, e.visit])).toEqual([
        ['screen', 'A', 1],
        ['value', 'A', 1],
        ['screen', 'B', 2],
        ['screen', 'A', 3],
    ]);
});
test('loading and remount do not invent transitions; missing observation is explicit', () => {
    const r = new StateRecorder();
    r.start(screen('A'), {});
    r.observe({...screen('B'), status: 'loading'}, {});
    r.observe({...screen('A'), rootNodeId: 'new'}, {});
    r.observe({...screen(null), status: 'unavailable', reason: 'root-missing'}, {});
    r.observe({...screen(null), status: 'unavailable', reason: 'root-missing'}, {});
    expect(r.stop().events.length).toBe(2);
    expect(r.snapshot().complete).toBe(false);
});
test('unknown selection is not an empty expected answer, redacted values are not persisted', () => {
    const r = new StateRecorder();
    const a = field('a', ''),
        b = field('b', '');
    r.start(screen('A', [a, b]), {});
    r.observe(screen('A', [a, b]), {
        a: field('a', 'query', {choice: {selection: {status: 'unknown'}}}),
        b: field('b', 'secret', {state: {value: 'secret', redacted: true}}),
    });
    const result = r.stop();
    expect(result.complete).toBe(false);
    expect(result.events[1].kind).toBe('unavailable');
    expect(!JSON.stringify(result).includes('secret')).toBeTruthy();
});
test('empty string and false remain values; returned documents cannot mutate the recorder', () => {
    const r = new StateRecorder();
    const a = field('a', 'old');
    r.start(screen('A', [a]), {});
    r.observe(screen('A', [a]), {a: field('a', '')});
    const doc = r.snapshot();
    doc.events[1].field.label = 'changed';
    expect(r.snapshot().events[1].field.label).toBe('a');
    expect(r.snapshot().events[1].value).toBe('');
    expect(parseStateRecording(JSON.stringify(r.stop()))).toEqual(r.snapshot());
});
test('codec rejects old action format, malformed fields and inconsistent complete flag', () => {
    expect(() =>
        parseStateRecording('{"kind":"training-recording","version":2}'),
    ).toThrow();
    const r = new StateRecorder();
    r.start(screen('A'), {});
    const doc = r.stop();
    doc.events[0].unexpected = true;
    expect(() => parseStateRecording(JSON.stringify(doc))).toThrow();
    expect(() =>
        parseStateRecording(
            '{"kind":"training-state-recording","version":1,"complete":true,"events":[{"sequence":1,"visit":1,"screenKey":"A","kind":"unavailable","reason":"missing"}]}',
        ),
    ).toThrow();
});

test('new dynamic field can arrive together with its first blur confirmation', () => {
    const r = new StateRecorder();
    r.start(screen('A'), {});
    const a = field('new-field', 'value');
    r.observe(screen('A', [a]), {[a.id]: a});
    expect(r.stop().events[1].value).toBe('value');
});
test('checkbox records initial state and changes, but not disabled-only updates', () => {
    const r = new StateRecorder();
    const a = field('check', undefined, {
        kind: 'checkbox',
        state: {checked: true},
        locatorHints: {
            kind: 'checkbox',
            label: 'Check',
            tagName: 'input',
            role: 'checkbox',
            context: [],
        },
    });
    r.start(screen('A', [a]), {});
    r.observe(screen('A', [{...a, state: {checked: true, disabled: true}}]), {});
    expect(r.snapshot().events.length).toBe(2);
    expect(r.snapshot().events[1].value).toBe(true);
    r.observe(screen('A', [{...a, state: {checked: false}}]), {});
    expect(r.stop().events[2].value).toBe(false);
});

test('initial false radio and checkbox values are recorded per visit, including late fields', () => {
    const controls = ['checkbox', 'radio'].map((kind) =>
        field(kind, undefined, {
            kind,
            state: {checked: false},
            locatorHints: {kind, label: kind, tagName: 'input', role: kind, context: []},
        }),
    );
    const r = new StateRecorder();
    r.start(screen('A'), {});
    r.observe(screen('A', controls), {});
    r.observe(screen('A', controls), {});
    expect(
        r
            .snapshot()
            .events.filter((e) => e.kind === 'value')
            .map((e) => e.value),
    ).toEqual([false, false]);
    r.observe(screen('B'), {});
    r.observe(screen('A', controls), {});
    expect(
        r
            .stop()
            .events.filter((e) => e.kind === 'value')
            .map((e) => [e.visit, e.value]),
    ).toEqual([
        [1, false],
        [1, false],
        [3, false],
        [3, false],
    ]);
});
