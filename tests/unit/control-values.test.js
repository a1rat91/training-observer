import {expect, test} from '@jest/globals';
import {ControlType} from '@training-observer/core/models';

import {isControlValue} from '../../libs/training-contracts/src/lib/validation';

test.each(['', 'plain text', [], ['A; B', ' Second ', '']].map((value) => [value]))(
    'textbox values accept strings and exact ordered string arrays: %j',
    (value) => {
        expect(isControlValue(value, ControlType.Textbox)).toBe(true);
    },
);

test.each([['1'], [], false, null, 42].map((value) => [value]))(
    'number values reject non-string values: %j',
    (value) => {
        expect(isControlValue(value, ControlType.Number)).toBe(false);
    },
);

test.each(
    [[1], [null], [['nested']], ['A', undefined], new Array(1)].map((value) => [value]),
)('text and choice arrays reject mixed, nested and sparse values: %j', (value) => {
    expect(isControlValue(value, ControlType.Textbox)).toBe(false);
    expect(isControlValue(value, ControlType.Select)).toBe(false);
    expect(isControlValue(value, ControlType.ComboBox)).toBe(false);
});
