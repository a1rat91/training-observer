import {type ControlCandidate} from '@training-observer/core/adapters';
import {
    type ControlKind,
    ControlType,
    type DomElementSnapshot,
} from '@training-observer/core/models';

export const TAIGA_ADAPTER_ID = 'taiga-ui';

/** DOM vocabulary shared by recognition, labels, values and decoration rules. */
export enum TaigaAttribute {
    Button = 'tuibutton',
    Checkbox = 'tuicheckbox',
    Cleaner = 'tuibuttonx',
    ComboBox = 'tuicombobox',
    DropdownA11y = 'tuidropdowna11y',
    DropdownRole = 'tuidropdownrole',
    IconButton = 'tuiiconbutton',
    Input = 'tuiinput',
    InputNumber = 'tuiinputnumber',
    Label = 'tuilabel',
    LegacyTextfield = 'tuitextfieldlegacy',
    Multi = 'multi',
    Radio = 'tuiradio',
    Select = 'tuiselect',
    SelectLike = 'tuiselectlike',
    Switch = 'tuiswitch',
    Textfield = 'tuitextfield',
}

export enum TaigaClass {
    Clear = 't-clear',
    Filler = 't-filler',
    Ghost = 't-ghost',
    Placeholder = 't-placeholder',
    Tags = 't-tags',
    TagText = 't-text',
}

export enum TaigaFieldHost {
    ComboBox = 'tui-combo-box',
    Input = 'tui-input',
    InputDate = 'tui-input-date',
    InputDateRange = 'tui-input-date-range',
    InputDateTime = 'tui-input-date-time',
    InputMonth = 'tui-input-month',
    InputMonthRange = 'tui-input-month-range',
    InputNumber = 'tui-input-number',
    InputTag = 'tui-input-tag',
    InputTime = 'tui-input-time',
    InputTimeRange = 'tui-input-time-range',
    MultiSelect = 'tui-multi-select',
    PrimitiveTextfield = 'tui-primitive-textfield',
    Select = 'tui-select',
    Textarea = 'tui-textarea',
    Textfield = 'tui-textfield',
}

const FIELD_HOSTS = new Set<string>(Object.values(TaigaFieldHost));
const DATE_FIELD_HOSTS = new Set<string>([
    TaigaFieldHost.InputDate,
    TaigaFieldHost.InputDateRange,
    TaigaFieldHost.InputDateTime,
    TaigaFieldHost.InputMonth,
    TaigaFieldHost.InputMonthRange,
    TaigaFieldHost.InputTime,
    TaigaFieldHost.InputTimeRange,
]);

const FIELD_KINDS = new Set<ControlKind>([
    ControlType.ComboBox,
    ControlType.Number,
    ControlType.Select,
    ControlType.Textbox,
]);

export function findTaigaField(
    ancestors: readonly DomElementSnapshot[],
): DomElementSnapshot | undefined {
    return ancestors.find((node) => FIELD_HOSTS.has(node.tagName));
}

export function hasTaigaHost(
    ancestors: readonly DomElementSnapshot[],
    host: TaigaFieldHost,
): boolean {
    return ancestors.some((node) => node.tagName === host);
}

export function hasDateField(ancestors: readonly DomElementSnapshot[]): boolean {
    return ancestors.some((node) => DATE_FIELD_HOSTS.has(node.tagName));
}

export function hasTaigaAttribute(
    node: DomElementSnapshot,
    attribute: TaigaAttribute,
): boolean {
    return attribute in node.attributes;
}

export function hasTaigaClass(node: DomElementSnapshot, name: TaigaClass): boolean {
    return (node.attributes['class'] ?? '').split(/\s+/).includes(name);
}

export function isTaigaField(candidate: ControlCandidate): boolean {
    return candidate.source === TAIGA_ADAPTER_ID && FIELD_KINDS.has(candidate.kind);
}
