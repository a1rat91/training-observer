/** Публичная регистрация адаптеров сохраняет scope владельца и работает через Angular-фасады. */
import {
    Component,
    createEnvironmentInjector,
    CUSTOM_ELEMENTS_SCHEMA,
    EnvironmentInjector,
    inject,
    type Provider,
} from '@angular/core';
import {type ComponentFixture, TestBed} from '@angular/core/testing';
import {expect} from '@jest/globals';
import {
    provideRecordingSession,
    provideTrainingSession,
    RecordingSession,
    TrainingSession,
} from '@training-observer/angular';
import {
    provideControlAdapters,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';
import {type ControlAdapter} from '@training-observer/core/adapters';
import {ControlType} from '@training-observer/core/models';
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui/angular';

const contenteditableAdapter: ControlAdapter = {
    id: 'demo-contenteditable',
    match: ({target}) =>
        target.attributes['data-demo-control'] === 'textbox' &&
        target.attributes.contenteditable === 'true'
            ? {status: 'match', kind: ControlType.Textbox}
            : null,
};

const addressAdapter: ControlAdapter = {
    id: 'demo-address',
    priority: 200,
    match: ({ancestors, baseCandidate}) => {
        const address = ancestors.find((node) => 'data-address' in node.attributes);

        return address && baseCandidate?.kind === ControlType.Textbox
            ? {
                  status: 'match',
                  kind: baseCandidate.kind,
                  hostId: address.id,
                  label: 'Адрес',
              }
            : null;
    },
};

const integration = {
    root: '#adapter-procedure',
    screen: {
        root: {attribute: {name: 'id', value: 'adapter-procedure'}},
        identity: {kind: 'attribute' as const, name: 'data-screen'},
    },
    observation: {includeText: false, batchDelayMs: 0, propertyCheckIntervalMs: 0},
};

@Component({
    selector: 'test-adapter-session-owner',
    template: `
        <section
            id="adapter-procedure"
            data-screen="A"
        >
            <input aria-label="Нативное поле" />
            <input
                aria-label="Сумма"
                tuiinputnumber
                value="1 500 ₽"
            />
            <div
                aria-label="Комментарий"
                contenteditable="true"
                data-demo-control="textbox"
            >
                Текст
            </div>
            <div
                aria-label="Не поддержано"
                contenteditable="true"
                data-demo-control="unsupported"
            >
                Не поле
            </div>
            <div data-address>
                <tui-textfield>
                    <input
                        tuiinput
                        value="Ленина, 10"
                    />
                    <button tuibuttonx>Очистить</button>
                </tui-textfield>
                <button>Проверить адрес</button>
            </div>
        </section>
    `,
    providers: [
        provideControlAdapters(contenteditableAdapter, addressAdapter),
        provideRecordingSession(integration),
        provideTrainingSession(integration),
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class SessionOwner {
    public readonly recording = inject(RecordingSession);
    public readonly training = inject(TrainingSession);
}

const scopes = new Set<EnvironmentInjector>();
const fixtures = new Set<ComponentFixture<unknown>>();
const contenteditable = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'isContentEditable',
);

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
    // JSDOM lacks this browser property; real contenteditable capture is covered in the browser suite.
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
        configurable: true,
        get(this: HTMLElement): boolean {
            return this.getAttribute('contenteditable') === 'true';
        },
    });
    jest.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        {x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30},
    ]);
});

afterEach(() => {
    for (const fixture of fixtures) {
        fixture.destroy();
    }

    fixtures.clear();

    for (const injector of [...scopes].reverse()) {
        injector.destroy();
    }

    scopes.clear();

    if (contenteditable) {
        Object.defineProperty(
            HTMLElement.prototype,
            'isContentEditable',
            contenteditable,
        );
    } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'isContentEditable');
    }

    jest.restoreAllMocks();
    TestBed.resetTestingModule();
});

test('native fallback does not implicitly install Taiga or recognize unsupported custom markup', () => {
    document.body.innerHTML =
        '<section><input tuiinputnumber aria-label="Сумма"><div contenteditable="true" data-demo-control="textbox">Текст</div></section>';
    const observer = scope(provideDomObservation()).get(TrainingObserver);

    observer.start(document.querySelector('section')!, integration.observation);
    expect(observer.logicalControls().map(({kind, source}) => ({kind, source}))).toEqual([
        {kind: 'textbox', source: 'native'},
    ]);
});

test('global Taiga registration reaches local observation owners', () => {
    TestBed.configureTestingModule({providers: [provideTaigaUiAdapter()]});
    document.body.innerHTML =
        '<section><input tuiinputnumber aria-label="Сумма"></section>';
    const observer = scope(provideDomObservation()).get(TrainingObserver);

    observer.start(document.querySelector('section')!, integration.observation);
    expect(observer.logicalControls()).toEqual([
        expect.objectContaining({kind: 'number', source: 'taiga-ui', label: 'Сумма'}),
    ]);
});

test('nested registrations add to inherited adapters and repeated adapter ids remain idempotent', () => {
    TestBed.configureTestingModule({providers: [provideTaigaUiAdapter()]});
    document.body.innerHTML =
        '<section><input tuiinputnumber aria-label="Сумма"><div contenteditable="true" data-demo-control="textbox" aria-label="Комментарий">Текст</div><div contenteditable="true" data-demo-control="nested" aria-label="Вложенное">Другой текст</div></section>';
    const match = jest.fn(contenteditableAdapter.match);
    const parentAdapter = {...contenteditableAdapter, match};
    const nestedAdapter: ControlAdapter = {
        id: 'demo-nested-editor',
        match: ({target}) =>
            target.attributes['data-demo-control'] === 'nested'
                ? {status: 'match', kind: ControlType.Textbox}
                : null,
    };

    const parent = scope([
        provideDomObservation(),
        provideControlAdapters(parentAdapter),
    ]);

    const child = scope(
        [
            provideDomObservation(),
            provideControlAdapters(parentAdapter, nestedAdapter),
            provideTaigaUiAdapter(),
        ],
        parent,
    );

    const observer = child.get(TrainingObserver);
    const snapshot = observer.start(
        document.querySelector('section')!,
        integration.observation,
    );

    expect(
        observer.logicalControls().map(({label, source}) => ({label, source})),
    ).toEqual([
        {label: 'Сумма', source: 'taiga-ui'},
        {label: 'Комментарий', source: 'demo-contenteditable'},
        {label: 'Вложенное', source: 'demo-nested-editor'},
    ]);
    expect(match).toHaveBeenCalledTimes(snapshot.stats.elementCount);
    const parentObserver = parent.get(TrainingObserver);

    parentObserver.start(document.querySelector('section')!, integration.observation);
    expect(parentObserver.logicalControls().map((control) => control.label)).toEqual([
        'Сумма',
        'Комментарий',
    ]);
});

test('owner-local adapters survive both recording and training wrapper injectors', () => {
    TestBed.configureTestingModule({providers: [provideTaigaUiAdapter()]});
    const fixture = TestBed.createComponent(SessionOwner);

    fixtures.add(fixture);
    fixture.detectChanges();
    const {recording, training} = fixture.componentInstance;

    for (const session of [recording, training]) {
        expect(session.screen().status).toBe('ready');
        const controls = session.screen().controls;

        expect(controls.map(({label, kind, source}) => ({label, kind, source}))).toEqual([
            {label: 'Нативное поле', kind: 'textbox', source: 'native'},
            {label: 'Сумма', kind: 'number', source: 'taiga-ui'},
            {label: 'Комментарий', kind: 'textbox', source: 'demo-contenteditable'},
            {label: 'Адрес', kind: 'textbox', source: 'demo-address'},
            {label: 'Проверить адрес', kind: 'button', source: 'native'},
        ]);
        expect(controls[2]?.state.value).toBe(
            fixture.nativeElement.querySelector('[data-demo-control="textbox"]')
                .textContent,
        );
        expect(controls[3]?.state.value).toBe('Ленина, 10');
    }

    expect(recording.controls()[3]?.memberNodeIds).toContain(
        Object.values(recording.snapshot()!.nodes).find(
            (node) => node.kind === 'element' && 'tuibuttonx' in node.attributes,
        )?.id,
    );
});
