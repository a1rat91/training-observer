/** Исключения адаптеров одинаково применяются к capture, browser-сеансам и локальным Angular владельцам. */
import {
    Component,
    createEnvironmentInjector,
    EnvironmentInjector,
    inject,
} from '@angular/core';
import {fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {expect} from '@jest/globals';
import {
    ControlSnapshotBuilder,
    DomSnapshotBuilder,
    MicrofrontendObserver,
    provideControlAdapters,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';
import {type DomSnapshot} from '@training-observer/core/models';

const decorationAdapter: ControlAdapter = {
    id: 'test-decoration',
    excludedSubtreeSelectors: ['.adapter-decoration'],
    match: () => null,
};

const scopes = new Set<EnvironmentInjector>();
const options = {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0};
const transitionSelectors = [
    '.adapter-decoration',
    '[data-decoration]',
    '.wrapper:has(.marker)',
];

function owner(
    adapters: readonly ControlAdapter[] = [decorationAdapter],
): EnvironmentInjector {
    const scope = createEnvironmentInjector(
        [provideDomObservation(), provideControlAdapters(...adapters)],
        TestBed.inject(EnvironmentInjector),
    );

    scopes.add(scope);

    return scope;
}

function snapshotIds(snapshot: DomSnapshot): string[] {
    return Object.values(snapshot.nodes).flatMap((node) =>
        node.kind === 'element' && node.attributes['id'] ? [node.attributes['id']] : [],
    );
}

async function settleMutations(delayMs = 5): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
    });
}

function setExcluded(wrapper: Element, selector: string, excluded: boolean): void {
    if (selector === '.adapter-decoration') {
        wrapper.classList.toggle('adapter-decoration', excluded);

        return;
    }

    if (selector === '[data-decoration]') {
        wrapper.toggleAttribute('data-decoration', excluded);

        return;
    }

    if (excluded) {
        const marker = document.createElement('span');

        marker.className = 'marker';
        wrapper.querySelector('#nested')!.append(marker);
    } else {
        wrapper.querySelector('.marker')!.remove();
    }
}

beforeEach(() => {
    TestBed.configureTestingModule({});
    document.body.innerHTML = '';
});

afterEach(() => {
    for (const scope of scopes) {
        scope.destroy();
    }

    scopes.clear();
    TestBed.resetTestingModule();
});

test('core capture has no default library-specific subtree exclusions', () => {
    document.body.innerHTML =
        '<tui-scroll-controls id="track"><button id="content">Content</button></tui-scroll-controls>';
    const snapshot = TestBed.inject(DomSnapshotBuilder).build(document.body, options);

    expect(snapshotIds(snapshot)).toEqual(['track', 'content']);
});

test('an adapter excludes main-tree descendants, explicit roots and linked external popups', () => {
    document.body.innerHTML = `
        <section id="area">
            <button id="trigger" aria-expanded="true" aria-haspopup="listbox" aria-controls="popup">Open</button>
            <div class="adapter-decoration" id="decoration"><input id="ignored"></div>
        </section>
        <div class="adapter-decoration"><div id="popup" role="listbox"><button id="external">Hidden</button></div></div>
    `;
    const builder = owner().get(DomSnapshotBuilder);
    const snapshot = builder.build(document.querySelector('#area')!, options);

    expect(snapshotIds(snapshot)).toEqual(['area', 'trigger']);
    expect(snapshot.relatedRootIds).toEqual([]);
    expect(builder.build(document.querySelector('#popup')!, options).rootId).toBeNull();
});

@Component({
    selector: 'test-adapter-observation-child',
    template:
        '<input id="visible" aria-label="Visible"><div class="adapter-decoration"><input id="excluded"></div>',
    providers: [provideDomObservation()],
})
class AdapterObservationChild {
    public readonly observer = inject(TrainingObserver);
    public readonly controlBuilder = inject(ControlSnapshotBuilder);
}

@Component({
    selector: 'test-adapter-registration-owner',
    imports: [AdapterObservationChild],
    template: '<test-adapter-observation-child />',
    providers: [provideControlAdapters(decorationAdapter)],
})
class AdapterRegistrationOwner {}

test('a nested component helper inherits adapters and forwards its local projection into the session', fakeAsync(() => {
    const fixture = TestBed.createComponent(AdapterRegistrationOwner);

    fixture.detectChanges();
    const child = fixture.debugElement.query(By.directive(AdapterObservationChild));
    const {observer, controlBuilder} = child.componentInstance as AdapterObservationChild;
    const build = jest.spyOn(controlBuilder, 'build');

    expect(controlBuilder).not.toBe(TestBed.inject(ControlSnapshotBuilder));
    const snapshot = observer.start(child.nativeElement, options);

    expect(snapshotIds(snapshot)).toEqual(['visible']);
    expect(observer.logicalControls().map((control) => control.locatorHints.id)).toEqual([
        'visible',
    ]);
    expect(build).toHaveBeenCalledTimes(1);
    observer.flush();
    expect(build).toHaveBeenCalledTimes(2);
    expect(observer.logicalControls()).toHaveLength(1);
    fixture.destroy();
    tick(1);
}));

test('excluded mutations, events, property changes and exclusive subtree mounting do not schedule scans', async () => {
    document.body.innerHTML =
        '<section id="area"><input id="visible"><div class="adapter-decoration"><input id="excluded"></div></section>';
    const observer = owner().get(TrainingObserver);
    const root = document.querySelector('#area')!;
    const excluded = document.querySelector<HTMLInputElement>('#excluded')!;

    observer.start(root, {...options, propertyCheckIntervalMs: 10});
    await settleMutations();
    const scans = observer.scanCount();
    const decoration = document.createElement('div');

    decoration.className = 'adapter-decoration';
    excluded.setAttribute('data-changing', 'true');
    root.append(decoration);
    excluded.dispatchEvent(new Event('input', {bubbles: true}));
    excluded.value = 'Unobserved';
    await settleMutations(25);
    expect(observer.scanCount()).toBe(scans);
    decoration.remove();
    await settleMutations(25);
    expect(observer.scanCount()).toBe(scans);
    const visible = document.querySelector<HTMLInputElement>('#visible')!;

    visible.value = 'Observed';
    await settleMutations(25);
    expect(observer.scanCount()).toBe(scans + 1);
});

test('moving an observed node into an excluded subtree still captures its removal', async () => {
    document.body.innerHTML =
        '<section id="area"><input id="visible"><div class="adapter-decoration" id="decoration"></div></section>';
    const observer = owner().get(TrainingObserver);
    const root = document.querySelector('#area')!;

    observer.start(root, options);
    const scans = observer.scanCount();

    document.querySelector('#decoration')!.append(document.querySelector('#visible')!);
    await settleMutations();
    expect(observer.scanCount()).toBe(scans + 1);
    expect(snapshotIds(observer.snapshot()!)).toEqual(['area']);
});

test('microfrontend discovery ignores excluded roots and exclusive excluded mounting or removal', async () => {
    document.body.innerHTML =
        '<section data-mf="visible" id="area"><input id="visible"><div class="adapter-decoration"><section data-mf="excluded"><input></section></div></section>';
    const observer = owner().get(MicrofrontendObserver);

    observer.start(document.body, options);
    expect(observer.areas().map((area) => area.name)).toEqual(['visible']);
    await settleMutations();
    const initial = observer.areas()[0]!;
    const queries = jest.spyOn(document.body, 'querySelectorAll');
    const decoration = document.createElement('div');

    decoration.className = 'adapter-decoration';
    decoration.innerHTML = '<section data-mf="late-excluded"><input></section>';
    document.body.append(decoration);
    await settleMutations();
    decoration.remove();
    await settleMutations();
    expect(observer.areas()).toEqual([initial]);
    expect(queries).not.toHaveBeenCalled();
    queries.mockRestore();
});

test.each(
    transitionSelectors.flatMap((selector) =>
        ['inside', 'outside'].map((location) => ({selector, location})),
    ),
)(
    'capture updates exclusion transitions for $selector $location its root without polling',
    async ({selector, location}) => {
        const content = '<input id="field"><div id="nested"></div>';

        document.body.innerHTML =
            location === 'inside'
                ? `<section id="area"><div class="wrapper" id="wrapper">${content}</div></section>`
                : `<div class="wrapper" id="wrapper"><section id="area">${content}</section></div>`;
        const observer = owner([
            {...decorationAdapter, excludedSubtreeSelectors: [selector]},
        ]).get(TrainingObserver);

        const wrapper = document.querySelector('#wrapper')!;
        const field = document.querySelector<HTMLInputElement>('#field')!;

        observer.start(document.querySelector('#area')!, options);
        expect(observer.logicalControls()).toHaveLength(1);
        const scans = observer.scanCount();

        setExcluded(wrapper, selector, true);
        await settleMutations();
        expect(observer.scanCount()).toBe(scans + 1);
        expect(observer.logicalControls()).toEqual([]);
        field.setAttribute('data-changing', 'true');
        field.dispatchEvent(new Event('input', {bubbles: true}));
        wrapper.querySelector('#nested')!.append(document.createElement('span'));
        await settleMutations();
        expect(observer.scanCount()).toBe(scans + 1);
        setExcluded(wrapper, selector, false);
        await settleMutations();
        expect(observer.scanCount()).toBe(scans + 2);
        expect(
            observer.logicalControls().map((control) => control.locatorHints.id),
        ).toEqual(['field']);
    },
);

test.each(transitionSelectors)(
    'microfrontend discovery removes areas when their ancestor matches %s without polling',
    async (selector) => {
        document.body.innerHTML =
            '<div class="wrapper" id="wrapper"><section data-mf="area" id="area"><input id="field"><div id="nested"></div></section></div>';
        const observer = owner([
            {...decorationAdapter, excludedSubtreeSelectors: [selector]},
        ]).get(MicrofrontendObserver);

        const wrapper = document.querySelector('#wrapper')!;

        observer.start(document.body, options);
        expect(observer.areas()).toHaveLength(1);
        setExcluded(wrapper, selector, true);
        await settleMutations();
        expect(observer.areas()).toEqual([]);
        setExcluded(wrapper, selector, false);
        await settleMutations();
        expect(observer.areas()).toHaveLength(1);
        expect(observer.areas()[0]!.logicalControls).toHaveLength(1);
    },
);

test('microfrontend discovery removes a root which becomes excluded without polling', async () => {
    document.body.innerHTML = '<section data-mf="area" id="area"><input></section>';
    const observer = owner().get(MicrofrontendObserver);

    observer.start(document.body, options);
    document.querySelector('#area')!.classList.add('adapter-decoration');
    await settleMutations();
    expect(observer.areas()).toEqual([]);
});

test.each(['standalone', 'microfrontend'])(
    '%s observation removes a captured control whose selector starts matching after detachment',
    async (mode) => {
        document.body.innerHTML =
            '<section data-mf="area" id="area"><div></div><input class="field" id="field"></section>';
        const scope = owner([
            {...decorationAdapter, excludedSubtreeSelectors: ['.field:first-child']},
        ]);

        const standalone = scope.get(TrainingObserver);
        const microfrontend = scope.get(MicrofrontendObserver);

        if (mode === 'standalone') {
            standalone.start(document.querySelector('#area')!, options);
        } else {
            microfrontend.start(document.body, options);
        }

        document.querySelector('#field')!.remove();
        await settleMutations();
        expect(
            mode === 'standalone'
                ? standalone.logicalControls()
                : microfrontend.areas()[0]!.logicalControls,
        ).toEqual([]);
    },
);

test('invalid adapter exclusion selectors reject starts and reconnect gaps before observation changes', () => {
    const scope = owner([
        {...decorationAdapter, id: 'invalid-exclusion', excludedSubtreeSelectors: ['[']},
    ]);

    const observer = scope.get(TrainingObserver);
    const snapshots: Array<DomSnapshot | null> = [];

    observer.updates$.subscribe(({snapshot}) => {
        snapshots.push(snapshot);
    });

    expect(() => observer.start(document.body, options)).toThrow();
    expect(() => observer.reconnect(null, options)).toThrow();
    expect(() =>
        scope.get(MicrofrontendObserver).start(document.body, options),
    ).toThrow();
    expect(snapshots).toEqual([null]);
    expect(observer.isObserving()).toBe(false);
    expect(observer.scanCount()).toBe(0);
});
