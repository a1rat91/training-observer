import {expect, test} from '@jest/globals';
import {projectControls} from '@training-observer/core/adapters';
import {procedurePlayerAdapter} from '@training-observer/procedure-player';
import {taigaUiAdapter} from '@training-observer/taiga-ui';

function element(id, tagName, attributes = {}, children = [], extra = {}) {
    return {
        kind: 'element',
        id,
        parentId: null,
        tagName,
        attributes,
        children,
        path: `/${id}`,
        label: '',
        rects: [],
        visible: true,
        inViewport: true,
        hitTest: 'hit',
        interactive: true,
        interactionReasons: ['native'],
        pointerActionable: true,
        boundaries: [],
        state: {
            disabled: false,
            readOnly: false,
            inert: false,
            required: false,
            invalid: false,
            redacted: false,
        },
        ...extra,
    };
}

function text(id, value) {
    return {id, kind: 'text', parentId: null, visible: true, text: value};
}

function snapshot(...items) {
    const nodes = Object.fromEntries(items.map((node) => [node.id, node]));

    for (const node of items) {
        for (const child of node.children ?? []) {
            nodes[child] = {...nodes[child], parentId: node.id};
        }
    }

    return {
        schemaVersion: 1,
        rootId: items[0]?.id ?? null,
        capturedAt: '',
        durationMs: 0,
        nodes,
        interactiveIds: [],
        stats: {truncated: false},
    };
}

function radio(id, checked = false, extra = {}) {
    const node = element(id, 'input', {
        id,
        type: 'radio',
        name: 'employees',
        tuiradio: '',
    });

    return {...node, state: {...node.state, checked, value: id}, ...extra};
}

function tableFixture() {
    return snapshot(
        element('root', 'section', {}, ['table-host', 'native', 'taiga-host']),
        element('table-host', 'procedure-player-table', {}, ['search', 'table', 'next']),
        element('search', 'input', {tuiinput: '', id: 'search'}),
        element('next', 'button', {tuibutton: '', id: 'next'}),
        element('table', 'table', {}, ['head', 'body', 'foot']),
        element('head', 'thead', {}, ['header-row']),
        element('header-row', 'tr', {}, ['header-radio', 'sort']),
        radio('header-radio'),
        element('sort', 'button', {id: 'sort'}),
        element('body', 'tbody', {}, ['first-row', 'second-row']),
        element('first-row', 'tr', {}, ['first-radio', 'first-name', 'first-role']),
        radio('first-radio', true),
        text('first-name', '  Иван  Иванов '),
        text('first-role', ' Менеджер '),
        element('second-row', 'tr', {}, ['second-radio', 'second-name']),
        radio('second-radio'),
        text('second-name', 'Анна Смирнова'),
        element('foot', 'tfoot', {}, ['footer-row']),
        element('footer-row', 'tr', {}, ['footer-radio']),
        radio('footer-radio'),
        element('native', 'input', {id: 'native'}, [], {label: 'Native'}),
        element('taiga-host', 'tui-textfield', {}, ['amount']),
        element('amount', 'input', {id: 'amount', tuiinputnumber: ''}, [], {
            label: 'Amount',
        }),
    );
}

const project = (saved) =>
    projectControls(saved, [taigaUiAdapter, procedurePlayerAdapter]);

test('radio rows use the full normalized row text and preserve independent checked state', () => {
    const saved = tableFixture();
    const controls = project(saved).filter(({source}) => source === 'procedure-player');

    expect(
        controls.map(({label, hostNodeId, state}) => ({
            label,
            hostNodeId,
            checked: state.checked,
        })),
    ).toEqual([
        {label: 'Иван Иванов Менеджер', hostNodeId: 'first-row', checked: true},
        {label: 'Анна Смирнова', hostNodeId: 'second-row', checked: false},
    ]);
});

test('the business row label takes precedence over a generic radio accessibility label', () => {
    const saved = tableFixture();

    saved.nodes['first-radio'].label = 'Выбрать строку';
    saved.nodes['first-radio'].attributes['aria-label'] = 'Выбрать строку';
    expect(
        project(saved).find(({targetNodeId}) => targetNodeId === 'first-radio').label,
    ).toBe('Иван Иванов Менеджер');
});

test('search, sorting, pagination and radios in table headers and footers are chrome', () => {
    expect(project(tableFixture()).map(({targetNodeId}) => targetNodeId)).toEqual([
        'first-radio',
        'second-radio',
        'native',
        'amount',
    ]);
});

test('native and inherited Taiga controls outside the table keep their recognition', () => {
    const saved = tableFixture();
    const controls = project(saved);

    expect(controls.find(({targetNodeId}) => targetNodeId === 'native')).toMatchObject({
        kind: 'textbox',
        source: 'native',
        label: 'Native',
    });
    expect(controls.find(({targetNodeId}) => targetNodeId === 'amount')).toMatchObject({
        kind: 'number',
        source: 'taiga-ui',
        label: 'Amount',
    });
    expect(
        projectControls(saved, [procedurePlayerAdapter]).find(
            ({targetNodeId}) => targetNodeId === 'amount',
        ).source,
    ).toBe('native');
});

test('row and radio disabled states remain observable alongside the selected value', () => {
    const saved = tableFixture();

    saved.nodes['first-radio'].state.disabled = true;
    saved.nodes['second-row'].state.disabled = true;
    const controls = project(saved);

    expect(
        controls.find(({targetNodeId}) => targetNodeId === 'first-radio').state,
    ).toMatchObject({checked: true, disabled: true, value: 'first-radio'});
    expect(
        controls.find(({targetNodeId}) => targetNodeId === 'second-radio').state.disabled,
    ).toBe(true);
});

test('nested player tables use their own nearest row and preserve the outer row control', () => {
    const saved = tableFixture();

    saved.nodes['first-row'].children.push('nested-host');
    Object.assign(saved.nodes, {
        'nested-host': {
            ...element('nested-host', 'procedure-player-table', {}, ['nested-table']),
            parentId: 'first-row',
        },
        'nested-table': {
            ...element('nested-table', 'table', {}, ['nested-row']),
            parentId: 'nested-host',
        },
        'nested-row': {
            ...element('nested-row', 'tr', {}, ['nested-radio', 'nested-text']),
            parentId: 'nested-table',
        },
        'nested-radio': {...radio('nested-radio'), parentId: 'nested-row'},
        'nested-text': {
            ...text('nested-text', 'Вложенная строка'),
            parentId: 'nested-row',
        },
    });
    const controls = project(saved);

    expect(
        controls.find(({targetNodeId}) => targetNodeId === 'nested-radio'),
    ).toMatchObject({hostNodeId: 'nested-row', label: 'Вложенная строка'});
    expect(
        controls.find(({targetNodeId}) => targetNodeId === 'first-radio').hostNodeId,
    ).toBe('first-row');
});

test('a layout row outside the player table cannot turn a chrome radio into a data control', () => {
    const saved = snapshot(
        element('layout-row', 'tr', {}, ['host']),
        element('host', 'procedure-player-table', {}, ['chrome-radio']),
        radio('chrome-radio'),
    );

    expect(project(saved)).toEqual([]);
});

test('higher-priority component refinements retain the row host and do not mutate captured data', () => {
    const saved = tableFixture();
    const before = JSON.stringify(saved);
    const adapter = {
        id: 'test-procedure-refinement',
        priority: 300,
        match: ({baseCandidate}) =>
            baseCandidate?.source === 'procedure-player'
                ? {status: 'match', kind: baseCandidate.kind, label: 'Refined row'}
                : null,
    };
    const controls = projectControls(saved, [
        adapter,
        procedurePlayerAdapter,
        taigaUiAdapter,
    ]);

    expect(
        controls.find(({targetNodeId}) => targetNodeId === 'first-radio'),
    ).toMatchObject({
        source: adapter.id,
        kind: 'radio',
        hostNodeId: 'first-row',
        label: 'Refined row',
    });
    expect(JSON.stringify(saved)).toBe(before);
});
