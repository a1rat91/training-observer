/** Настройки capture наследуются через промежуточные Angular injectors без ручной координации tokens. */
import {
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
    type Provider,
} from '@angular/core';
import {fakeAsync, TestBed, tick} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    DOM_OBSERVATION_OPTIONS,
    DOM_SNAPSHOT_OPTIONS,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';

const scopes = new Set<EnvironmentInjector>();

function scope(
    providers: readonly Provider[],
    parent = TestBed.inject(EnvironmentInjector),
): EnvironmentInjector {
    const injector = createEnvironmentInjector([...providers], parent);

    scopes.add(injector);

    return injector;
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    document.body.innerHTML = '<section id="area"><input><input></section>';
});

afterEach(() => {
    for (const injector of [...scopes].reverse()) {
        injector.destroy();
    }

    scopes.clear();
    TestBed.resetTestingModule();
});

test('a helper honors a snapshot-only ancestor limit in initial and later session captures', fakeAsync(() => {
    const snapshot = {...TestBed.inject(DOM_SNAPSHOT_OPTIONS), maxNodes: 2};
    const parent = scope([{provide: DOM_SNAPSHOT_OPTIONS, useValue: snapshot}]);
    const child = scope(provideDomObservation(), parent);
    const observer = child.get(TrainingObserver);

    expect(child.get(DOM_SNAPSHOT_OPTIONS)).toBe(snapshot);
    expect(child.get(DOM_OBSERVATION_OPTIONS).maxNodes).toBe(2);
    const initial = observer.start(document.querySelector('#area')!, {
        includeText: false,
        batchDelayMs: 0,
        propertyCheckIntervalMs: 0,
    });

    expect(initial.stats.nodeCount).toBe(2);
    expect(initial.stats.truncated).toBe(true);
    observer.flush();
    expect(observer.snapshot()?.stats.nodeCount).toBe(2);
    expect(observer.snapshot()?.stats.truncated).toBe(true);
    observer.stop();
    tick(1);
}));

test('a snapshot-only ancestor replaces the global capture limit while preserving observation timing', () => {
    TestBed.configureTestingModule({
        providers: [
            {
                provide: DOM_OBSERVATION_OPTIONS,
                useFactory: () => ({
                    ...inject(DOM_SNAPSHOT_OPTIONS),
                    maxNodes: 5,
                    batchDelayMs: 17,
                    propertyCheckIntervalMs: 0,
                }),
            },
        ],
    });
    const snapshot = {...TestBed.inject(DOM_SNAPSHOT_OPTIONS), maxNodes: 2};
    const parent = scope([{provide: DOM_SNAPSHOT_OPTIONS, useValue: snapshot}]);
    const child = scope(provideDomObservation(), parent);
    const options = child.get(DOM_OBSERVATION_OPTIONS);

    expect(options.maxNodes).toBe(2);
    expect(options.batchDelayMs).toBe(17);
    expect(options.propertyCheckIntervalMs).toBe(0);
});

test('a nested helper keeps the explicit parent observation limit when its snapshot settings are unchanged', () => {
    const snapshot = {...TestBed.inject(DOM_SNAPSHOT_OPTIONS), maxNodes: 2};
    const observation = {
        ...snapshot,
        maxNodes: 5,
        batchDelayMs: 17,
        propertyCheckIntervalMs: 0,
    };

    const parent = scope([
        provideDomObservation(),
        {provide: DOM_SNAPSHOT_OPTIONS, useValue: snapshot},
        {provide: DOM_OBSERVATION_OPTIONS, useValue: observation},
    ]);

    const child = scope(provideDomObservation(), parent);

    expect(child.get(DOM_SNAPSHOT_OPTIONS)).toBe(snapshot);
    expect(child.get(DOM_OBSERVATION_OPTIONS)).toBe(observation);
});

test('a new descendant snapshot limit replaces the parent capture limit and keeps its timing', () => {
    const snapshot = {...TestBed.inject(DOM_SNAPSHOT_OPTIONS), maxNodes: 2};
    const observation = {
        ...snapshot,
        maxNodes: 5,
        batchDelayMs: 17,
        propertyCheckIntervalMs: 0,
    };

    const parent = scope([
        provideDomObservation(),
        {provide: DOM_SNAPSHOT_OPTIONS, useValue: snapshot},
        {provide: DOM_OBSERVATION_OPTIONS, useValue: observation},
    ]);

    const child = scope(
        [
            provideDomObservation(),
            {provide: DOM_SNAPSHOT_OPTIONS, useValue: {...snapshot, maxNodes: 3}},
        ],
        parent,
    );

    const options = child.get(DOM_OBSERVATION_OPTIONS);

    expect(options.maxNodes).toBe(3);
    expect(options.batchDelayMs).toBe(17);
    expect(options.propertyCheckIntervalMs).toBe(0);
});
