import {expect, test} from '@playwright/test';
import {type ControlAdapter, projectControls} from '@training-observer/core/adapters';
import {
    type DomElementSnapshot,
    type DomNodeSnapshot,
    type DomSnapshot,
} from '@training-observer/core/models';
import {taigaUiAdapter} from '@training-observer/taiga-ui';

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
    const result = projectControls(saved, [taigaUiAdapter]);

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
    expect(projectControls(JSON.parse(original), [taigaUiAdapter])).toEqual(result);
});

test('Taiga priority and intentional exclusions survive native fallback', () => {
    const filler = element('filler', 'input', {'aria-hidden': 'true', class: 't-filler'});
    const result = projectControls(
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
        [taigaUiAdapter],
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

    const result = projectControls(saved, [taigaUiAdapter]);

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

    expect(projectControls(saved, [taigaUiAdapter])[0].label).toBe('');
    const labelled = {
        ...saved,
        nodes: {...saved.nodes, input: {...saved.nodes['input'], label: 'Явная подпись'}},
    };

    expect(projectControls(labelled, [taigaUiAdapter])[0].label).toBe('Явная подпись');
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

    const control = projectControls(saved, [taigaUiAdapter])[0];

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

    const result = projectControls(truncated, [taigaUiAdapter]);

    expect(result[0].memberNodeIds).toEqual(['field', 'secret']);
    expect(result[0].state.value).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
});

test('a business wrapper composes a Taiga field, retains its popup and excludes only known decoration', () => {
    const addressAdapter: ControlAdapter = {
        id: 'address-field',
        priority: 200,
        match: ({ancestors, baseCandidate}) => {
            const address = ancestors.find((node) => 'data-address' in node.attributes);

            return address && baseCandidate?.kind === 'textbox'
                ? {
                      status: 'match',
                      kind: baseCandidate.kind,
                      hostId: address.id,
                      label: 'Адрес',
                  }
                : null;
        },
    };

    const input = element('address-input', 'input', {
        tuiinput: '',
        role: 'combobox',
        'aria-controls': 'address-popup',
    });

    const saved = snapshot(
        element('root', 'section', {}, ['address', 'popup']),
        element('address', 'div', {'data-address': ''}, ['field', 'check']),
        element('field', 'tui-textfield', {}, ['label', 'address-input', 'cleaner']),
        element('label', 'label', {tuilabel: ''}, ['label-text']),
        text('label-text', 'Улица'),
        {...input, state: {...input.state, value: 'Ленина, 10', expanded: true}},
        element('cleaner', 'button', {tuibuttonx: ''}, ['cleaner-text']),
        text('cleaner-text', 'Очистить'),
        element('check', 'button', {}, ['check-text']),
        text('check-text', 'Проверить адрес'),
        element('popup', 'div', {id: 'address-popup'}, ['suggestion']),
        element('suggestion', 'div', {role: 'option'}, ['suggestion-text']),
        text('suggestion-text', 'Ленина, 10'),
    );

    const result = projectControls(saved, [addressAdapter, taigaUiAdapter]);

    expect(result.map((control) => control.targetNodeId)).toEqual([
        'address-input',
        'check',
    ]);
    expect(result[0]).toMatchObject({
        kind: 'textbox',
        source: 'address-field',
        label: 'Адрес',
        hostNodeId: 'address',
        targetNodeId: 'address-input',
        state: {value: 'Ленина, 10'},
        popup: {status: 'open', relation: 'aria-controls', rootNodeIds: ['popup']},
    });
    expect(result[0].memberNodeIds).toEqual([
        'address',
        'field',
        'label',
        'label-text',
        'address-input',
        'cleaner',
        'cleaner-text',
    ]);
    expect(result[1].source).toBe('native');
    expect(projectControls(saved, [taigaUiAdapter, addressAdapter])).toEqual(result);
});

test('composition preserves inner host state and resolves each inner label in its own field', () => {
    const addressAdapter: ControlAdapter = {
        id: 'address-field',
        priority: 200,
        match: ({ancestors, baseCandidate}) => {
            const address = ancestors.find((node) => 'data-address' in node.attributes);

            return address && baseCandidate?.kind === 'textbox'
                ? {status: 'match', kind: baseCandidate.kind, hostId: address.id}
                : null;
        },
    };

    const streetHost = element('street-field', 'tui-textfield', {}, [
        'street-label',
        'street',
    ]);

    const saved = snapshot(
        element('address', 'div', {'data-address': ''}, ['street-field', 'house-field']),
        {
            ...streetHost,
            state: {
                ...streetHost.state,
                disabled: true,
                readOnly: true,
                inert: true,
                required: true,
                invalid: true,
                expanded: true,
            },
        },
        element('street-label', 'label', {tuilabel: ''}, ['street-caption']),
        text('street-caption', 'Улица'),
        element('street', 'input', {tuiinput: ''}),
        element('house-field', 'tui-textfield', {}, ['house-label', 'house']),
        element('house-label', 'label', {tuilabel: ''}, ['house-caption']),
        text('house-caption', 'Дом'),
        element('house', 'input', {tuiinput: ''}),
    );

    const result = projectControls(saved, [taigaUiAdapter, addressAdapter]);

    expect(
        result.map(({label, hostNodeId, source}) => ({label, hostNodeId, source})),
    ).toEqual([
        {label: 'Улица', hostNodeId: 'address', source: 'address-field'},
        {label: 'Дом', hostNodeId: 'address', source: 'address-field'},
    ]);
    expect(result[0].state).toMatchObject({
        disabled: true,
        readOnly: true,
        inert: true,
        required: true,
        invalid: true,
        expanded: true,
    });
    expect(result[0].pointerActionable).toBe(false);
    expect(result[1].state).toMatchObject({
        disabled: false,
        readOnly: false,
        inert: false,
        required: false,
        invalid: false,
    });
    expect(result[1].pointerActionable).toBe(true);
});

for (const kind of ['textbox', 'select'] as const) {
    test(`composition preserves a ${kind} popup relation carried only by the inner host`, () => {
        const addressAdapter: ControlAdapter = {
            id: 'address-field',
            priority: 200,
            match: ({ancestors, baseCandidate}) => {
                const address = ancestors.find(
                    (node) => 'data-address' in node.attributes,
                );

                return address && baseCandidate?.kind === kind
                    ? {status: 'match', kind: baseCandidate.kind, hostId: address.id}
                    : null;
            },
        };

        const field = element(
            'field',
            'tui-textfield',
            {'aria-controls': 'address-popup'},
            ['input'],
        );

        const input = element('input', 'input', {
            [kind === 'select' ? 'tuiselect' : 'tuiinput']: '',
            role: 'combobox',
        });

        const saved = snapshot(
            element('root', 'section', {}, ['address', 'popup']),
            element('address', 'div', {'data-address': ''}, ['field']),
            {...field, state: {...field.state, expanded: true}},
            {...input, state: {...input.state, value: 'Ленина, 10'}},
            element('popup', 'div', {id: 'address-popup', role: 'listbox'}, ['option']),
            element('option', 'div', {role: 'option'}, ['caption']),
            text('caption', 'Ленина, 10'),
        );

        const control = projectControls(saved, [taigaUiAdapter, addressAdapter])[0];

        expect(control).toMatchObject({
            hostNodeId: 'address',
            source: 'address-field',
            state: {expanded: true},
        });
        expect(kind === 'select' ? control.choice?.popup : control.popup).toMatchObject({
            status: 'open',
            relation: 'aria-controls',
            referencedIds: ['address-popup'],
            rootNodeIds: ['popup'],
            options: [{nodeId: 'option', label: 'Ленина, 10'}],
        });
    });
}

test('a pass-through business layer preserves an explicit lower adapter label', () => {
    const innerAdapter: ControlAdapter = {
        id: 'inner-label',
        priority: 150,
        match: ({target, baseCandidate}) =>
            target.id === 'input' && baseCandidate
                ? {status: 'match', kind: baseCandidate.kind, label: 'Адрес компонента'}
                : null,
    };

    const outerAdapter: ControlAdapter = {
        id: 'address-field',
        priority: 200,
        match: ({ancestors, baseCandidate}) => {
            const address = ancestors.find((node) => 'data-address' in node.attributes);

            return address && baseCandidate?.kind === 'textbox'
                ? {status: 'match', kind: baseCandidate.kind, hostId: address.id}
                : null;
        },
    };

    const saved = snapshot(
        element('address', 'div', {'data-address': ''}, ['field']),
        element('field', 'tui-textfield', {}, ['input']),
        element('input', 'input', {tuiinput: ''}, [], {label: 'Подпись DOM'}),
    );

    const control = projectControls(saved, [
        taigaUiAdapter,
        innerAdapter,
        outerAdapter,
    ])[0];

    expect(control).toMatchObject({
        source: 'address-field',
        label: 'Адрес компонента',
        hostNodeId: 'address',
    });
});

for (const secondDecision of ['match', 'exclude'] as const) {
    test(`same-priority match and ${secondDecision} reject ambiguity in either registration order`, () => {
        const primary: ControlAdapter = {
            id: 'primary',
            priority: 50,
            match: () => ({status: 'match', kind: 'textbox'}),
        };

        const secondary: ControlAdapter = {
            id: 'secondary',
            priority: 50,
            match: () =>
                secondDecision === 'match'
                    ? {status: 'match', kind: 'number'}
                    : {status: 'exclude'},
        };

        const saved = snapshot(element('input', 'input'));

        expect(() => projectControls(saved, [primary, secondary])).toThrow(
            /Ambiguous control adapters for input: primary, secondary/,
        );
        expect(() => projectControls(saved, [secondary, primary])).toThrow(
            /Ambiguous control adapters for input: secondary, primary/,
        );
    });
}

test('null preserves native and adapter bases, while exclude does not restore native fallback', () => {
    const saved = snapshot(
        element('field', 'tui-textfield', {}, ['input']),
        element('input', 'input', {tuiinputnumber: ''}),
    );

    const transparent: ControlAdapter = {
        id: 'transparent',
        priority: 200,
        match: () => null,
    };

    const exclude: ControlAdapter = {
        id: 'excluded-number-editor',
        priority: 150,
        match: ({target}) => (target.id === 'input' ? {status: 'exclude'} : null),
    };

    expect(projectControls(saved, [transparent])).toEqual(projectControls(saved));
    expect(projectControls(saved, [taigaUiAdapter, transparent])).toEqual(
        projectControls(saved, [taigaUiAdapter]),
    );
    expect(projectControls(saved, [taigaUiAdapter, exclude, transparent])).toEqual([]);
    expect(projectControls(saved, [exclude, transparent])).toEqual([]);
});

test('repeated registration of the same adapter instance runs once; conflicting duplicate ids fail', () => {
    const saved = snapshot(element('input', 'input'));
    let calls = 0;
    const adapter: ControlAdapter = {
        id: 'one-editor',
        match: () => {
            calls++;

            return {status: 'match', kind: 'textbox'};
        },
    };

    const result = projectControls(saved, [adapter, adapter]);

    expect(calls).toBe(1);
    expect(result).toEqual([
        expect.objectContaining({source: 'one-editor', targetNodeId: 'input'}),
    ]);
    const conflicting = {...adapter};

    expect(() => projectControls(saved, [adapter, conflicting])).toThrow(
        'Duplicate control adapter ID: one-editor.',
    );
    expect(calls).toBe(1);
});

for (const hostId of ['missing', 'caption']) {
    test(`an adapter rejects a host reference to ${hostId} instead of inventing an element`, () => {
        const saved = snapshot(element('input', 'input'), text('caption', 'Подпись'));
        const adapter: ControlAdapter = {
            id: 'invalid-host',
            match: () => ({status: 'match', kind: 'textbox', hostId}),
        };

        expect(() => projectControls(saved, [adapter])).toThrow(
            'Invalid match returned by control adapter invalid-host.',
        );
    });
}

test('a JavaScript adapter returning an unsupported kind fails with its adapter id', () => {
    const saved = snapshot(element('input', 'input'));
    const adapter = {
        id: 'unsupported-kind',
        match: () => ({status: 'match', kind: 'slider'}),
    } as unknown as ControlAdapter;

    expect(() => projectControls(saved, [adapter])).toThrow(
        'Invalid match returned by control adapter unsupported-kind.',
    );
});

for (const [targetTestId, outerTestId, expectedTestId] of [
    [undefined, undefined, 'inner-field'],
    [undefined, 'business-field', 'business-field'],
    ['input-field', 'business-field', 'input-field'],
] as const) {
    test(`composition retains the most specific observed test id: ${expectedTestId}`, () => {
        const addressAdapter: ControlAdapter = {
            id: 'address-field',
            priority: 200,
            match: ({ancestors, baseCandidate}) => {
                const address = ancestors.find(
                    (node) => 'data-address' in node.attributes,
                );

                return address && baseCandidate?.kind === 'textbox'
                    ? {status: 'match', kind: baseCandidate.kind, hostId: address.id}
                    : null;
            },
        };

        const saved = snapshot(
            element(
                'address',
                'div',
                {
                    'data-address': '',
                    ...(outerTestId ? {'data-testid': outerTestId} : {}),
                },
                ['field'],
            ),
            element('field', 'tui-textfield', {'data-testid': 'inner-field'}, ['input']),
            element('input', 'input', {
                tuiinput: '',
                ...(targetTestId ? {'data-testid': targetTestId} : {}),
            }),
        );

        const control = projectControls(saved, [taigaUiAdapter, addressAdapter])[0];

        expect(control.source).toBe('address-field');
        expect(control.hostNodeId).toBe('address');
        expect(control.locatorHints.testId).toBe(expectedTestId);
    });
}
