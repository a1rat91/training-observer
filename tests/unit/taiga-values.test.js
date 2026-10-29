/** @jest-environment jsdom */
import {expect, jest, test} from '@jest/globals';
import {projectControls} from '../../libs/training-observer/adapters/src';
import {taigaUiAdapter} from '../../libs/training-taiga-ui/src/lib/taiga-ui-adapter';
import {StateRecorder} from '../../libs/training-recording/src/lib/state-recorder';
import {compileScenario} from '../../libs/training-recording/src/lib/scenario-compiler';
import {ScenarioRuntime} from '../../libs/training-runtime/src/lib/scenario-runtime';

function snapshot(html, states = {}) {
    const root = document.createElement('section');

    root.innerHTML = html;
    const nodes = {};
    let sequence = 0;
    const visit = (node, parentId) => {
        const id = `node-${++sequence}`;

        if (node.nodeType === Node.TEXT_NODE) {
            nodes[id] = {
                id,
                parentId,
                kind: 'text',
                text: node.textContent,
                visible: true,
            };
        } else {
            const attributes = Object.fromEntries(
                [...node.attributes].map(({name, value}) => [name, value]),
            );

            nodes[id] = {
                id,
                parentId,
                kind: 'element',
                tagName: node.tagName.toLowerCase(),
                path: id,
                attributes,
                label: attributes['aria-label'] ?? '',
                children: [...node.childNodes].map((child) => visit(child, id)),
                rects: [],
                visible: true,
                inViewport: true,
                hitTest: 'not-tested',
                interactive: false,
                interactionReasons: [],
                pointerActionable: true,
                boundaries: [],
                state: {
                    value: node instanceof HTMLInputElement ? node.value : undefined,
                    disabled: node.hasAttribute('disabled'),
                    readOnly: node.hasAttribute('readonly'),
                    inert: false,
                    required: false,
                    invalid: false,
                    redacted: node.getAttribute('type') === 'password',
                    ...states[node.id],
                },
            };
        }

        return id;
    };
    const rootId = visit(root, null);

    return {
        schemaVersion: 1,
        rootId,
        nodes,
        capturedAt: '',
        durationMs: 0,
        interactiveIds: [],
        stats: {
            nodeCount: sequence,
            elementCount: 0,
            textCount: 0,
            boundaryCount: 0,
            truncated: false,
            limitsReached: [],
        },
    };
}

const field = (html, adapters = [taigaUiAdapter], states) =>
    projectControls(snapshot(html, states), adapters).find(
        (control) => control.locatorHints.id === 'field',
    );

const override = (resolveValue) => ({
    id: 'business-field',
    priority: 200,
    match: ({target, baseCandidate}) =>
        target.attributes.id === 'field' && baseCandidate
            ? {status: 'match', kind: baseCandidate.kind}
            : null,
    resolveValue,
});

test.each([
    'tui-input-date',
    'tui-input-date-range',
    'tui-input-date-time',
    'tui-input-month',
    'tui-input-month-range',
    'tui-input-time',
    'tui-input-time-range',
])('%s reads its displayed ghost value as one textbox', (tag) => {
    const controls = projectControls(
        snapshot(`<${tag}><tui-primitive-textfield>
            <input id="field" role="combobox" readonly>
            <tui-value-decoration><span class="t-ghost"> 29.10.2026   12:30 </span></tui-value-decoration>
        </tui-primitive-textfield></${tag}>`),
        [taigaUiAdapter],
    );

    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({
        kind: 'textbox',
        source: 'taiga-ui',
        state: {value: '29.10.2026 12:30', readOnly: true},
    });
});

test('a missing date ghost keeps the native value and unrelated inputs keep native semantics', () => {
    expect(
        field('<tui-input-date><input id="field" value="29.10.2026"></tui-input-date>')
            .state.value,
    ).toBe('29.10.2026');
    expect(field('<input id="field" value="native">').state.value).toBe('native');
});

test('an outer business adapter inherits the Taiga value from its lower layer', () => {
    expect(
        field(
            '<tui-input-time><input id="field"><span class="t-ghost">12:30</span></tui-input-time>',
            [taigaUiAdapter, override()],
        ),
    ).toMatchObject({source: 'business-field', state: {value: '12:30'}});
});

test('undefined falls back through layers while empty strings and arrays are explicit values', () => {
    const html = '<input id="field" value="native">';
    const inner = {...override(() => 'inner'), id: 'inner', priority: 100};

    expect(field(html, [inner, override(() => undefined)]).state.value).toBe('inner');
    expect(field(html, [inner, override(() => '')]).state.value).toBe('');
    expect(field(html, [inner, override(() => [])]).state.value).toEqual([]);
});

test('an inherited value resolver reads its own field rather than sibling ghosts in the outer business host', () => {
    const business = {
        ...override(),
        match: ({target, ancestors, baseCandidate}) =>
            target.attributes.id === 'field' && baseCandidate
                ? {
                      status: 'match',
                      kind: baseCandidate.kind,
                      hostId: ancestors.find((node) => node.tagName === 'business-form')
                          .id,
                  }
                : null,
    };

    expect(
        field(
            `<business-form>
        <tui-input-date><input id="sibling"><span class="t-ghost">Wrong field</span></tui-input-date>
        <tui-input-time><input id="field"><span class="t-ghost">12:30</span></tui-input-time>
    </business-form>`,
            [taigaUiAdapter, business],
        ).state.value,
    ).toBe('12:30');
});

test('resolved arrays are copied into the published snapshot', () => {
    const selected = ['First'];
    const captured = field('<input id="field">', [override(() => selected)]);

    selected.push('Later');
    expect(captured.state.value).toEqual(['First']);
});

test.each([null, 12, {}, ['valid', 12], Array(1)].map((value) => ({value})))(
    'invalid resolved values fail instead of entering snapshots: $value',
    ({value}) => {
        expect(() => field('<input id="field">', [override(() => value)])).toThrow(
            'Invalid value returned by control adapter business-field.',
        );
    },
);

test('value resolvers cannot recover a redacted password or invent a button value', () => {
    const resolver = jest.fn(() => 'secret');

    expect(
        field('<input id="field" type="password">', [override(resolver)]).state,
    ).toMatchObject({
        redacted: true,
        value: undefined,
    });
    expect(
        field('<button id="field">Save</button>', [override(resolver)]).state.value,
    ).toBeUndefined();
    expect(resolver).not.toHaveBeenCalled();
});

test('a multi-select returns separate labels, ignoring the search text and unrelated .t-text nodes', () => {
    const control = field(`<tui-multi-select disabled><tui-input-tag>
        <span class="t-text">Decoration</span>
        <div class="t-tags">
            <span class="t-text">First, with comma</span><span class="t-text">Second</span>
            <input id="field" role="combobox" value="search" disabled>
        </div>
    </tui-input-tag></tui-multi-select>`);

    expect(control.kind).toBe('textbox');
    expect(control.state.value).toEqual(['First, with comma', 'Second']);
    expect(control.state.disabled).toBe(true);
    expect(control.pointerActionable).toBe(false);
});

test('a multi-select with a rendered empty tags container has an empty selection rather than the search query', () => {
    expect(
        field(`<tui-multi-select><tui-input-tag><div class="t-tags">
        <input id="field" role="combobox" value="search">
    </div></tui-input-tag></tui-multi-select>`).state.value,
    ).toEqual([]);
});

test('multi-select tag components contribute visible label text without remove-button text', () => {
    expect(
        field(`<tui-multi-select><tui-input-tag><div class="t-tags">
        <tui-tag class="t-tag"><span class="t-text">First</span><button>Remove</button></tui-tag>
        <tui-tag class="t-tag"><span class="t-text">Second</span><button>Remove</button></tui-tag>
        <input id="field" role="combobox">
    </div></tui-input-tag></tui-multi-select>`).state.value,
    ).toEqual(['First', 'Second']);
});

test('multi-select arrays survive recording, scenario compilation and training, including clearing the selection', () => {
    const initial = field(`<tui-multi-select><tui-input-tag><div class="t-tags">
        <input id="field" role="combobox">
    </div></tui-input-tag></tui-multi-select>`);
    const selected = {
        ...initial,
        state: {...initial.state, value: ['First, with comma', 'Second']},
    };
    const cleared = {...initial, state: {...initial.state, value: []}};
    const screen = (control) => ({status: 'ready', key: 'A', controls: [control]});
    const recorder = new StateRecorder();

    recorder.start(screen(initial), {});
    recorder.observe(screen(selected), {});
    expect(recorder.snapshot().events).toHaveLength(1);
    recorder.observe(screen(selected), {[selected.id]: selected});
    recorder.observe(screen(cleared), {[cleared.id]: cleared});
    const recording = recorder.stop();

    expect(recording.complete).toBe(true);
    expect(
        recording.events.filter(({kind}) => kind === 'value').map(({value}) => value),
    ).toEqual([['First, with comma', 'Second'], []]);
    const scenario = compileScenario(recording);

    expect(scenario.steps[0].fields[0].expected).toEqual([]);
    const runtime = new ScenarioRuntime(scenario);

    runtime.update(screen(selected), {});
    expect(runtime.update(screen(cleared), {[cleared.id]: cleared}).status).toBe(
        'complete',
    );
});
