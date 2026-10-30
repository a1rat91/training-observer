import {expect, test} from '@jest/globals';
import {
    procedurePlayerScreenAdapter,
    ProcedurePlayerBlockTracker,
    readProcedurePlayers,
} from '@training-observer/procedure-player';

const element = (id, parentId, tagName, attributes = {}, visible = true) => ({
    id,
    parentId,
    tagName,
    attributes,
    visible,
    kind: 'element',
    children: [],
});
const controls = [
    {id: 'inside', targetNodeId: 'field', state: {value: 'Answer'}},
    {id: 'other-block', targetNodeId: 'other-field', state: {value: 'Other'}},
    {id: 'outside', targetNodeId: 'foreign-field', state: {value: 'Foreign'}},
];

function fixture() {
    return {
        schemaVersion: 1,
        rootId: 'player',
        capturedAt: '',
        durationMs: 0,
        interactiveIds: controls.map((control) => control.targetNodeId),
        stats: {truncated: false},
        nodes: {
            player: element('player', null, 'workflow-shell'),
            block: element('block', 'player', 'section', {'block-id': 'A'}),
            field: element('field', 'block', 'input'),
            'other-field': element('other-field', 'player', 'input'),
            foreign: element('foreign', null, 'employee-card', {'block-id': 'Foreign'}),
            'foreign-field': element('foreign-field', 'foreign', 'input'),
        },
    };
}

function pageFixture() {
    const snapshot = fixture();

    snapshot.rootId = 'body';
    snapshot.nodes.body = element('body', null, 'body');
    snapshot.nodes.firstWrapper = element('firstWrapper', 'body', 'microfrontend');
    snapshot.nodes.player.parentId = 'firstWrapper';
    snapshot.nodes.secondWrapper = element('secondWrapper', 'body', 'microfrontend');
    snapshot.nodes.foreign.parentId = 'secondWrapper';
    snapshot.nodes.foreign.attributes = {};

    return snapshot;
}

function area(
    id,
    key,
    {loading = false, ambiguous = false, truncated = false, logicalControls = []} = {},
) {
    const snapshot = fixture();

    snapshot.nodes.block.attributes = key === null ? {} : {'block-id': key};
    snapshot.nodes.player.attributes = loading ? {'aria-busy': 'true'} : {};
    snapshot.stats.truncated = truncated;

    if (ambiguous) {
        snapshot.nodes.second = element('second', 'player', 'section', {
            'block-id': 'Other',
        });
    }

    return {id, snapshot, logicalControls};
}

const changed = (microfrontendId, previousBlockId, blockId) => ({
    kind: 'block-change',
    source: 'procedure-player',
    microfrontendId,
    previousBlockId,
    blockId,
});

test('does not claim a snapshot without a captured root', () => {
    const snapshot = fixture();

    snapshot.rootId = null;
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
});

test.each(['div', 'workflow-shell', 'employee-settings'])(
    'recognizes a block inside an arbitrary %s MF root and limits its controls',
    (tagName) => {
        const snapshot = fixture();

        snapshot.nodes.player.tagName = tagName;
        const before = JSON.stringify(snapshot);

        expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
            status: 'ready',
            key: 'A',
            rootNodeId: 'block',
            controls: [controls[0]],
        });
        expect(JSON.stringify(snapshot)).toBe(before);
    },
);

test('accepts block-id on the captured MF root without a nested marker', () => {
    const snapshot = fixture();

    snapshot.nodes.player.attributes['block-id'] = 'Root block';
    snapshot.nodes.block.attributes = {};
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'Root block',
        rootNodeId: 'player',
        controls: controls.slice(0, 2),
    });
});

test('a nested foreign microfrontend cannot supply its block key or controls', () => {
    const snapshot = fixture();

    snapshot.nodes.wrapper = element('wrapper', 'block', 'microfrontend');
    snapshot.nodes.foreign.parentId = 'wrapper';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
    snapshot.nodes.block.attributes = {};
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
});

test('a body capture chooses its single block-owning MF among unrelated siblings and diagnoses a competing nested owner', () => {
    const snapshot = pageFixture();

    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
    snapshot.nodes.nestedWrapper = element('nestedWrapper', 'block', 'microfrontend');
    snapshot.nodes.nestedRoot = element('nestedRoot', 'nestedWrapper', 'foreign-app', {
        'block-id': 'Nested',
    });
    snapshot.nodes.nestedField = element('nestedField', 'nestedRoot', 'input');
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        controls: [],
    });
});

test.each(['body', 'html'])(
    'a whole-%s capture finds a sole block owner nested within an unrelated MF',
    (tagName) => {
        const snapshot = pageFixture();

        snapshot.nodes.body.tagName = tagName;
        snapshot.nodes.block.attributes = {};
        snapshot.nodes.nestedWrapper = element(
            'nestedWrapper',
            'player',
            'microfrontend',
        );
        snapshot.nodes.nestedRoot = element(
            'nestedRoot',
            'nestedWrapper',
            'unrelated-tag',
            {'block-id': 'Nested'},
        );
        snapshot.nodes.nestedField = element('nestedField', 'nestedRoot', 'input');
        const nestedControl = {targetNodeId: 'nestedField'};

        expect(
            procedurePlayerScreenAdapter.read(snapshot, [...controls, nestedControl]),
        ).toMatchObject({
            status: 'ready',
            key: 'Nested',
            rootNodeId: 'nestedRoot',
            controls: [nestedControl],
        });
    },
);

test('independent block-owning MFs in a whole-page capture are ambiguous', () => {
    const snapshot = pageFixture();

    snapshot.nodes.foreign.attributes['block-id'] = 'B';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        key: null,
        controls: [],
    });
});

test('does not claim hidden blocks or a missing capture root', () => {
    const snapshot = fixture();

    snapshot.nodes.player.visible = false;
    snapshot.nodes.block.visible = false;
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
    delete snapshot.nodes.player;
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
    const current = fixture();

    current.nodes.old = element('old', 'player', 'section', {'block-id': 'Old'}, false);
    expect(procedurePlayerScreenAdapter.read(current, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
});

test.each([
    ['scoped MF', fixture],
    ['whole page', pageFixture],
])(
    'recognizes a visible block in a display-contents MF host: %s',
    (_, createSnapshot) => {
        const snapshot = createSnapshot();

        snapshot.nodes.player.visible = false;
        expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
            status: 'ready',
            key: 'A',
            controls: [controls[0]],
        });
    },
);

test('an unrelated native form with no block marker is not claimed', () => {
    const snapshot = fixture();

    snapshot.nodes.block.attributes = {};
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
});

test('empty and competing visible block markers remain explicit diagnostics', () => {
    const snapshot = fixture();

    snapshot.nodes.block.attributes['block-id'] = ' ';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'unavailable',
        reason: 'identity-missing',
        controls: [],
        key: null,
    });
    snapshot.nodes.block.attributes['block-id'] = 'A';
    snapshot.nodes.other = element('other', 'player', 'section', {'block-id': 'B'});
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        key: null,
        controls: [],
    });
});

test('a truncated captured block remains unavailable even during loading', () => {
    const snapshot = fixture();

    snapshot.stats.truncated = true;
    snapshot.nodes.player.attributes['aria-busy'] = 'true';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'unavailable',
        reason: 'truncated',
        controls: [],
    });
});

test.each(['player', 'block'])(
    'reads loading from the %s without declaring a ready transition',
    (id) => {
        const snapshot = fixture();

        snapshot.nodes[id].attributes['aria-busy'] = 'true';
        expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
            status: 'loading',
            reason: 'loading',
            key: 'A',
        });
    },
);

test('projects multiple arbitrary areas independently and ignores null or unrelated snapshots', () => {
    expect(
        readProcedurePlayers([
            area('first', 'A', {logicalControls: controls}),
            area('second', 'B'),
            {id: 'pending', snapshot: null, logicalControls: []},
            area('unrelated', null),
        ]),
    ).toEqual([
        {
            microfrontendId: 'first',
            state: expect.objectContaining({key: 'A', controls: [controls[0]]}),
        },
        {
            microfrontendId: 'second',
            state: expect.objectContaining({key: 'B', controls: []}),
        },
    ]);
});

test('baseline, repeated snapshots, control edits and remounted block DOM produce no duplicate changes', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    expect(tracker.update([area('mf1', 'A')])).toEqual([]);
    expect(tracker.update([area('mf1', 'A')])).toEqual([]);
    expect(tracker.update([area('mf1', 'A', {logicalControls: controls})])).toEqual([]);
    const remounted = area('mf1', 'A');

    remounted.snapshot.nodes.replacement = {
        ...remounted.snapshot.nodes.block,
        id: 'replacement',
    };
    remounted.snapshot.nodes.field.parentId = 'replacement';
    delete remounted.snapshot.nodes.block;
    expect(tracker.update([remounted])).toEqual([]);
    expect(tracker.update([area('mf1', 'B')])).toEqual([changed('mf1', 'A', 'B')]);
    expect(tracker.update([area('mf1', 'A')])).toEqual([changed('mf1', 'B', 'A')]);
});

test('loading, removed markers, pending snapshots and invalid observations retain a mounted MF baseline', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    tracker.update([area('mf1', 'A')]);
    expect(tracker.update([area('mf1', null, {loading: true})])).toEqual([]);
    expect(tracker.update([{id: 'mf1', snapshot: null, logicalControls: []}])).toEqual(
        [],
    );
    expect(tracker.update([area('mf1', 'B', {loading: true})])).toEqual([]);
    expect(tracker.update([area('mf1', 'B', {truncated: true})])).toEqual([]);
    expect(tracker.update([area('mf1', 'B', {ambiguous: true})])).toEqual([]);
    expect(tracker.update([area('mf1', 'B')])).toEqual([changed('mf1', 'A', 'B')]);
});

test('simultaneous MFs are independent and a real unmount removes only that baseline', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    tracker.update([area('first', 'A'), area('second', 'A'), area('unrelated', null)]);
    expect(
        tracker.update([
            area('first', 'B'),
            area('second', 'C'),
            area('unrelated', null),
        ]),
    ).toEqual([changed('first', 'A', 'B'), changed('second', 'A', 'C')]);
    expect(tracker.update([area('second', 'C')])).toEqual([]);
    expect(tracker.update([area('first', 'D'), area('second', 'E')])).toEqual([
        changed('second', 'C', 'E'),
    ]);
    tracker.clear();
    expect(tracker.update([area('first', 'F')])).toEqual([]);
});
