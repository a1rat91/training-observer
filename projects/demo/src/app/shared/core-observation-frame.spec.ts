import {
    createEnvironmentInjector,
    EnvironmentInjector,
    type Provider,
} from '@angular/core';
import {fakeAsync, flushMicrotasks, TestBed, tick} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    MicrofrontendObserver,
    type ObservationUpdate,
    provideControlAdapters,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';
import {type MicrofrontendSnapshot} from '@training-observer/core/models';

const options = {includeText: true, batchDelayMs: 0, propertyCheckIntervalMs: 0};
const scopes = new Set<EnvironmentInjector>();
const wrapperAdapter: ControlAdapter = {
    id: 'test-field-wrapper',
    match({target, ancestors, nativeKind}) {
        const host = ancestors.find((node) => 'data-field' in node.attributes);

        return host &&
            (target.attributes['id'] === 'a' || target.attributes['id'] === 'trigger')
            ? {
                  status: 'match',
                  kind: nativeKind ?? 'textbox',
                  hostId: host.id,
                  popup: target.attributes['id'] === 'trigger',
              }
            : null;
    },
};

function owner(providers: readonly Provider[] = []): EnvironmentInjector {
    const scope = createEnvironmentInjector(
        [provideDomObservation(), ...providers],
        TestBed.inject(EnvironmentInjector),
    );

    scopes.add(scope);

    return scope;
}

function element<T extends HTMLElement>(selector: string): T {
    return document.querySelector<T>(selector)!;
}

async function settle(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
}

function edit(selector: string, value: string): void {
    const input = element<HTMLInputElement>(selector);

    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
}

function confirmed(area: MicrofrontendSnapshot | undefined): readonly string[] {
    return Object.values(area?.confirmedControls ?? {}).map((control) =>
        String(control.state.value),
    );
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
});

afterEach(() => {
    for (const scope of scopes) {
        scope.destroy();
    }

    scopes.clear();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
});

test('one immutable frame backs every TrainingObserver slice and synchronous update', fakeAsync(() => {
    document.body.innerHTML =
        '<section id="root"><input id="a"></section><button id="outside">Outside</button>';
    const scope = owner();
    const observer = scope.get(TrainingObserver);
    const initial = observer.state();
    const updates: ObservationUpdate[] = [];
    let completed = false;

    observer.updates$.subscribe({
        next: (update) => {
            const frame = observer.state();

            updates.push(update);
            expect(update.snapshot).toBe(frame.snapshot);
            expect(update.controls).toBe(frame.controls);
            expect(update.confirmedControls).toBe(frame.confirmedControls);
            expect(observer.snapshot()).toBe(frame.snapshot);
            expect(observer.logicalControls()).toBe(frame.controls);
            expect(observer.confirmedControls()).toBe(frame.confirmedControls);
            expect(observer.isObserving()).toBe(frame.isObserving);
            expect(observer.error()).toBe(frame.error);
            expect(observer.scanCount()).toBe(frame.scanCount);
            expect(observer.revision()).toBe(frame.revision);
        },
        complete: () => {
            completed = true;
        },
    });
    observer.start(element('#root'), options);
    const started = observer.state();

    expect(started.isObserving).toBe(true);
    expect(started.revision).toBe(1);
    edit('#a', 'Confirmed');
    flushMicrotasks();
    observer.flush();
    element('#outside').focus();
    flushMicrotasks();
    observer.flush();
    const settled = observer.state();

    expect(settled.confirmedControls).not.toBe(started.confirmedControls);
    expect(started.confirmedControls).toEqual({});
    expect(initial).toMatchObject({
        snapshot: null,
        controls: [],
        scanCount: 0,
        revision: 0,
    });
    observer.stop();
    expect(observer.state().isObserving).toBe(false);
    expect(settled.isObserving).toBe(true);
    observer.clear();
    expect(observer.state()).toMatchObject({
        snapshot: null,
        controls: [],
        confirmedControls: {},
        isObserving: false,
    });
    expect(observer.scanCount()).toBe(settled.scanCount);
    expect(observer.revision()).toBe(settled.revision);
    expect(updates[updates.length - 1]?.snapshot).toBeNull();
    scopes.delete(scope);
    scope.destroy();
    expect(completed).toBe(true);
    tick(1);
}));

test('scan-only captures retain data references and a reconnect keeps departing confirmations', fakeAsync(() => {
    document.body.innerHTML =
        '<section id="first"><input id="a"></section><section id="second"><input id="b"></section><button id="outside">Outside</button>';
    const observer = owner().get(TrainingObserver);
    const updates: ObservationUpdate[] = [];

    observer.updates$.subscribe((update) => {
        updates.push(update);
    });
    observer.start(element('#first'), options);
    observer.flush();
    const first = observer.state();
    const count = updates.length;

    observer.flush();
    expect(observer.state()).not.toBe(first);
    expect(observer.snapshot()).toBe(first.snapshot);
    expect(observer.logicalControls()).toBe(first.controls);
    expect(observer.confirmedControls()).toBe(first.confirmedControls);
    expect(observer.scanCount()).toBe(first.scanCount + 1);
    expect(observer.revision()).toBe(first.revision);
    expect(updates).toHaveLength(count);
    edit('#a', 'Leaving answer');
    element('#outside').focus();
    flushMicrotasks();
    observer.reconnect(element('#second'), options);
    expect(observer.logicalControls().map((control) => control.locatorHints.id)).toEqual([
        'b',
    ]);
    expect(
        Object.values(observer.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Leaving answer']);
    observer.reconnect(null);
    expect(observer.state()).toMatchObject({
        snapshot: null,
        controls: [],
        isObserving: false,
    });
    expect(
        Object.values(observer.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Leaving answer']);
    tick(1);
}));

test('microfrontend updates synchronously share the areas array and complete with the owner', () => {
    document.body.innerHTML =
        '<microfrontend><parent-app><input id="a"></parent-app></microfrontend>';
    const scope = owner();
    const observer = scope.get(MicrofrontendObserver);
    const updates: Array<readonly MicrofrontendSnapshot[]> = [];
    let completed = false;

    observer.updates$.subscribe({
        next: (areas) => {
            expect(areas).toBe(observer.areas());
            updates.push(areas);
        },
        complete: () => {
            completed = true;
        },
    });
    expect(updates).toEqual([[]]);
    observer.observe('microfrontend > *', options);
    expect(updates[updates.length - 1]).toHaveLength(1);
    const initial = observer.areas();

    observer.clear();
    expect(observer.areas()).toEqual([]);
    expect(initial).toHaveLength(1);
    expect(updates[updates.length - 1]).toBe(observer.areas());
    let replay: readonly MicrofrontendSnapshot[] | undefined;

    observer.updates$
        .subscribe((areas) => {
            replay = areas;
        })
        .unsubscribe();
    expect(replay).toBe(observer.areas());
    scopes.delete(scope);
    scope.destroy();
    expect(completed).toBe(true);
    expect(() => observer.start(document.body, options)).toThrow('destroyed');
});

test.each(['stop', 'clear', 'destroy'] as const)(
    'a synchronous %s on the first microfrontend frame cancels startup before resources connect',
    (action) => {
        document.body.innerHTML =
            '<microfrontend><workflow-shell><input id="a"></workflow-shell></microfrontend>';
        const scope = owner();
        const observer = scope.get(MicrofrontendObserver);
        const observe = jest.spyOn(MutationObserver.prototype, 'observe');
        const listen = jest.spyOn(window, 'addEventListener');
        const interval = jest.spyOn(window, 'setInterval');
        let cancelled = false;
        let completed = false;

        observer.updates$.subscribe({
            next: (areas) => {
                if (cancelled || !areas.length) {
                    return;
                }

                cancelled = true;

                if (action === 'destroy') {
                    scopes.delete(scope);
                    scope.destroy();
                } else {
                    observer[action]();
                }
            },
            complete: () => {
                completed = true;
            },
        });
        observer.start(document.body, {...options, propertyCheckIntervalMs: 60_000});
        expect(cancelled).toBe(true);
        expect(observer.isObserving()).toBe(false);
        expect(observe).not.toHaveBeenCalled();
        expect(listen.mock.calls.filter(([name]) => name === 'resize')).toEqual([]);
        expect(interval).not.toHaveBeenCalled();
        expect(completed).toBe(action === 'destroy');
        expect(observer.areas()).toHaveLength(action === 'stop' ? 1 : 0);
    },
);

test('a reentrant start from the initial frame keeps only the newer root and its resources', async () => {
    document.body.innerHTML =
        '<section id="first"><microfrontend><first-app><input id="a"></first-app></microfrontend></section><section id="second"><microfrontend><second-app><input id="b"></second-app></microfrontend></section>';
    const observer = owner().get(MicrofrontendObserver);
    const observe = jest.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
    const listen = jest.spyOn(window, 'addEventListener');
    const unlisten = jest.spyOn(window, 'removeEventListener');
    const interval = jest.spyOn(window, 'setInterval');
    const clearInterval = jest.spyOn(window, 'clearInterval');
    let restarted = false;

    observer.updates$.subscribe((areas) => {
        if (!restarted && areas.length) {
            restarted = true;
            observer.start(element('#second'), {
                ...options,
                propertyCheckIntervalMs: 60_000,
            });
        }
    });
    observer.start(element('#first'), options);
    expect(observer.isObserving()).toBe(true);
    expect(observer.areas().map(({name}) => name)).toEqual(['second-app']);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1);
    expect(interval).toHaveBeenCalledTimes(1);
    const initial = observer.areas()[0]!;

    element('#a').setAttribute('value', 'Unrelated');
    await settle();
    expect(observer.areas()[0]?.scanCount).toBe(initial.scanCount);
    element('#b').setAttribute('value', 'Current');
    await settle();
    expect(observer.areas()[0]?.logicalControls[0]?.state.value).toBe('Current');
    observer.stop();
    expect(observer.isObserving()).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(unlisten.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(1);
    expect(clearInterval).toHaveBeenCalledTimes(1);
});

test('a polling callback stops using its old frame after discovery synchronously restarts observation', async () => {
    document.body.innerHTML =
        '<section id="first"><microfrontend><first-app><input id="a"></first-app></microfrontend></section><section id="second"><microfrontend><second-app><input id="b"></second-app></microfrontend></section>';
    const observer = owner().get(MicrofrontendObserver);
    const interval = jest.spyOn(window, 'setInterval');

    observer.start(element('#first'), {...options, propertyCheckIntervalMs: 60_000});
    const poll = interval.mock.calls[0]?.[0];

    expect(typeof poll).toBe('function');
    let restarted = false;

    observer.updates$.subscribe((areas) => {
        if (!restarted && areas.length === 2) {
            restarted = true;
            observer.start(element('#second'), options);
        }
    });
    const host = document.createElement('div');

    host.attachShadow({mode: 'open'});
    element('#first').append(host);
    const mounted = document.createElement('microfrontend');

    mounted.innerHTML = '<new-app><input></new-app>';
    element('#first').append(mounted);
    (poll as () => void)();
    expect(restarted).toBe(true);
    expect(observer.areas().map(({name}) => name)).toEqual(['second-app']);
    const initial = observer.areas()[0]!;

    await settle();
    expect(observer.areas()[0]?.scanCount).toBe(initial.scanCount);
    expect(observer.isObserving()).toBe(true);
});

test('a TrainingObserver failure stops its frame and restarting clears the error without mutating previous frames', async () => {
    document.body.innerHTML = '<section id="root"><input id="a"></section>';
    const adapter: ControlAdapter = {
        id: 'test-training-failure',
        match({target}) {
            if ('data-fail' in target.attributes) {
                throw new Error('Training capture failed');
            }

            return null;
        },
    };

    const observer = owner([provideControlAdapters(adapter)]).get(TrainingObserver);

    observer.start(element('#root'), options);
    const running = observer.state();

    element('#a').setAttribute('data-fail', '');
    await settle();
    const failed = observer.state();

    expect(failed).toMatchObject({isObserving: false, error: 'Training capture failed'});
    expect(failed.snapshot).toBe(running.snapshot);
    expect(failed.controls).toBe(running.controls);
    expect(running).toMatchObject({isObserving: true, error: null});
    element('#a').removeAttribute('data-fail');
    observer.start(element('#root'), options);
    expect(observer.state()).toMatchObject({isObserving: true, error: null});
    expect(failed).toMatchObject({isObserving: false, error: 'Training capture failed'});
});

test('confirmation-only publication increments the area revision and keeps sibling confirmation state isolated', async () => {
    document.body.innerHTML =
        '<microfrontend><parent-app><input id="a"></parent-app></microfrontend><microfrontend><child-app><input id="b"></child-app></microfrontend>';
    const observer = owner().get(MicrofrontendObserver);

    observer.observe('microfrontend > *', options);
    edit('#a', 'A answer');
    await settle();
    const previous = observer.areas()[0]!;
    const sibling = observer.areas()[1]!;

    element('#b').focus();
    await settle();
    const current = observer.areas()[0]!;

    expect(current.revision).toBe(previous.revision + 1);
    expect(confirmed(current)).toEqual(['A answer']);
    expect(previous.confirmedControls).toEqual({});
    expect(observer.areas()[1]?.confirmedControls).toBe(sibling.confirmedControls);
    expect(observer.areas()[1]?.revision).toBe(sibling.revision);
    observer.refresh();
    await settle();
    expect(observer.areas()[0]?.revision).toBe(current.revision);
});

test('leaving an adapter host for a nested microfrontend confirms only the departing parent field', async () => {
    document.body.innerHTML =
        '<microfrontend><player-procedure><section block-id="A"><div data-field><input id="a"><microfrontend><child-app><input id="b"></child-app></microfrontend></div></section></player-procedure></microfrontend><button id="outside">Outside</button>';
    const observer = owner([provideControlAdapters(wrapperAdapter)]).get(
        MicrofrontendObserver,
    );

    observer.observe('microfrontend > *', options);
    expect(
        observer
            .areas()
            .map((area) =>
                area.logicalControls.map((control) => control.locatorHints.id),
            ),
    ).toEqual([['a'], ['b']]);
    edit('#a', 'Parent answer');
    await settle();
    element('#b').focus();
    await settle();
    expect(confirmed(observer.areas()[0])).toEqual(['Parent answer']);
    expect(confirmed(observer.areas()[1])).toEqual([]);
    edit('#b', 'Child answer');
    element('#outside').focus();
    await settle();
    expect(confirmed(observer.areas()[0])).toEqual(['Parent answer']);
    expect(confirmed(observer.areas()[1])).toEqual(['Child answer']);
});

test('focus within an explicitly related popup keeps the trigger edit open', async () => {
    document.body.innerHTML =
        '<microfrontend><parent-app><div data-field><input id="trigger" role="combobox" aria-haspopup="dialog" aria-expanded="true" aria-controls="popup"></div></parent-app></microfrontend><div id="popup" role="dialog"><input id="popup-field"></div><button id="outside">Outside</button>';
    const observer = owner([provideControlAdapters(wrapperAdapter)]).get(
        MicrofrontendObserver,
    );

    observer.observe('microfrontend > *', options);
    edit('#trigger', 'In progress');
    await settle();
    element('#popup-field').focus();
    await settle();
    expect(confirmed(observer.areas()[0])).toEqual([]);
    element('#outside').focus();
    await settle();
    expect(confirmed(observer.areas()[0])).toContain('In progress');
});

test('shared confirmations preserve departing fields and never reveal redacted passwords', async () => {
    document.body.innerHTML =
        '<microfrontend><parent-app><input id="a"><input id="secret" type="password"></parent-app></microfrontend><button id="outside">Outside</button>';
    const observer = owner().get(MicrofrontendObserver);

    observer.observe('microfrontend > *', options);
    edit('#a', 'Departing answer');
    element('#outside').focus();
    await settle();
    const id = observer
        .areas()[0]!
        .logicalControls.find((control) => control.locatorHints.id === 'a')!.id;

    element('#a').remove();
    await settle();
    expect(
        observer.areas()[0]?.logicalControls.some((control) => control.id === id),
    ).toBe(false);
    expect(observer.areas()[0]?.confirmedControls[id]?.state.value).toBe(
        'Departing answer',
    );
    edit('#secret', 'never-publish-this-password');
    element('#outside').focus();
    await settle();
    expect(confirmed(observer.areas()[0])).toEqual(['Departing answer']);
    expect(JSON.stringify(observer.areas())).not.toContain('never-publish-this-password');
});

test('changing area ownership and reporting a capture error both advance its revision', async () => {
    document.body.innerHTML =
        '<microfrontend><parent-app><microfrontend id="moving"><child-app><input id="b"></child-app></microfrontend></parent-app></microfrontend>';
    const failing: ControlAdapter = {
        id: 'test-capture-failure',
        match({target}) {
            if ('data-fail' in target.attributes) {
                throw new Error('Capture failed');
            }

            return null;
        },
    };

    const observer = owner([provideControlAdapters(failing)]).get(MicrofrontendObserver);

    observer.observe('microfrontend > *', options);
    const child = observer.areas()[1]!;

    expect(child.parentId).toBe(observer.areas()[0]?.id);
    expect(child.revision).toBe(1);
    document.body.append(element('#moving'));
    await settle();
    const moved = observer.areas().find((area) => area.id === child.id)!;

    expect(moved.parentId).toBeNull();
    expect(moved.revision).toBeGreaterThan(child.revision);
    element('#b').setAttribute('data-fail', '');
    await settle();
    const failed = observer.areas().find((area) => area.id === child.id)!;

    expect(failed.error).toBe('Capture failed');
    expect(failed.revision).toBeGreaterThan(moved.revision);
});
