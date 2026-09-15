import {expect, test} from '@jest/globals';
import {readScreenState} from '../../libs/training-observer/src/lib/screen/screen-state-reader';
import {ScreenVisitTracker} from '../../libs/training-observer/src/lib/screen/screen-visit-tracker';

const options = {
    root: {tagName: 'section', attribute: {name: 'aria-label', value: 'Editor'}},
    identity: {kind: 'attribute', name: 'id'},
    loading: {name: 'aria-busy', value: 'true'},
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
        stats: {truncated: false},
        nodes: {
            body: element('body', null),
            screen: element(
                'screen',
                'body',
                {'aria-label': 'Editor', id: 'profile'},
                'section',
            ),
            wrapper: element('wrapper', 'screen'),
            a: element('a', 'wrapper'),
            outside: element('outside', 'body'),
        },
    };
}
const controls = [
    {id: 'control:a', targetNodeId: 'a'},
    {id: 'control:outside', targetNodeId: 'outside'},
];
const read = (snapshot, config = options) => readScreenState(snapshot, controls, config);

test('projects only controls below a configured screen and does not mutate the snapshot', () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);
    expect(read(snapshot).key).toBe('profile');
    expect(read(snapshot).status).toBe('ready');
    expect(read(snapshot).controls).toEqual([controls[0]]);
    expect(JSON.stringify(snapshot)).toBe(before);
});
test('supports a different application tag and existing identity attribute without domain knowledge', () => {
    const snapshot = fixture();
    snapshot.nodes.screen = element('screen', 'body', {name: 'account'}, 'account-panel');
    expect(
        read(snapshot, {
            root: {tagName: 'account-panel'},
            identity: {kind: 'attribute', name: 'name'},
        }).key,
    ).toBe('account');
});
test('null, missing, truncated and missing identity are explicit unavailable states', () => {
    expect(read(null).reason).toBe('no-snapshot');
    const snapshot = fixture();
    snapshot.stats.truncated = true;
    expect(read(snapshot).reason).toBe('truncated');
    snapshot.stats.truncated = false;
    snapshot.nodes.screen.attributes.id = ' ';
    expect(read(snapshot).reason).toBe('identity-missing');
    delete snapshot.nodes.screen;
    expect(read(snapshot).reason).toBe('root-missing');
});
test('two visible roots are ambiguous, even with different logical IDs; hidden old screens are ignored', () => {
    const snapshot = fixture();
    snapshot.nodes.other = element(
        'other',
        'body',
        {'aria-label': 'Editor', id: 'other'},
        'section',
    );
    expect(read(snapshot).status).toBe('ambiguous');
    snapshot.nodes.other.visible = false;
    expect(read(snapshot).key).toBe('profile');
});
test('loading is explicit and does not mean a ready new screen', () => {
    const snapshot = fixture();
    snapshot.nodes.screen.attributes['aria-busy'] = 'true';
    expect(read(snapshot).status).toBe('loading');
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
    const config = {...options, identity: {kind: 'text'}};
    expect(read(snapshot, config).key).toBe('Stable key');
    snapshot.nodes.a.state = {value: 'Changed answer'};
    expect(read(snapshot, config).key).toBe('Stable key');
});
test('refuses an unspecified root or empty attribute name', () => {
    expect(() => read(fixture(), {...options, root: {}})).toThrow(/explicit/);
    expect(() =>
        read(fixture(), {...options, identity: {kind: 'attribute', name: ''}}),
    ).toThrow(/explicit/);
});
test('visits distinguish A → B → A but not a remount; unknown and loading retain last ready visit', () => {
    const tracker = new ScreenVisitTracker();
    const a = read(fixture());
    expect(tracker.update(a).number).toBe(1);
    expect(tracker.update({...a, rootNodeId: 'new-node'}).number).toBe(1);
    expect(tracker.update({...a, status: 'loading', key: 'b'}).number).toBe(1);
    expect(tracker.update({...a, key: 'b'}).number).toBe(2);
    expect(tracker.update(read(null)).key).toBe('b');
    expect(tracker.update(a).number).toBe(3);
    tracker.reset();
    expect(tracker.update(read(null))).toBe(null);
    expect(tracker.update(a).number).toBe(1);
});

function withIdentityElement(snapshot, id = 'screen-code', parentId = 'wrapper') {
    snapshot.nodes[id] = element(
        id,
        parentId,
        {'aria-label': 'Screen key', title: 'details'},
        'output',
    );
    snapshot.nodes[id].children = [`${id}-text`, 'a'];
    snapshot.nodes[`${id}-text`] = {
        id: `${id}-text`,
        parentId: id,
        kind: 'text',
        text: ' Details ',
        visible: true,
    };
    return snapshot;
}
const separateIdentity = {
    ...options,
    identity: {
        kind: 'text',
        element: {
            tagName: 'output',
            attribute: {name: 'aria-label', value: 'Screen key'},
        },
    },
};

test('reads a nested identity independently from the container and preserves field scope', () => {
    const snapshot = withIdentityElement(fixture());
    const before = JSON.stringify(snapshot);
    expect(read(snapshot, separateIdentity)).toMatchObject({
        key: 'Details',
        rootNodeId: 'screen',
        controls: [controls[0]],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
    snapshot.nodes['screen-code'].parentId = 'screen';
    snapshot.nodes.a.state = {value: 'Other value'};
    expect(read(snapshot, separateIdentity).key).toBe('Details');
    expect(
        read(snapshot, {
            ...separateIdentity,
            identity: {...separateIdentity.identity, kind: 'attribute', name: 'title'},
        }).key,
    ).toBe('details');
});

test('does not use identity elements from siblings or portals and does not choose between duplicates', () => {
    const snapshot = withIdentityElement(fixture());
    withIdentityElement(snapshot, 'outside-code', 'outside');
    expect(read(snapshot, separateIdentity).key).toBe('Details');
    withIdentityElement(snapshot, 'duplicate');
    expect(read(snapshot, separateIdentity)).toMatchObject({
        status: 'ambiguous',
        reason: 'identity-ambiguous',
        key: null,
        controls: [],
    });
    snapshot.nodes.duplicate.visible = false;
    expect(read(snapshot, separateIdentity).key).toBe('Details');
    snapshot.nodes['screen-code'].visible = false;
    expect(read(snapshot, separateIdentity).reason).toBe('identity-element-missing');
});

test('empty identity text cannot fall back to the container ID or nested field text', () => {
    const snapshot = withIdentityElement(fixture());
    snapshot.nodes['screen-code-text'].text = ' ';
    snapshot.nodes.a.children = ['answer'];
    snapshot.nodes.answer = {
        id: 'answer',
        parentId: 'a',
        kind: 'text',
        text: 'User answer',
    };
    expect(read(snapshot, separateIdentity).reason).toBe('identity-missing');
});

test('positive readiness waits for the exact attribute before resolving a possibly incomplete identity', () => {
    const snapshot = fixture();
    const config = {...separateIdentity, ready: {name: 'aria-busy', value: 'false'}};
    const tracker = new ScreenVisitTracker();
    expect(read(snapshot, config)).toMatchObject({
        status: 'loading',
        reason: 'not-ready',
        key: null,
        rootNodeId: 'screen',
        controls: [],
    });
    expect(tracker.update(read(snapshot, config))).toBe(null);
    snapshot.nodes.screen.attributes['aria-busy'] = 'true';
    expect(read(snapshot, config).reason).toBe('not-ready');
    snapshot.nodes.screen.attributes['aria-busy'] = 'false';
    expect(read(snapshot, config).reason).toBe('identity-element-missing');
    withIdentityElement(snapshot);
    expect(read(snapshot, config).status).toBe('ready');
    expect(tracker.update(read(snapshot, config)).key).toBe('Details');
    snapshot.nodes.screen.attributes['aria-busy'] = 'true';
    expect(tracker.update(read(snapshot, config)).number).toBe(1);
});

test('loading still takes precedence when the positive readiness flag is satisfied', () => {
    const snapshot = fixture();
    snapshot.nodes.screen.attributes['aria-busy'] = 'true';
    snapshot.nodes.screen.attributes['data-state'] = 'ready';
    expect(
        read(snapshot, {...options, ready: {name: 'data-state', value: 'ready'}}).status,
    ).toBe('loading');
});

test('rejects empty selectors and readiness names before trying to read a snapshot', () => {
    for (const config of [
        {...options, identity: {kind: 'text', element: {}}},
        {...options, identity: {kind: 'text', element: {tagName: ' '}}},
        {...options, ready: {name: '', value: 'ready'}},
        {...options, loading: {name: ' ', value: 'true'}},
    ]) {
        expect(() => read(null, config)).toThrow(/explicit/);
    }
});
