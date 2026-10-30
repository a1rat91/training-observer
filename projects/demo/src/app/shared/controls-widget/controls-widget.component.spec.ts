import {
    ChangeDetectorRef,
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    Directive,
    inject,
    signal,
} from '@angular/core';
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {TUI_DARK_MODE, TuiRoot} from '@taiga-ui/core';
import {provideEventPlugins} from '@taiga-ui/event-plugins';
import {
    DOM_OBSERVATION_OPTIONS,
    DOM_SNAPSHOT_OPTIONS,
    PageObservation,
    provideControlAdapters,
} from '@training-observer/core';

import {ControlsWidgetComponent} from './controls-widget.component';

@Directive({selector: 'microfrontend'})
class MicrofrontendHost {}

@Component({
    imports: [ControlsWidgetComponent, MicrofrontendHost, TuiRoot],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <tui-root>
            <microfrontend>
                <arbitrary-player-host data-page-mf>
                    <input
                        id="widget-answer"
                        aria-label="Ответ"
                    />
                </arbitrary-player-host>
            </microfrontend>
            <microfrontend>
                <peer-app><input aria-label="Соседнее поле" /></peer-app>
            </microfrontend>
            @if (show()) {
                <tc-controls-widget />
            }
            @if (second()) {
                <tc-controls-widget />
            }
        </tui-root>
    `,
})
class WidgetOwner {
    public readonly show = signal(false);
    public readonly second = signal(false);
}

let fixture: ComponentFixture<WidgetOwner>;

function createOwner(): ComponentFixture<WidgetOwner> {
    const owner = TestBed.createComponent(WidgetOwner);

    owner.detectChanges();
    owner.componentInstance.show.set(true);

    return owner;
}

async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
    fixture.detectChanges();
    // Портал находится в отдельном OnPush-представлении Taiga, вне declaration view виджета.
    fixture.debugElement
        .query(By.css('tui-dropdowns'))
        .injector.get(ChangeDetectorRef)
        .detectChanges();
}

function widget(): HTMLElement {
    return document.querySelector('[aria-label="Текущие контролы"]')!;
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
            provideNoopAnimations(),
            provideEventPlugins(),
            {provide: TUI_DARK_MODE, useValue: signal(false)},
            provideControlAdapters({
                id: 'widget-failure',
                match: ({target}) => {
                    if ('data-capture-error' in target.attributes) {
                        throw new Error('Ошибка микрофронта');
                    }

                    return null;
                },
            }),
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

test('widget renders groups and blur values without a RecordingSession provider', async () => {
    fixture = createOwner();
    await settle();
    expect(widget().querySelector('h2')!.textContent).toContain('Контролы · 2');
    expect(
        [...widget().querySelectorAll('h3')].map((heading) => heading.textContent),
    ).toEqual([
        expect.stringContaining('arbitrary-player-host'),
        expect.stringContaining('peer-app'),
    ]);
    const answer = document.querySelector<HTMLInputElement>('#widget-answer')!;

    answer.value = 'Анна';
    answer.dispatchEvent(new Event('input', {bubbles: true}));
    await settle();
    expect(widget().textContent).toContain('Сейчас: Анна');
    answer.dispatchEvent(
        new FocusEvent('focusout', {bubbles: true, relatedTarget: document.body}),
    );
    await settle();
    expect(widget().textContent?.replaceAll(/\s+/g, ' ')).toContain('После blur: Анна');
    fixture.componentInstance.show.set(false);
    await settle();
    expect(document.querySelector('[aria-label="Текущие контролы"]')).toBeNull();
});

test('widget observes all wrapper roots when its owner restricts observation to one component', async () => {
    TestBed.overrideProvider(DOM_OBSERVATION_OPTIONS, {
        useFactory: () => ({
            ...inject(DOM_SNAPSHOT_OPTIONS),
            boundarySelector: 'arbitrary-player-host',
            batchDelayMs: 0,
            propertyCheckIntervalMs: 0,
        }),
    });
    fixture = createOwner();
    await settle();
    expect(widget().querySelector('h2')!.textContent).toContain('Контролы · 2');
    expect(
        [...widget().querySelectorAll('h3')].map((heading) => heading.textContent),
    ).toEqual([
        expect.stringContaining('arbitrary-player-host'),
        expect.stringContaining('peer-app'),
    ]);
    const peer = fixture.nativeElement.querySelector('peer-app input')!;

    peer.value = 'Ответ соседнего микрофронта';
    peer.dispatchEvent(new Event('input', {bubbles: true}));
    await settle();
    expect(widget().textContent).toContain('Сейчас: Ответ соседнего микрофронта');
    expect(TestBed.inject(DOM_OBSERVATION_OPTIONS).boundarySelector).toBe(
        'arbitrary-player-host',
    );
});

test('widget reports the error in its own microfrontend group', async () => {
    fixture = createOwner();
    await settle();
    document.querySelector('#widget-answer')!.setAttribute('data-capture-error', '');
    await settle();
    expect(widget().querySelector('[role="alert"]')!.textContent).toContain(
        'Ошибка микрофронта',
    );
    expect(widget().textContent).toContain('Соседнее поле');
});

test('destroying one widget leaves another independently observing the page', async () => {
    fixture = createOwner();
    fixture.componentInstance.second.set(true);
    await settle();
    const [first, second] = fixture.debugElement
        .queryAll(By.directive(ControlsWidgetComponent))
        .map((element) => element.injector.get(PageObservation));

    expect(first).not.toBe(second);
    expect(document.querySelectorAll('[aria-label="Текущие контролы"]')).toHaveLength(2);
    fixture.componentInstance.show.set(false);
    await settle();
    expect(first!.isObserving()).toBe(false);
    expect(second!.isObserving()).toBe(true);
    const answer = document.querySelector<HTMLInputElement>('#widget-answer')!;

    answer.value = 'Продолжает наблюдение';
    answer.dispatchEvent(new Event('input', {bubbles: true}));
    await settle();
    expect(document.querySelectorAll('[aria-label="Текущие контролы"]')).toHaveLength(1);
    expect(widget().textContent).toContain('Продолжает наблюдение');
});
