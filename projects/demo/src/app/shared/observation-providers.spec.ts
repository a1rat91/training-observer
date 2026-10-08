/** Проверяет реальную Angular DI-сборку: разные владельцы, stop/start и уничтожение с ожидающим blur.
 * Геометрия здесь не проверяется; браузерный набор отдельно проверяет настоящую разметку и фокус.
 */
import {DOCUMENT} from '@angular/common';
import {
    Component,
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
    type Provider,
} from '@angular/core';
import {fakeAsync, flushMicrotasks, TestBed, tick} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    DOM_OBSERVATION_OPTIONS,
    DOM_SNAPSHOT_OPTIONS,
    DomHighlighter,
    DomSnapshotBuilder,
    MicrofrontendObserver,
    type ObservationUpdate,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';

const scopes = new Set<EnvironmentInjector>();
const options = {includeText: false, propertyCheckIntervalMs: 0, batchDelayMs: 0};

function owner(
    providers: readonly Provider[] = [],
    parent: EnvironmentInjector = TestBed.inject(EnvironmentInjector),
): {
    scope: EnvironmentInjector;
    observer: TrainingObserver;
} {
    const scope = createEnvironmentInjector(
        [provideDomObservation(), ...providers],
        parent,
    );

    scopes.add(scope);

    return {scope, observer: scope.get(TrainingObserver)};
}

function input(id: string): HTMLInputElement {
    return document.querySelector<HTMLInputElement>(`#${id}`)!;
}

function blur(element: HTMLInputElement, value: string): void {
    element.value = value;
    element.dispatchEvent(
        new FocusEvent('focusout', {bubbles: true, relatedTarget: document.body}),
    );
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    document.body.innerHTML =
        '<section id="a"><input id="first" aria-label="Первое"></section><section id="b"><input id="second" aria-label="Второе"></section>';
});

afterEach(() => {
    for (const scope of scopes) {
        scope.destroy();
    }

    scopes.clear();
    TestBed.resetTestingModule();
});

test('local providers isolate confirmations and stopping one owner leaves the other active', fakeAsync(() => {
    const a = owner().observer;
    const b = owner().observer;

    expect(a).not.toBe(b);
    a.start(document.querySelector('#a')!, options);
    b.start(document.querySelector('#b')!, options);
    blur(input('first'), 'Ответ A');
    flushMicrotasks();
    a.flush();
    b.flush();
    expect(
        Object.values(a.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Ответ A']);
    expect(b.confirmedControls()).toEqual({});
    a.stop();
    const scans = a.scanCount();

    blur(input('second'), 'Ответ B');
    flushMicrotasks();
    b.flush();
    tick(1);
    expect(
        Object.values(b.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Ответ B']);
    expect(a.scanCount()).toBe(scans);
    expect(b.isObserving()).toBe(true);
}));

test('restart discards queued blur from the old session and accepts new answers', fakeAsync(() => {
    const observer = owner().observer;

    observer.start(document.querySelector('#a')!, options);
    blur(input('first'), 'Старый ответ');
    observer.stop();
    observer.start(document.querySelector('#b')!, options);
    flushMicrotasks();
    observer.flush();
    expect(observer.confirmedControls()).toEqual({});
    blur(input('second'), 'Новый ответ');
    flushMicrotasks();
    observer.flush();
    expect(
        Object.values(observer.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Новый ответ']);
    tick(1);
}));

test('destroy releases the session with pending work and prevents restarting its facade', fakeAsync(() => {
    const {scope, observer} = owner();

    observer.start(document.querySelector('#a')!, {
        ...options,
        propertyCheckIntervalMs: 10,
    });
    blur(input('first'), 'Незавершённый ответ');
    scopes.delete(scope);
    scope.destroy();
    const scans = observer.scanCount();

    flushMicrotasks();
    tick(30);
    expect(observer.isObserving()).toBe(false);
    expect(observer.confirmedControls()).toEqual({});
    expect(observer.scanCount()).toBe(scans);
    expect(() => observer.start(document.querySelector('#a')!, options)).toThrow(
        'destroyed',
    );
}));

/** Владелец с локальной заменой сборщика проверяет переход из ElementInjector в сеанс. */
@Component({
    selector: 'test-observation-owner',
    template: '<input aria-label="Поле">',
    providers: [provideDomObservation()],
})
class ObservationOwner {
    public readonly observer = inject(TrainingObserver);
    public readonly builder = inject(DomSnapshotBuilder);
}

test('the helper supplies a component-local builder and forwards it to the session', fakeAsync(() => {
    const fixture = TestBed.createComponent(ObservationOwner);
    const {observer, builder} = fixture.componentInstance;
    const build = jest.spyOn(builder, 'build');

    expect(builder).not.toBe(TestBed.inject(DomSnapshotBuilder));
    fixture.detectChanges();
    observer.start(fixture.nativeElement, options);
    expect(build).toHaveBeenCalledTimes(1);
    observer.flush();
    expect(build).toHaveBeenCalledTimes(2);
    fixture.destroy();
    tick(1);
    expect(observer.isObserving()).toBe(false);
}));

@Component({
    selector: 'test-local-document-owner',
    template: '',
    providers: [
        provideDomObservation(),
        {
            provide: DOCUMENT,
            useFactory: () =>
                document.querySelector<HTMLIFrameElement>('#local-document')!
                    .contentDocument!,
        },
        {
            provide: DOM_SNAPSHOT_OPTIONS,
            useFactory: () => ({
                ...inject(DOM_SNAPSHOT_OPTIONS, {skipSelf: true}),
                maxNodes: 2,
                includeText: false,
            }),
        },
    ],
})
class LocalDocumentOwner {
    public readonly observer = inject(TrainingObserver);
    public readonly settings = inject(DOM_OBSERVATION_OPTIONS);
}

test('component settings bind both initial and session captures to its document and node limit', fakeAsync(() => {
    const iframe = document.createElement('iframe');

    iframe.id = 'local-document';
    document.body.append(iframe);
    const localDocument = iframe.contentDocument!;

    localDocument.body.innerHTML =
        '<input aria-label="Локальное поле"><input aria-label="За лимитом">';
    const fixture = TestBed.createComponent(LocalDocumentOwner);
    const {observer, settings} = fixture.componentInstance;

    expect(settings.maxNodes).toBe(2);
    const initial = observer.start(undefined, options);

    expect(initial.stats.nodeCount).toBe(2);
    expect(initial.stats.truncated).toBe(true);
    expect(observer.logicalControls().map((control) => control.label)).toEqual([
        'Локальное поле',
    ]);
    observer.flush();
    expect(observer.snapshot()?.stats.nodeCount).toBe(2);
    expect(observer.snapshot()?.stats.truncated).toBe(true);
    fixture.destroy();
    tick(1);
}));

test('local helpers inherit observation timing and capture overrides until snapshot settings are replaced', fakeAsync(() => {
    const defaults = TestBed.inject(DOM_SNAPSHOT_OPTIONS);
    const inherited = {
        ...defaults,
        maxNodes: 2,
        boundarySelector: '#b',
        includeText: false,
        batchDelayMs: 17,
        propertyCheckIntervalMs: 0,
    };

    const parent = owner([{provide: DOM_OBSERVATION_OPTIONS, useValue: inherited}]);
    const child = owner([], parent.scope);

    expect(child.scope.get(DOM_OBSERVATION_OPTIONS)).toBe(inherited);
    document.querySelector('#a')!.append(document.createElement('input'));
    expect(child.observer.start(document.querySelector('#a')!).stats.truncated).toBe(
        true,
    );

    const snapshotSettings = {...defaults, maxNodes: 3, boundarySelector: '.nested'};
    const overridden = owner(
        [{provide: DOM_SNAPSHOT_OPTIONS, useValue: snapshotSettings}],
        parent.scope,
    );

    expect(overridden.scope.get(DOM_OBSERVATION_OPTIONS)).toEqual({
        ...snapshotSettings,
        batchDelayMs: 17,
        propertyCheckIntervalMs: 0,
    });
    expect(overridden.observer.start(document.querySelector('#a')!).stats.truncated).toBe(
        false,
    );
    child.observer.stop();
    overridden.observer.stop();
    tick(20);
}));

test('the helper can be provided at the application root with default options', () => {
    TestBed.configureTestingModule({providers: [provideDomObservation()]});
    const settings = TestBed.inject(DOM_OBSERVATION_OPTIONS);

    expect(settings).toEqual({
        ...TestBed.inject(DOM_SNAPSHOT_OPTIONS),
        batchDelayMs: 50,
        propertyCheckIntervalMs: 500,
    });
    expect(TestBed.inject(TrainingObserver)).toBeInstanceOf(TrainingObserver);
    expect(TestBed.inject(DomHighlighter)).toBeInstanceOf(DomHighlighter);
});

test('capturing another root is isolated from an active session and its later blur', fakeAsync(() => {
    const observer = owner().observer;
    const first = observer.start(document.querySelector('#a')!, options);
    const confirmations = observer.confirmedControls();
    const scans = observer.scanCount();
    const revision = observer.revision();
    const updates: ObservationUpdate[] = [];

    observer.updates$.subscribe((update) => {
        updates.push(update);
    });
    const captured = observer.capture(document.querySelector('#b')!, options);

    expect(captured).not.toBe(first);
    expect(observer.snapshot()).toBe(first);
    expect(observer.confirmedControls()).toBe(confirmations);
    expect(observer.scanCount()).toBe(scans);
    expect(observer.revision()).toBe(revision);
    expect(observer.isObserving()).toBe(true);
    expect(observer.error()).toBeNull();
    expect(updates).toHaveLength(1);
    blur(input('first'), 'Ответ после отдельного capture');
    flushMicrotasks();
    observer.flush();
    expect(
        Object.values(observer.confirmedControls()).map((control) => control.state.value),
    ).toEqual(['Ответ после отдельного capture']);
    expect(observer.logicalControls().map((control) => control.locatorHints.id)).toEqual([
        'first',
    ]);
    tick(1);
}));

test('manual captures of the active root inherit its ignore and boundary rules', fakeAsync(() => {
    const observer = owner().observer;
    const root = document.querySelector('#a')!;

    root.insertAdjacentHTML(
        'beforeend',
        '<div class="excluded"><input aria-label="Исключено"></div><div class="nested"><input aria-label="Другой владелец"></div>',
    );
    observer.start(root, {
        ...options,
        ignoreSelector: '.excluded',
        boundarySelector: '.nested',
    });

    for (const captureRoot of [undefined, root]) {
        const snapshot = observer.capture(captureRoot);

        expect(observer.snapshot()).toBe(snapshot);
        expect(
            observer.logicalControls().map((control) => control.locatorHints.id),
        ).toEqual(['first']);
    }

    observer.flush();
    expect(observer.logicalControls()).toHaveLength(1);
    tick(1);
}));

test('updates synchronously publish one prepared tuple and preserve confirmation references', fakeAsync(() => {
    const {observer, scope} = owner();
    const updates: ObservationUpdate[] = [];
    let completed = false;

    observer.updates$.subscribe({
        next: (update) => {
            updates.push(update);
            expect(update.snapshot).toBe(observer.snapshot());
            expect(update.controls).toBe(observer.logicalControls());
            expect(update.confirmedControls).toBe(observer.confirmedControls());
        },
        complete: () => {
            completed = true;
        },
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.snapshot).toBeNull();
    observer.start(document.querySelector('#a')!, options);
    expect(updates).toHaveLength(2);
    expect(observer.isObserving()).toBe(true);
    input('first').value = 'Подтверждено';
    observer.capture();
    const beforeBlur = updates.length;

    expect(observer.confirmedControls()).toEqual({});
    blur(input('first'), 'Подтверждено');
    flushMicrotasks();
    observer.flush();
    const confirmed = observer.confirmedControls();
    const confirmedUpdate = updates[updates.length - 1]!;

    expect(updates).toHaveLength(beforeBlur + 1);
    expect(confirmedUpdate.confirmedControls).toBe(confirmed);
    expect(Object.values(confirmed)[0]?.state.value).toBe('Подтверждено');
    observer.flush();
    expect(updates[updates.length - 1]).toBe(confirmedUpdate);
    observer.capture();
    expect(updates[updates.length - 1]?.confirmedControls).toBe(confirmed);
    observer.clear();
    expect(updates[updates.length - 1]?.snapshot).toBeNull();
    expect(updates[updates.length - 1]?.controls).toEqual([]);
    expect(updates[updates.length - 1]?.confirmedControls).toEqual({});
    scopes.delete(scope);
    scope.destroy();
    expect(completed).toBe(true);
    tick(1);
}));

test('microfrontend start honors the configured selector and explicit overrides take priority', fakeAsync(() => {
    document.querySelector('#b')!.setAttribute('data-mf', 'legacy');
    const {scope} = owner([
        {
            provide: DOM_OBSERVATION_OPTIONS,
            useValue: {
                ...TestBed.inject(DOM_OBSERVATION_OPTIONS),
                ...options,
                boundarySelector: '#a',
            },
        },
    ]);

    const observer = scope.get(MicrofrontendObserver);

    observer.start();
    expect(
        observer
            .areas()
            .map((area) =>
                area.logicalControls.map((control) => control.locatorHints.id),
            ),
    ).toEqual([['first']]);
    observer.start(document.body, {boundarySelector: '#b'});
    expect(
        observer
            .areas()
            .map((area) =>
                area.logicalControls.map((control) => control.locatorHints.id),
            ),
    ).toEqual([['second']]);
    tick(1);
}));

test('highlighting through the helper works without WeakRef and releases its animation loop', fakeAsync(() => {
    const {scope} = owner();
    const highlighter = scope.get(DomHighlighter);
    const weakRef = Object.getOwnPropertyDescriptor(globalThis, 'WeakRef');
    const rects = jest.spyOn(input('first'), 'getClientRects').mockReturnValue([
        {
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            top: 20,
            right: 110,
            bottom: 50,
            left: 10,
        },
    ]);

    Object.defineProperty(globalThis, 'WeakRef', {configurable: true, value: undefined});

    try {
        const snapshot = scope
            .get(DomSnapshotBuilder)
            .build(document.querySelector('#a')!, {includeText: false});

        highlighter.show(snapshot);
        expect(
            document
                .querySelector('training-observer-highlights')
                ?.shadowRoot?.querySelectorAll('[data-highlight-rect]'),
        ).toHaveLength(1);
        scopes.delete(scope);
        scope.destroy();
        tick(30);
        expect(document.querySelector('training-observer-highlights')).toBeNull();
    } finally {
        highlighter.clear();
        rects.mockRestore();

        if (weakRef) {
            Object.defineProperty(globalThis, 'WeakRef', weakRef);
        } else {
            Reflect.deleteProperty(globalThis, 'WeakRef');
        }
    }
}));
