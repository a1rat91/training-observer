import {Component, CUSTOM_ELEMENTS_SCHEMA, inject} from '@angular/core';
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {CONTROL_ADAPTERS, DOM_OBSERVATION_OPTIONS} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';
import {
    type ProcedurePlayerBlockChange,
    ProcedurePlayerObserver,
    provideProcedurePlayerAdapter,
} from '@training-observer/procedure-player';
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui';

import {MicrofrontendHostDirective} from './microfrontend-host.directive';

const wrapperAdapter: ControlAdapter = {
    id: 'test-procedure-field',
    priority: 200,
    match({ancestors, baseCandidate}) {
        const wrapper = ancestors.find(
            (node) => 'data-procedure-field' in node.attributes,
        );

        return wrapper && baseCandidate
            ? {
                  status: 'match',
                  kind: baseCandidate.kind,
                  hostId: wrapper.id,
                  label: wrapper.attributes['data-procedure-field'],
              }
            : null;
    },
};

@Component({
    imports: [MicrofrontendHostDirective],
    template: `
        <microfrontend>
            <workflow-shell id="first-player">
                <section block-id="A">
                    <input aria-label="First answer" />
                </section>
            </workflow-shell>
        </microfrontend>
        <microfrontend>
            <article
                id="second-player"
                block-id="X"
            >
                <input aria-label="Second answer" />
            </article>
        </microfrontend>
        <microfrontend>
            <employee-card><input aria-label="Unrelated native field" /></employee-card>
        </microfrontend>
    `,
    providers: [provideProcedurePlayerAdapter()],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class ObserverOwner {
    public readonly observer = inject(ProcedurePlayerObserver);
}

@Component({
    imports: [MicrofrontendHostDirective],
    template: `
        <microfrontend>
            <account-settings block-id="Custom fields">
                <section data-procedure-field="Wrapped Taiga">
                    <input
                        aria-label="Base number"
                        tuiinputnumber
                        value="42"
                    />
                </section>
                <section data-procedure-field="Wrapped native">
                    <input
                        aria-label="Base text"
                        value="Text"
                    />
                </section>
                <input
                    aria-label="Inherited Taiga"
                    tuiinputnumber
                    value="10"
                />
                <input aria-label="Native fallback" />
            </account-settings>
        </microfrontend>
    `,
    providers: [provideProcedurePlayerAdapter(wrapperAdapter)],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class CustomObserverOwner {
    public readonly observer = inject(ProcedurePlayerObserver);
}

let fixture: ComponentFixture<ObserverOwner>;

async function settle(): Promise<void> {
    await fixture.whenStable();
    // Mutation delivery and the zero-delay observation batch run outside Angular.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
    fixture.detectChanges();
    await fixture.whenStable();
}

function element(selector: string): HTMLElement {
    return fixture.nativeElement.querySelector(selector);
}

beforeEach(() => {
    TestBed.configureTestingModule({
        providers: [
            provideTaigaUiAdapter(),
            {
                provide: DOM_OBSERVATION_OPTIONS,
                useValue: {
                    maxDepth: 100,
                    maxNodes: 10_000,
                    includeText: true,
                    cursorHeuristics: false,
                    ignoreSelector: '[data-training-observer-ignore]',
                    batchDelayMs: 0,
                    propertyCheckIntervalMs: 0,
                },
            },
        ],
    });
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
    fixture = TestBed.createComponent(ObserverOwner);
    fixture.detectChanges();
});

test('component adapters refine inherited Taiga and native controls within their owner', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(CustomObserverOwner);
    fixture.detectChanges();
    await settle();
    const {observer} = fixture.componentInstance;
    const controls = observer.players()[0]?.state.controls;

    expect(controls?.map(({label, kind, source}) => ({label, kind, source}))).toEqual([
        {label: 'Wrapped Taiga', kind: 'number', source: wrapperAdapter.id},
        {label: 'Wrapped native', kind: 'textbox', source: wrapperAdapter.id},
        {label: 'Inherited Taiga', kind: 'number', source: 'taiga-ui'},
        {label: 'Native fallback', kind: 'textbox', source: 'native'},
    ]);
    expect(TestBed.inject(CONTROL_ADAPTERS).map(({id}) => id)).toEqual(['taiga-ui']);
});

afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
});

test('recognizes block owners with arbitrary tags among unrelated microfrontends without a recording session', async () => {
    const {observer} = fixture.componentInstance;
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    await settle();
    expect(observer.areas()).toHaveLength(3);
    expect(observer.players().map(({state}) => state.key)).toEqual(['A', 'X']);
    expect(events).toEqual([]);
    const [first, second] = observer.players();

    expect(first?.state.controls.map(({label}) => label)).toEqual(['First answer']);
    expect(second?.state.controls.map(({label}) => label)).toEqual(['Second answer']);
    element('#first-player [block-id]').setAttribute('block-id', 'B');
    element('#second-player').setAttribute('block-id', 'Y');
    await settle();
    expect(events).toEqual([
        expect.objectContaining({
            microfrontendId: first?.microfrontendId,
            previousBlockId: 'A',
            blockId: 'B',
        }),
        expect.objectContaining({
            microfrontendId: second?.microfrontendId,
            previousBlockId: 'X',
            blockId: 'Y',
        }),
    ]);
    element('#first-player input').setAttribute('value', 'Edited answer');
    await settle();
    expect(events).toHaveLength(2);
});

test('does not interpret a loading block as a completed transition', async () => {
    const {observer} = fixture.componentInstance;
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    await settle();
    const block = element('#first-player [block-id]');

    block.setAttribute('aria-busy', 'true');
    block.setAttribute('block-id', 'B');
    await settle();
    expect(observer.players()[0]?.state.status).toBe('loading');
    expect(events).toEqual([]);
    block.setAttribute('aria-busy', 'false');
    await settle();
    expect(events).toEqual([
        expect.objectContaining({previousBlockId: 'A', blockId: 'B'}),
    ]);
});

test('retains the last block while a mounted microfrontend temporarily removes its marker during loading', async () => {
    const {observer} = fixture.componentInstance;
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    await settle();
    const block = element('#first-player [block-id]');

    element('#first-player').setAttribute('aria-busy', 'true');
    block.removeAttribute('block-id');
    await settle();
    expect(observer.players().map(({state}) => state.key)).toEqual(['X']);
    expect(events).toEqual([]);
    block.setAttribute('block-id', 'B');
    await settle();
    expect(events).toEqual([]);
    element('#first-player').removeAttribute('aria-busy');
    await settle();
    expect(events).toEqual([
        expect.objectContaining({previousBlockId: 'A', blockId: 'B'}),
    ]);
});

test('keeps nested foreign microfrontends outside the procedure block scope', async () => {
    const {observer} = fixture.componentInstance;

    await settle();
    const foreign = document.createElement('microfrontend');

    foreign.innerHTML =
        '<employee-card><section block-id="foreign"><input aria-label="Foreign answer"></section></employee-card>';
    element('#first-player [block-id]').append(foreign);
    await settle();
    expect(observer.players()[0]?.state).toMatchObject({status: 'ready', key: 'A'});
    expect(observer.players()[0]?.state.controls.map(({label}) => label)).toEqual([
        'First answer',
    ]);
});

test('discovers nested microfrontends independently without adding their controls to the parent', async () => {
    const {observer} = fixture.componentInstance;

    await settle();
    const nested = document.createElement('microfrontend');

    nested.innerHTML =
        '<section block-id="Nested"><input aria-label="Nested answer"></section>';
    element('#first-player [block-id]').append(nested);
    await settle();
    expect(observer.players()).toHaveLength(3);
    const parent = observer.players().find(({state}) => state.key === 'A');
    const child = observer.players().find(({state}) => state.key === 'Nested');

    expect(parent?.state.status).toBe('ready');
    expect(parent?.state.controls.map(({label}) => label)).toEqual(['First answer']);
    expect(child?.state.controls.map(({label}) => label)).toEqual(['Nested answer']);
});

test('limits an arbitrary microfrontend to controls inside its block marker', async () => {
    const {observer} = fixture.componentInstance;
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    await settle();
    const foreign = document.createElement('microfrontend');

    foreign.innerHTML =
        '<employee-card><input aria-label="Foreign field"><div block-id="Nested"><input aria-label="Nested field"></div></employee-card>';
    fixture.nativeElement.append(foreign);
    await settle();
    expect(
        observer
            .players()
            .map(({state}) => state.key)
            .sort((first, second) => (first ?? '').localeCompare(second ?? '')),
    ).toEqual(['A', 'Nested', 'X']);
    const nested = observer.players().find(({state}) => state.key === 'Nested');

    expect(nested?.state.controls.map(({label}) => label)).toEqual(['Nested field']);
    expect(events).toEqual([]);
    foreign.querySelector('[block-id]')!.setAttribute('block-id', 'Next');
    await settle();
    expect(events).toEqual([
        expect.objectContaining({
            microfrontendId: nested?.microfrontendId,
            previousBlockId: 'Nested',
            blockId: 'Next',
        }),
    ]);
});

test('a replacement player establishes a new baseline after the old area unmounts', async () => {
    const {observer} = fixture.componentInstance;
    const events: ProcedurePlayerBlockChange[] = [];

    observer.blockChanges$.subscribe((event) => {
        events.push(event);
    });
    await settle();
    const previousId = observer.players()[0]?.microfrontendId;

    element('#first-player').remove();
    await settle();
    expect(observer.players().map(({state}) => state.key)).toEqual(['X']);
    const replacement = document.createElement('section');

    replacement.id = 'replacement-player';
    replacement.setAttribute('block-id', 'New');
    const wrapper = document.createElement('microfrontend');

    wrapper.append(replacement);
    fixture.nativeElement.append(wrapper);
    await settle();
    const current = observer.players().find(({state}) => state.key === 'New');

    expect(current?.microfrontendId).toBeDefined();
    expect(current?.microfrontendId).not.toBe(previousId);
    expect(events).toEqual([]);
    replacement.setAttribute('block-id', 'Next');
    await settle();
    expect(events).toEqual([
        expect.objectContaining({
            microfrontendId: current?.microfrontendId,
            previousBlockId: 'New',
            blockId: 'Next',
        }),
    ]);
});

test('destroys owned observers and completes the event stream with its owner', async () => {
    const {observer} = fixture.componentInstance;
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
    await settle();
    const root = element('#first-player');

    fixture.destroy();
    expect(complete).toBe(true);
    expect(observer.areas()).toEqual([]);
    root.setAttribute('block-id', 'after-destroy');
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
    });
    expect(events).toEqual([]);
    expect(observer.areas()).toEqual([]);
});
