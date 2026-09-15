/** @jest-environment jsdom */
import {beforeEach, expect, test} from '@jest/globals';
import {DomObservationScope} from '../../libs/training-observer/src/lib/observation/dom-observation-scope';

beforeEach(() => {
    document.body.innerHTML =
        '<section id="target"><input id="owned"><div id="nested"><input id="nested-input"></div></section><input id="outside">';
});

test('an ordinary unmarked root observes its own input and ignores a neighbouring form', () => {
    const scope = new DomObservationScope(document.getElementById('target'), '', '');
    scope.update({nodes: {}});
    expect(scope.acceptsEvent(document.getElementById('owned'), 'input')).toBe(true);
    expect(scope.acceptsEvent(document.getElementById('outside'), 'input')).toBe(false);
});

test('custom nested boundaries exclude their controls and removing the boundary invalidates the parent', () => {
    const root = document.getElementById('target');
    const nested = document.getElementById('nested');
    nested.classList.add('widget');
    const scope = new DomObservationScope(root, '', '.widget');
    scope.update({nodes: {}});
    expect(scope.acceptsEvent(document.getElementById('owned'), 'input')).toBe(true);
    expect(scope.acceptsEvent(document.getElementById('nested-input'), 'input')).toBe(
        false,
    );
    nested.classList.remove('widget');
    expect(
        scope.acceptsMutation({
            type: 'attributes',
            target: nested,
            attributeName: 'class',
        }),
    ).toBe(true);
    scope.update({nodes: {}});
    expect(scope.acceptsEvent(document.getElementById('nested-input'), 'input')).toBe(
        true,
    );
});

test('adding a custom boundary to existing content invalidates its enclosing area', () => {
    const nested = document.getElementById('nested');
    const scope = new DomObservationScope(
        document.getElementById('target'),
        '',
        '.widget',
    );
    scope.update({nodes: {}});
    nested.classList.add('widget');
    expect(
        scope.acceptsMutation({
            type: 'attributes',
            target: nested,
            attributeName: 'class',
        }),
    ).toBe(true);
    expect(scope.acceptsEvent(document.getElementById('nested-input'), 'input')).toBe(
        false,
    );
});
