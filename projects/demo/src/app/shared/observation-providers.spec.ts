/** Проверяет реальную Angular DI-сборку: разные владельцы, stop/start и уничтожение с ожидающим blur.
 * Геометрия здесь не проверяется; браузерный набор отдельно проверяет настоящую разметку и фокус.
 */
import {
    Component,
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
} from '@angular/core';
import {fakeAsync, flushMicrotasks, TestBed, tick} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    DomSnapshotBuilder,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';

const scopes = new Set<EnvironmentInjector>();
const options = {includeText: false, propertyCheckIntervalMs: 0, batchDelayMs: 0};

function owner(): {scope: EnvironmentInjector; observer: TrainingObserver} {
    const scope = createEnvironmentInjector(
        provideDomObservation(),
        TestBed.inject(EnvironmentInjector),
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
    providers: [provideDomObservation(), DomSnapshotBuilder],
})
class ObservationOwner {
    public readonly observer = inject(TrainingObserver);
    public readonly builder = inject(DomSnapshotBuilder);
}

test('session preserves the component-level snapshot builder override', fakeAsync(() => {
    const fixture = TestBed.createComponent(ObservationOwner);
    const {observer, builder} = fixture.componentInstance;
    const build = jest.spyOn(builder, 'build');

    fixture.detectChanges();
    observer.start(fixture.nativeElement, options);
    expect(build).toHaveBeenCalledTimes(1);
    observer.flush();
    expect(build).toHaveBeenCalledTimes(2);
    fixture.destroy();
    tick(1);
    expect(observer.isObserving()).toBe(false);
}));
