import {expect, test} from '@jest/globals';
import {
    procedurePlayerScreenAdapter,
    ProcedurePlayerBlockTracker,
    readProcedurePlayers,
} from '../../libs/training-procedure-player/src';

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
        rootId: 'body',
        capturedAt: '',
        durationMs: 0,
        interactiveIds: controls.map((control) => control.targetNodeId),
        stats: {truncated: false},
        nodes: {
            body: element('body', null, 'body'),
            player: element('player', 'body', 'procedure-player'),
            block: element('block', 'player', 'section', {'block-id': 'A'}),
            field: element('field', 'block', 'input'),
            'other-field': element('other-field', 'player', 'input'),
            foreign: element('foreign', 'body', 'employee-card', {'block-id': 'Foreign'}),
            'foreign-field': element('foreign-field', 'foreign', 'input'),
        },
    };
}

const state = (key, extra = {}) => ({
    schemaVersion: 1,
    status: 'ready',
    reason: 'ready',
    key,
    rootNodeId: 'block',
    controls: [],
    ...extra,
});
const player = (microfrontendId, key, extra) => ({
    microfrontendId,
    state: state(key, extra),
});
const changed = (microfrontendId, previousBlockId, blockId) => ({
    kind: 'block-change',
    source: 'procedure-player',
    microfrontendId,
    previousBlockId,
    blockId,
});

test('recognizes a procedure block and limits controls to its captured subtree', () => {
    const snapshot = fixture();
    const before = JSON.stringify(snapshot);

    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        rootNodeId: 'block',
        controls: [controls[0]],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
});

test('recognizes player-procedure and diagnoses competing roots of either spelling', () => {
    const snapshot = fixture();

    snapshot.nodes.player.tagName = 'player-procedure';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
    snapshot.nodes.second = element('second', 'body', 'procedure-player', {
        'block-id': 'B',
    });
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        controls: [],
    });
});

test('accepts block-id on the player root without requiring a nested marker', () => {
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

test('a foreign microfrontend inside the current block cannot supply its key or controls', () => {
    const snapshot = fixture();

    snapshot.nodes.wrapper = element('wrapper', 'block', 'microfrontend');
    snapshot.nodes.foreign.parentId = 'wrapper';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
});

test('does not claim an absent or hidden player and ignores hidden old blocks', () => {
    const snapshot = fixture();

    snapshot.nodes.player.visible = false;
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
    delete snapshot.nodes.player;
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toBeNull();
    const current = fixture();

    current.nodes.old = element('old', 'player', 'section', {'block-id': 'Old'}, false);
    current.nodes.oldField = element('oldField', 'old', 'input', {}, false);
    expect(procedurePlayerScreenAdapter.read(current, controls)).toMatchObject({
        status: 'ready',
        key: 'A',
        controls: [controls[0]],
    });
});

test('missing, empty and competing block markers remain explicit diagnostics', () => {
    const snapshot = fixture();

    snapshot.nodes.block.attributes = {};
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'unavailable',
        controls: [],
        key: null,
    });
    snapshot.nodes.block.attributes['block-id'] = ' ';
    expect(procedurePlayerScreenAdapter.read(snapshot, controls).reason).toBe(
        'identity-missing',
    );
    snapshot.nodes.block.attributes['block-id'] = 'A';
    snapshot.nodes.other = element('other', 'player', 'section', {'block-id': 'B'});
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        key: null,
        controls: [],
    });
});

test('multiple player roots are ambiguous and a truncated snapshot is unavailable', () => {
    const snapshot = fixture();

    snapshot.nodes.second = element('second', 'body', 'procedure-player', {
        'block-id': 'B',
    });
    expect(procedurePlayerScreenAdapter.read(snapshot, controls)).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        controls: [],
    });
    delete snapshot.nodes.second;
    snapshot.stats.truncated = true;
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

test('projects multiple areas independently and ignores null or unrelated snapshots', () => {
    const first = fixture();
    const second = fixture();
    const unrelated = fixture();

    second.nodes.block.attributes['block-id'] = 'B';
    delete unrelated.nodes.player;
    expect(
        readProcedurePlayers([
            {id: 'first', snapshot: first, logicalControls: controls},
            {id: 'second', snapshot: second, logicalControls: []},
            {id: 'pending', snapshot: null, logicalControls: []},
            {id: 'unrelated', snapshot: unrelated, logicalControls: []},
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

test('baseline, repeated snapshots, edits and a remount of the same key produce no block changes', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    expect(tracker.update([player('mf1', 'A')])).toEqual([]);
    expect(tracker.update([player('mf1', 'A')])).toEqual([]);
    expect(tracker.update([player('mf1', 'A', {controls})])).toEqual([]);
    expect(tracker.update([player('mf1', 'A', {rootNodeId: 'remounted'})])).toEqual([]);
    expect(tracker.update([player('mf1', 'B')])).toEqual([changed('mf1', 'A', 'B')]);
    expect(tracker.update([player('mf1', 'A')])).toEqual([changed('mf1', 'B', 'A')]);
});

test('loading and invalid observations retain the last ready baseline', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    tracker.update([player('mf1', 'A')]);
    expect(tracker.update([player('mf1', 'B', {status: 'loading'})])).toEqual([]);
    expect(tracker.update([player('mf1', null, {status: 'unavailable'})])).toEqual([]);
    expect(tracker.update([player('mf1', null, {status: 'ambiguous'})])).toEqual([]);
    expect(tracker.update([player('mf1', 'B')])).toEqual([changed('mf1', 'A', 'B')]);
});

test('simultaneous players are independent and removed instances lose their baseline', () => {
    const tracker = new ProcedurePlayerBlockTracker();

    tracker.update([player('first', 'A'), player('second', 'A')]);
    expect(tracker.update([player('first', 'B'), player('second', 'C')])).toEqual([
        changed('first', 'A', 'B'),
        changed('second', 'A', 'C'),
    ]);
    expect(tracker.update([player('second', 'C')])).toEqual([]);
    expect(tracker.update([player('first', 'D'), player('second', 'E')])).toEqual([
        changed('second', 'C', 'E'),
    ]);
    tracker.clear();
    expect(tracker.update([player('first', 'F')])).toEqual([]);
});
