/** Проверяет настройки владельца через публичный Angular-фасад, включая его дополнительный injector. */
import {DOCUMENT} from '@angular/common';
import {
    Component,
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
} from '@angular/core';
import {
    type ComponentFixture,
    fakeAsync,
    flushMicrotasks,
    TestBed,
    tick,
} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {provideRecordingSession, RecordingSession} from '@training-observer/angular';
import {DOM_OBSERVATION_OPTIONS, DOM_SNAPSHOT_OPTIONS} from '@training-observer/core';

const fixtures = new Set<ComponentFixture<unknown>>();
const scopes = new Set<EnvironmentInjector>();
const integration = {
    root: '[data-procedure]',
    screen: {
        root: {attribute: {name: 'data-procedure'}},
        identity: {kind: 'attribute' as const, name: 'data-screen'},
    },
};

const rectangles = [
    {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
];

@Component({
    selector: 'test-inherited-settings-owner',
    template:
        '<section data-procedure data-screen="A"><input aria-label="Первое"><input aria-label="Второе"><input aria-label="Третье"></section>',
    providers: [provideRecordingSession(integration)],
})
class InheritedSettingsOwner {
    public readonly session = inject(RecordingSession);
}

@Component({
    selector: 'test-local-settings-owner',
    template: '',
    providers: [
        provideRecordingSession(integration),
        {
            provide: DOCUMENT,
            useFactory: () =>
                document.querySelector<HTMLIFrameElement>('#session-document')!
                    .contentDocument!,
        },
        {
            provide: DOM_SNAPSHOT_OPTIONS,
            useFactory: () => ({
                ...inject(DOM_SNAPSHOT_OPTIONS, {skipSelf: true}),
                maxNodes: 3,
                ignoreSelector: '.private',
            }),
        },
    ],
})
class LocalSettingsOwner {
    public readonly session = inject(RecordingSession);
}

@Component({template: ''})
class RenderTrigger {}

function localDocument(): Document {
    const iframe = document.createElement('iframe');

    iframe.id = 'session-document';
    document.body.append(iframe);
    const local = iframe.contentDocument!;

    local.body.innerHTML =
        '<section data-procedure data-screen="B"><input aria-label="Первое"><div class="private"><input aria-label="Локально исключено"></div><input aria-label="Второе"><input aria-label="Третье"><div class="explicit-private"><input aria-label="Явно исключено"></div></section>';
    jest.spyOn(local.defaultView!.Element.prototype, 'getClientRects').mockReturnValue(
        rectangles,
    );

    return local;
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
            {
                provide: DOM_OBSERVATION_OPTIONS,
                useFactory: () => ({
                    ...inject(DOM_SNAPSHOT_OPTIONS),
                    includeText: false,
                    maxNodes: 2,
                    batchDelayMs: 11,
                    propertyCheckIntervalMs: 0,
                }),
            },
        ],
    });
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue(rectangles);
});

afterEach(() => {
    for (const fixture of fixtures) {
        fixture.destroy();
    }

    fixtures.clear();

    for (const scope of scopes) {
        scope.destroy();
    }

    scopes.clear();
    document.querySelector('#session-document')?.remove();
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
});

test('a facade inherits global observation limits and timing when its owner has no snapshot override', fakeAsync(() => {
    const fixture = TestBed.createComponent(InheritedSettingsOwner);

    fixtures.add(fixture);
    fixture.detectChanges();
    const {session} = fixture.componentInstance;

    expect(session.snapshot()?.stats.nodeCount).toBe(2);
    expect(session.snapshot()?.stats.truncated).toBe(true);
    const scans = session.scanCount();
    const field = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    field.value = 'Изменение';
    field.dispatchEvent(new Event('input', {bubbles: true}));
    flushMicrotasks();
    tick(10);
    expect(session.scanCount()).toBe(scans);
    tick(1);
    expect(session.scanCount()).toBe(scans + 1);
    expect(session.controls()[0]?.state.value).toBe('Изменение');
}));

test('a facade uses owner-local DOCUMENT and snapshot settings for initial and later captures', async () => {
    const local = localDocument();
    const fixture = TestBed.createComponent(LocalSettingsOwner);

    fixtures.add(fixture);
    fixture.detectChanges();
    const {session} = fixture.componentInstance;

    expect(session.snapshot()?.stats.nodeCount).toBe(3);
    expect(session.snapshot()?.stats.truncated).toBe(true);
    expect(session.controls().map((control) => control.label)).toEqual([
        'Первое',
        'Второе',
    ]);
    const field = local.querySelector<HTMLInputElement>('input')!;

    field.value = 'Локальное изменение';
    field.dispatchEvent(new local.defaultView!.Event('input', {bubbles: true}));
    // JSDOM создаёт iframe с отдельными window timers, которые fakeAsync главного document не перехватывает.
    await new Promise<void>((resolve) => {
        local.defaultView!.setTimeout(resolve, 20);
    });
    expect(session.snapshot()?.stats.nodeCount).toBe(3);
    expect(session.controls()[0]?.state.value).toBe('Локальное изменение');
});

test('explicit integration observation options override owner snapshot settings', fakeAsync(() => {
    localDocument();
    TestBed.overrideComponent(LocalSettingsOwner, {
        add: {
            providers: [
                provideRecordingSession({
                    ...integration,
                    observation: {
                        maxNodes: 20,
                        ignoreSelector: '.explicit-private',
                        batchDelayMs: 0,
                        propertyCheckIntervalMs: 0,
                    },
                }),
            ],
        },
    });
    const fixture = TestBed.createComponent(LocalSettingsOwner);

    fixtures.add(fixture);
    fixture.detectChanges();
    const {session} = fixture.componentInstance;

    expect(session.snapshot()?.stats.nodeCount).toBe(6);
    expect(session.snapshot()?.stats.truncated).toBe(false);
    expect(session.screen().key).toBe('B');
    expect(session.controls().map((control) => control.label)).toEqual([
        'Первое',
        'Локально исключено',
        'Второе',
        'Третье',
    ]);
}));

test('an environment owner also overrides inherited capture settings', () => {
    const local = localDocument();
    const scope = createEnvironmentInjector(
        [
            provideRecordingSession(integration),
            {provide: DOCUMENT, useValue: local},
            {
                provide: DOM_SNAPSHOT_OPTIONS,
                useValue: {
                    ...TestBed.inject(DOM_SNAPSHOT_OPTIONS),
                    maxNodes: 3,
                    ignoreSelector: '.private',
                },
            },
        ],
        TestBed.inject(EnvironmentInjector),
    );

    scopes.add(scope);
    const session = scope.get(RecordingSession);
    const fixture = TestBed.createComponent(RenderTrigger);

    fixtures.add(fixture);
    fixture.detectChanges();
    expect(session.snapshot()?.stats.nodeCount).toBe(3);
    expect(session.controls().map((control) => control.label)).toEqual([
        'Первое',
        'Второе',
    ]);
});
