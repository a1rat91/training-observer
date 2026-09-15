import {expect, test} from '@playwright/test';
import {
    type DomElementSnapshot,
    type DomNodeSnapshot,
    type DomSnapshot,
} from '@training-observer/core/models';

import {ControlSnapshotBuilder} from '../libs/training-observer/src/lib/controls/control-snapshot-builder';

function element(
    id: string,
    tagName: string,
    attributes: Record<string, string> = {},
    children: string[] = [],
    overrides: Partial<DomElementSnapshot> = {},
): DomElementSnapshot {
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
        ...overrides,
    };
}

function text(id: string, value: string): DomNodeSnapshot {
    return {kind: 'text', id, parentId: null, text: value, visible: true};
}

function snapshot(...items: DomNodeSnapshot[]): DomSnapshot {
    const nodes: Record<string, DomNodeSnapshot> = Object.fromEntries(
        items.map((node) => [node.id, node]),
    );

    for (const node of items) {
        if (node.kind !== 'element') {
            continue;
        }

        for (const child of node.children) {
            if (nodes[child]) {
                nodes[child] = {...nodes[child], parentId: node.id};
            }
        }
    }

    return {
        schemaVersion: 1,
        capturedAt: '2026-09-10T00:00:00.000Z',
        durationMs: 0,
        rootId: items[0]?.id ?? null,
        relatedRootIds: [],
        nodes,
        interactiveIds: [],
        stats: {
            nodeCount: items.length,
            elementCount: items.filter((node) => node.kind === 'element').length,
            textCount: items.filter((node) => node.kind === 'text').length,
            boundaryCount: 0,
            truncated: false,
            limitsReached: [],
        },
    };
}

test('projection works on a saved snapshot without a document or Angular injector and does not mutate it', () => {
    const input = element('number', 'input', {tuiinputnumber: '', id: 'amount'});
    const saved = snapshot(
        element('field', 'tui-textfield', {}, ['label', 'number']),
        element('label', 'label', {tuilabel: ''}, ['caption']),
        text('caption', '  Сумма  '),
        {...input, state: {...input.state, value: '9 007 199 254 740 993 ₽'}},
    );

    const original = JSON.stringify(saved);
    const builder = new ControlSnapshotBuilder();
    const result = builder.build(saved);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
        kind: 'number',
        source: 'taiga-ui',
        label: 'Сумма',
        hostNodeId: 'field',
        targetNodeId: 'number',
        state: {value: '9 007 199 254 740 993 ₽'},
    });
    expect(JSON.stringify(saved)).toBe(original);
    expect(builder.build(JSON.parse(original))).toEqual(result);
});

test('Taiga priority and intentional exclusions survive native fallback', () => {
    const filler = element('filler', 'input', {'aria-hidden': 'true', class: 't-filler'});
    const result = new ControlSnapshotBuilder().build(
        snapshot(
            element('root', 'section', {}, [
                'select',
                'unknown-select',
                'multi',
                'option',
                'field',
            ]),
            element('select', 'input', {tuiselect: '', tuiselectlike: ''}),
            element('unknown-select', 'input', {tuiselectlike: ''}),
            element('multi', 'tui-textfield', {multi: ''}, ['editor']),
            element('editor', 'input', {tuiinputnumber: ''}),
            element('option', 'div', {role: 'option'}, ['checkmark']),
            element('checkmark', 'input', {type: 'checkbox', tuicheckbox: ''}),
            element('field', 'tui-textfield', {}, ['filler']),
            {...filler, state: {...filler.state, disabled: true}},
        ),
    );

    expect(
        result.map((control) => [control.targetNodeId, control.kind, control.source]),
    ).toEqual([['select', 'select', 'taiga-ui']]);
});

test('members retain cleaner and label order but stop at independent controls', () => {
    const saved = snapshot(
        element('field', 'tui-textfield', {}, ['label', 'input', 'cleaner', 'button']),
        element('label', 'label', {tuilabel: ''}, ['caption']),
        text('caption', 'Имя'),
        element('input', 'input', {tuiinput: ''}),
        element('cleaner', 'button', {tuibuttonx: ''}, ['clear-caption']),
        text('clear-caption', 'Очистить'),
        element('button', 'button', {}, ['button-caption']),
        text('button-caption', 'Проверить'),
    );

    const result = new ControlSnapshotBuilder().build(saved);

    expect(result.map((control) => control.targetNodeId)).toEqual(['input', 'button']);
    expect(result[0].memberNodeIds).toEqual([
        'field',
        'label',
        'caption',
        'input',
        'cleaner',
        'clear-caption',
    ]);
    expect(result[1].memberNodeIds).toEqual(['button', 'button-caption']);
});

test('ambiguous floating labels stay empty; an explicit captured label takes precedence', () => {
    const saved = snapshot(
        element('field', 'tui-textfield', {}, ['a', 'b', 'input']),
        element('a', 'label', {tuilabel: ''}, ['a-text']),
        text('a-text', 'Первое'),
        element('b', 'label', {tuilabel: ''}, ['b-text']),
        text('b-text', 'Второе'),
        element('input', 'input', {tuiinput: ''}),
    );

    const builder = new ControlSnapshotBuilder();

    expect(builder.build(saved)[0].label).toBe('');
    const labelled = {
        ...saved,
        nodes: {...saved.nodes, input: {...saved.nodes['input'], label: 'Явная подпись'}},
    };

    expect(builder.build(labelled)[0].label).toBe('Явная подпись');
});

test('duplicate HTML ids retain the existing distinct context and popup policies', () => {
    const saved = snapshot(
        element('group', 'section', {'aria-labelledby': 'duplicate'}, [
            'a',
            'b',
            'input',
        ]),
        element('a', 'div', {id: 'duplicate'}, ['a-text']),
        text('a-text', 'Первое'),
        element('b', 'div', {id: 'duplicate'}, ['b-text']),
        text('b-text', 'Последнее'),
        element('input', 'input', {
            tuiinput: '',
            role: 'combobox',
            'aria-expanded': 'true',
            'aria-controls': 'duplicate',
        }),
    );

    const control = new ControlSnapshotBuilder().build(saved)[0];

    expect(control.locatorHints.context).toEqual([
        {tagName: 'section', id: undefined, label: 'Последнее'},
    ]);
    expect(control.popup).toMatchObject({status: 'unresolved', rootNodeIds: []});
});

test('truncated graph references are not invented and redacted values are not projected', () => {
    const input = element('secret', 'input', {type: 'password'}, [], {label: 'Пароль'});
    const saved = snapshot(element('field', 'tui-textfield', {}, ['secret', 'missing']), {
        ...input,
        state: {...input.state, redacted: true, value: 'must-not-leak'},
    });

    const truncated: DomSnapshot = {
        ...saved,
        stats: {...saved.stats, truncated: true, limitsReached: ['maxNodes']},
    };

    const result = new ControlSnapshotBuilder().build(truncated);

    expect(result[0].memberNodeIds).toEqual(['field', 'secret']);
    expect(result[0].state.value).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
});
