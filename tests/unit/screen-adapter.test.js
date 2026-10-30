import {expect, jest, test} from '@jest/globals';
import {
    readAdaptedScreen,
    readScreenState,
    resolveScreenAdapters,
} from '../../libs/training-observer/adapters/src';

const screen = {
    schemaVersion: 1,
    status: 'ready',
    reason: 'ready',
    key: 'profile',
    rootNodeId: 'root',
    controls: [],
};
const snapshot = {
    schemaVersion: 1,
    rootId: 'root',
    nodes: {},
    interactiveIds: [],
    stats: {truncated: false},
};
const adapter = (id, read = () => screen) => ({
    id,
    read,
});

test('null and truncated snapshots do not call adapters or invent a ready screen', () => {
    const read = jest.fn(() => screen);
    const adapters = [adapter('example', read)];

    expect(readAdaptedScreen(null, [], adapters)).toMatchObject({
        status: 'unavailable',
        reason: 'no-snapshot',
        controls: [],
    });
    expect(
        readAdaptedScreen({...snapshot, stats: {truncated: true}}, [], adapters),
    ).toMatchObject({status: 'unavailable', reason: 'truncated', controls: []});
    expect(read).not.toHaveBeenCalled();
});

test('an unrecognized application has an explicit missing-adapter diagnostic', () => {
    for (const adapters of [[], [adapter('other-app', () => null)]]) {
        expect(readAdaptedScreen(snapshot, [], adapters)).toEqual({
            schemaVersion: 1,
            status: 'unavailable',
            reason: 'adapter-missing',
            key: null,
            rootNodeId: null,
            controls: [],
        });
    }
});

test('one claiming adapter receives the captured data and retains its exact diagnostic', () => {
    const controls = [{id: 'control'}];
    const loading = {...screen, status: 'loading', reason: 'loading', controls};
    const read = jest.fn(() => loading);

    expect(
        readAdaptedScreen(snapshot, controls, [
            adapter('unrelated', () => null),
            adapter('example', read),
        ]),
    ).toBe(loading);
    expect(read).toHaveBeenCalledWith(snapshot, controls);
});

test('two claiming adapters are ambiguous even when one reports an unavailable screen', () => {
    const missingIdentity = {
        ...screen,
        status: 'unavailable',
        reason: 'identity-missing',
        key: null,
    };

    expect(
        readAdaptedScreen(
            snapshot,
            [],
            [adapter('first'), adapter('second', () => missingIdentity)],
        ),
    ).toMatchObject({
        status: 'ambiguous',
        reason: 'root-ambiguous',
        key: null,
        rootNodeId: null,
        controls: [],
    });
});

test('registration deduplicates the same instance and rejects conflicting IDs', () => {
    const first = adapter('example');

    expect(resolveScreenAdapters([first, first])).toEqual([first]);
    expect(() => resolveScreenAdapters([first, adapter('example')])).toThrow(
        /Duplicate screen adapter ID: example/,
    );
    expect(readAdaptedScreen(snapshot, [], [first, first])).toBe(screen);
});

test('invalid registrations fail before observation starts', () => {
    for (const invalid of [
        null,
        adapter(''),
        adapter(' example '),
        {...adapter('example'), read: null},
    ]) {
        expect(() => resolveScreenAdapters([invalid])).toThrow(
            /Invalid screen adapter registration/,
        );
    }
});

test('the pure SDK exposes the same declarative reader used by existing integrations', () => {
    expect(
        readScreenState(null, [], {
            root: {tagName: 'example-player'},
            identity: {kind: 'attribute', name: 'block-id'},
        }),
    ).toMatchObject({status: 'unavailable', reason: 'no-snapshot'});
});
