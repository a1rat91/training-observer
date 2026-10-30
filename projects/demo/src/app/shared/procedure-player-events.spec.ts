import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {PageObservation} from '@training-observer/core';
import {type MicrofrontendSnapshot} from '@training-observer/core/models';
import {
    type ProcedurePlayerBlockChange,
    ProcedurePlayerObserver,
} from '@training-observer/procedure-player';
import {BehaviorSubject} from 'rxjs';

function area(key: string | null): MicrofrontendSnapshot {
    return {
        id: 'player-area',
        name: 'workflow-shell',
        parentId: null,
        logicalControls: [],
        confirmedControls: {},
        scanCount: 1,
        revision: 1,
        error: null,
        snapshot: {
            schemaVersion: 1,
            rootId: 'player-root',
            capturedAt: '',
            durationMs: 0,
            interactiveIds: [],
            stats: {
                nodeCount: 1,
                elementCount: 1,
                textCount: 0,
                boundaryCount: 0,
                truncated: false,
                limitsReached: [],
            },
            nodes: {
                'player-root': {
                    kind: 'element',
                    id: 'player-root',
                    parentId: null,
                    tagName: 'workflow-shell',
                    path: '/workflow-shell',
                    attributes: key === null ? {} : {'block-id': key},
                    label: '',
                    children: [],
                    rects: [],
                    visible: true,
                    inViewport: true,
                    interactive: false,
                    interactionReasons: [],
                    pointerActionable: false,
                    hitTest: 'not-tested',
                    boundaries: [],
                    state: {
                        disabled: false,
                        readOnly: false,
                        inert: false,
                        required: false,
                        invalid: false,
                        redacted: false,
                    },
                },
            },
        },
    };
}

let source: BehaviorSubject<readonly MicrofrontendSnapshot[]>;
const areas = signal<readonly MicrofrontendSnapshot[]>([]);

function publishFrame(key: string | null): void {
    const frame = [area(key)];

    areas.set(frame);
    source.next(frame);
}

beforeEach(() => {
    source = new BehaviorSubject<readonly MicrofrontendSnapshot[]>([]);
    areas.set([]);
    TestBed.configureTestingModule({
        providers: [
            ProcedurePlayerObserver,
            {
                provide: PageObservation,
                useValue: {areas, updates$: source.asObservable()},
            },
        ],
    });
});

afterEach(() => {
    TestBed.resetTestingModule();
    source.complete();
});

test('A → B → A published before change detection emits both transitions synchronously', () => {
    const observer = TestBed.inject(ProcedurePlayerObserver);
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    publishFrame('A');
    publishFrame('B');
    publishFrame('A');
    expect(
        events.map(({previousBlockId, blockId}) => [previousBlockId, blockId]),
    ).toEqual([
        ['A', 'B'],
        ['B', 'A'],
    ]);
    expect(observer.players()[0]?.state.key).toBe('A');
});

test('a temporarily removed block marker keeps the synchronous mounted-area baseline', () => {
    const observer = TestBed.inject(ProcedurePlayerObserver);
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    publishFrame('A');
    publishFrame(null);
    expect(observer.players()).toEqual([]);
    publishFrame('B');
    expect(
        events.map(({previousBlockId, blockId}) => [previousBlockId, blockId]),
    ).toEqual([['A', 'B']]);
});

test('destroying the owner unsubscribes the frame stream and completes block changes', () => {
    const observer = TestBed.inject(ProcedurePlayerObserver);
    const events: ProcedurePlayerBlockChange[] = [];
    let complete = false;

    observer.blockChanges$.subscribe({
        next: (event) => {
            events.push(event);
        },
        complete: () => {
            complete = true;
        },
    });
    publishFrame('A');
    expect(source.observed).toBe(true);
    TestBed.resetTestingModule();
    expect(source.observed).toBe(false);
    expect(complete).toBe(true);
    publishFrame('B');
    expect(events).toEqual([]);
});
