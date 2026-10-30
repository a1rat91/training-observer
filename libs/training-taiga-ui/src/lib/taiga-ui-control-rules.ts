import {type ControlAdapterResult} from '@training-observer/core/adapters';
import {
    type ControlKind,
    ControlType,
    type DomElementSnapshot,
} from '@training-observer/core/models';

import {
    hasDateField,
    hasTaigaAttribute,
    hasTaigaHost,
    TaigaAttribute,
    TaigaFieldHost,
} from './taiga-ui-dom';

type ControlMatch = Extract<ControlAdapterResult, {status: 'match'}>;

const NUMBER_INPUT_TYPES = new Set(['number', 'text']);
const NUMBER_INPUT_ROLES = new Set<string>([
    ControlType.ComboBox,
    ControlType.Textbox,
    'spinbutton',
]);

const GENERIC_DROPDOWN_ATTRIBUTES = [
    TaigaAttribute.Input,
    TaigaAttribute.Textfield,
    TaigaAttribute.DropdownA11y,
    TaigaAttribute.DropdownRole,
];

export function matchTaigaControl(
    node: DomElementSnapshot,
    field: DomElementSnapshot | undefined,
    native: ControlKind | null,
    ancestors: readonly DomElementSnapshot[],
): ControlMatch | null {
    const kind = fieldKind(node, field, native, ancestors);

    if (kind) {
        return {
            status: 'match',
            kind,
            hostId: (field ?? node).id,
            popup: isTextValue(kind) && node.attributes['role'] === ControlType.ComboBox,
        };
    }

    return native && matchesNativeMarker(node, native)
        ? {status: 'match', kind: native, hostId: node.id}
        : null;
}

/** Explicit markers win; a generic dropdown remains a text editor before host fallbacks. */
function fieldKind(
    node: DomElementSnapshot,
    field: DomElementSnapshot | undefined,
    native: ControlKind | null,
    ancestors: readonly DomElementSnapshot[],
): ControlKind | null {
    if (isSelect(node)) {
        return ControlType.Select;
    }

    if (isMarkedInput(node, TaigaAttribute.ComboBox)) {
        return ControlType.ComboBox;
    }

    if (isNumber(node)) {
        return ControlType.Number;
    }

    if (isGenericDropdown(node)) {
        return ControlType.Textbox;
    }

    if (isLegacyComboBox(node, ancestors)) {
        return ControlType.ComboBox;
    }

    if (isCompositeEditor(node, ancestors)) {
        return ControlType.Textbox;
    }

    return native === ControlType.Textbox && (field || hasTextfieldMarker(node))
        ? ControlType.Textbox
        : null;
}

export function isTextValue(kind: ControlKind | null): boolean {
    return kind === ControlType.Textbox || kind === ControlType.Number;
}

export function isSelectLikeEditor(
    node: DomElementSnapshot,
    native: ControlKind | null,
): boolean {
    return (
        native === ControlType.Textbox &&
        hasTaigaAttribute(node, TaigaAttribute.SelectLike)
    );
}

function isSelect(node: DomElementSnapshot): boolean {
    return (
        (node.tagName === 'input' || node.tagName === 'select') &&
        hasTaigaAttribute(node, TaigaAttribute.Select)
    );
}

function isMarkedInput(node: DomElementSnapshot, marker: TaigaAttribute): boolean {
    return node.tagName === 'input' && hasTaigaAttribute(node, marker);
}

function isNumber(node: DomElementSnapshot): boolean {
    const type = (node.attributes['type'] ?? 'text').toLowerCase();
    const role = node.attributes['role'];

    return (
        isMarkedInput(node, TaigaAttribute.InputNumber) &&
        NUMBER_INPUT_TYPES.has(type) &&
        (!role || NUMBER_INPUT_ROLES.has(role))
    );
}

function isComboBoxInput(node: DomElementSnapshot): boolean {
    return node.tagName === 'input' && node.attributes['role'] === ControlType.ComboBox;
}

function isGenericDropdown(node: DomElementSnapshot): boolean {
    return (
        isComboBoxInput(node) &&
        GENERIC_DROPDOWN_ATTRIBUTES.some((marker) => hasTaigaAttribute(node, marker)) &&
        !hasTaigaAttribute(node, TaigaAttribute.SelectLike)
    );
}

function isLegacyComboBox(
    node: DomElementSnapshot,
    ancestors: readonly DomElementSnapshot[],
): boolean {
    return isComboBoxInput(node) && hasTaigaHost(ancestors, TaigaFieldHost.ComboBox);
}

function isCompositeEditor(
    node: DomElementSnapshot,
    ancestors: readonly DomElementSnapshot[],
): boolean {
    return (
        isComboBoxInput(node) &&
        (hasTaigaHost(ancestors, TaigaFieldHost.MultiSelect) ||
            hasTaigaHost(ancestors, TaigaFieldHost.InputTag) ||
            hasDateField(ancestors))
    );
}

function hasTextfieldMarker(node: DomElementSnapshot): boolean {
    return (
        hasTaigaAttribute(node, TaigaAttribute.Input) ||
        hasTaigaAttribute(node, TaigaAttribute.Textfield)
    );
}

function matchesNativeMarker(node: DomElementSnapshot, native: ControlKind): boolean {
    switch (native) {
        case ControlType.Button:
            return (
                hasTaigaAttribute(node, TaigaAttribute.Button) ||
                hasTaigaAttribute(node, TaigaAttribute.IconButton)
            );
        case ControlType.Checkbox:
            return hasTaigaAttribute(node, TaigaAttribute.Checkbox);
        case ControlType.Radio:
            return hasTaigaAttribute(node, TaigaAttribute.Radio);
        case ControlType.Switch:
            return hasTaigaAttribute(node, TaigaAttribute.Switch);
        default:
            return false;
    }
}
