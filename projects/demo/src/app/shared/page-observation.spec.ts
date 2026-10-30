import {Component, CUSTOM_ELEMENTS_SCHEMA, Directive, inject} from '@angular/core';
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {
    DOM_OBSERVATION_OPTIONS,
    DOM_SNAPSHOT_OPTIONS,
    PageObservation,
    providePageObservation,
} from '@training-observer/core';

@Directive({selector: 'microfrontend'})
class MicrofrontendHost {}

@Component({
    imports: [MicrofrontendHost],
    template: `
        <microfrontend>
            <arbitrary-player-host data-page-mf>
                <input
                    id="page-answer"
                    aria-label="Ответ"
                />
                <microfrontend>
                    <nested-app><input aria-label="Вложенное поле" /></nested-app>
                </microfrontend>
            </arbitrary-player-host>
        </microfrontend>
        <section data-page-mf><input aria-label="Соседнее поле" /></section>
    `,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [providePageObservation()],
})
class PageOwner {
    public readonly observation = inject(PageObservation);
}

let fixture: ComponentFixture<PageOwner>;

async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
    fixture.detectChanges();
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
            {
                provide: DOM_OBSERVATION_OPTIONS,
                useFactory: () => ({
                    ...inject(DOM_SNAPSHOT_OPTIONS),
                    batchDelayMs: 0,
                    propertyCheckIntervalMs: 0,
                }),
            },
        ],
    });
});

afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
});

test('page observation starts after render and discovers wrapper child roots and nested microfrontends without recording', async () => {
    fixture = TestBed.createComponent(PageOwner);
    const {observation} = fixture.componentInstance;

    expect(observation.isObserving()).toBe(false);
    await settle();
    expect(observation.isObserving()).toBe(true);
    expect(observation.error()).toBeNull();
    expect(observation.areas().map((area) => area.name)).toEqual([
        'arbitrary-player-host',
        'nested-app',
    ]);
    expect(
        observation
            .areas()
            .map((area) => area.logicalControls.map((control) => control.label)),
    ).toEqual([['Ответ'], ['Вложенное поле']]);
    expect(observation.areas()[1]!.parentId).toBe(observation.areas()[0]!.id);
    let completed = false;
    const subscription = observation.updates$.subscribe({
        complete: () => {
            completed = true;
        },
    });

    fixture.destroy();
    expect(completed).toBe(true);
    expect(observation.isObserving()).toBe(false);
    expect(observation.areas()).toEqual([]);
    subscription.unsubscribe();
});

test('page observation inherits configured boundaries and discovers a late root', async () => {
    TestBed.overrideProvider(DOM_OBSERVATION_OPTIONS, {
        useFactory: () => ({
            ...inject(DOM_SNAPSHOT_OPTIONS),
            boundarySelector: '[data-page-mf]',
            batchDelayMs: 0,
            propertyCheckIntervalMs: 0,
        }),
    });
    fixture = TestBed.createComponent(PageOwner);
    await settle();
    const {observation} = fixture.componentInstance;

    expect(observation.areas().map((area) => area.name)).toEqual([
        'arbitrary-player-host',
        'section',
    ]);
    const late = document.createElement('late-app');

    late.setAttribute('data-page-mf', '');
    late.innerHTML = '<input aria-label="Позднее поле" />';
    fixture.nativeElement.append(late);
    await settle();
    expect(observation.areas().map((area) => area.name)).toEqual([
        'arbitrary-player-host',
        'section',
        'late-app',
    ]);
    late.remove();
    await settle();
    expect(observation.areas()).toHaveLength(2);
});

test('invalid discovery configuration is reported without throwing from render', async () => {
    TestBed.overrideProvider(DOM_OBSERVATION_OPTIONS, {
        useFactory: () => ({
            ...inject(DOM_SNAPSHOT_OPTIONS),
            boundarySelector: '[',
            batchDelayMs: 0,
            propertyCheckIntervalMs: 0,
        }),
    });
    fixture = TestBed.createComponent(PageOwner);
    await settle();
    expect(fixture.componentInstance.observation.error()).toBeTruthy();
    expect(fixture.componentInstance.observation.isObserving()).toBe(false);
});
