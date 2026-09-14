import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readScreenState } from '../../libs/training-observer/src/lib/screen/screen-state-reader.ts';
import { ScreenVisitTracker } from '../../libs/training-observer/src/lib/screen/screen-visit-tracker.ts';

const options = {
    root: { tagName: 'section', attribute: { name: 'aria-label', value: 'Editor' } },
    identity: { kind: 'attribute', name: 'id' },
    loading: { name: 'aria-busy', value: 'true' },
};
const element = (id, parentId, attributes = {}, tagName = 'div') => ({
    id,
    parentId,
    attributes,
    tagName,
    kind: 'element',
    visible: true,
    children: [],
});
function fixture() {
    return {
        schemaVersion: 1,
        rootId: 'body',
        capturedAt: '',
        durationMs: 0,
        interactiveIds: ['a', 'outside'],
        stats: { truncated: false },
        nodes: {
            body: element('body', null),
            screen: element('screen', 'body', { 'aria-label': 'Editor', id: 'profile' }, 'section'),
            wrapper: element('wrapper', 'screen'),
            a: element('a', 'wrapper'),
            outside: element('outside', 'body'),
        },
    };
}
const controls = [
    { id: 'control:a', targetNodeId: 'a' },
    { id: 'control:outside', targetNodeId: 'outside' },
];
const read = (snapshot, config = options) => readScreenState(snapshot, controls, config);

test('projects only controls below a configured screen and does not mutate the snapshot', () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);
    assert.equal(read(snapshot).key, 'profile');
    assert.equal(read(snapshot).status, 'ready');
    assert.deepEqual(read(snapshot).controls, [controls[0]]);
    assert.equal(JSON.stringify(snapshot), before);
});
test('supports a different application tag and existing identity attribute without domain knowledge', () => {
    const snapshot = fixture();
    snapshot.nodes.screen = element('screen', 'body', { name: 'account' }, 'account-panel');
    assert.equal(
        read(snapshot, { root: { tagName: 'account-panel' }, identity: { kind: 'attribute', name: 'name' } })
            .key,
        'account',
    );
});
test('null, missing, truncated and missing identity are explicit unavailable states', () => {
    assert.equal(read(null).reason, 'no-snapshot');
    const snapshot = fixture();
    snapshot.stats.truncated = true;
    assert.equal(read(snapshot).reason, 'truncated');
    snapshot.stats.truncated = false;
    snapshot.nodes.screen.attributes.id = ' ';
    assert.equal(read(snapshot).reason, 'identity-missing');
    delete snapshot.nodes.screen;
    assert.equal(read(snapshot).reason, 'root-missing');
});
test('two visible roots are ambiguous, even with different logical IDs; hidden old screens are ignored', () => {
    const snapshot = fixture();
    snapshot.nodes.other = element('other', 'body', { 'aria-label': 'Editor', id: 'other' }, 'section');
    assert.equal(read(snapshot).status, 'ambiguous');
    snapshot.nodes.other.visible = false;
    assert.equal(read(snapshot).key, 'profile');
});
test('loading is explicit and does not mean a ready new screen', () => {
    const snapshot = fixture();
    snapshot.nodes.screen.attributes['aria-busy'] = 'true';
    assert.equal(read(snapshot).status, 'loading');
});
test('direct text identity excludes descendant fields and their values', () => {
    const snapshot = fixture();
    snapshot.nodes.screen.children = ['heading', 'wrapper'];
    snapshot.nodes.heading = {
        id: 'heading',
        parentId: 'screen',
        kind: 'text',
        text: ' Stable key ',
        visible: true,
    };
    const config = { ...options, identity: { kind: 'text' } };
    assert.equal(read(snapshot, config).key, 'Stable key');
    snapshot.nodes.a.state = { value: 'Changed answer' };
    assert.equal(read(snapshot, config).key, 'Stable key');
});
test('refuses an unspecified root or empty attribute name', () => {
    assert.throws(() => read(fixture(), { ...options, root: {} }), /explicit/);
    assert.throws(
        () => read(fixture(), { ...options, identity: { kind: 'attribute', name: '' } }),
        /explicit/,
    );
});
test('visits distinguish A → B → A but not a remount; unknown and loading retain last ready visit', () => {
    const tracker = new ScreenVisitTracker();
    const a = read(fixture());
    assert.equal(tracker.update(a).number, 1);
    assert.equal(tracker.update({ ...a, rootNodeId: 'new-node' }).number, 1);
    assert.equal(tracker.update({ ...a, status: 'loading', key: 'b' }).number, 1);
    assert.equal(tracker.update({ ...a, key: 'b' }).number, 2);
    assert.equal(tracker.update(read(null)).key, 'b');
    assert.equal(tracker.update(a).number, 3);
    tracker.reset();
    assert.equal(tracker.update(read(null)), null);
    assert.equal(tracker.update(a).number, 1);
});
