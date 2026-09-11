import {type ControlKind, type ControlSnapshot} from '../models/control-snapshot';
import {type DomElementSnapshot, type DomNodeId} from '../models/dom-snapshot';
import {normalizeText, type SnapshotReader} from './snapshot-reader';

interface ControlMatch {
    readonly kind: ControlKind;
    readonly source: ControlSnapshot['source'];
    readonly host: DomElementSnapshot;
}

export interface ControlCandidate extends ControlMatch {
    readonly target: DomElementSnapshot;
    readonly ancestors: readonly DomElementSnapshot[];
}

const TAIGA_FIELD_KINDS: readonly ControlKind[] = [
    'textbox',
    'number',
    'select',
    'combobox',
];

/** Taiga rules take precedence over native fallback, including intentional exclusions. */
export function findControlCandidates(
    reader: SnapshotReader,
): readonly ControlCandidate[] {
    const candidates: ControlCandidate[] = [];

    for (const target of reader.elements) {
        const ancestors = reader.ancestors(target);
        const field = ancestors.find((parent) => parent.tagName === 'tui-textfield');

        // Option contents describe selection, not independent controls.
        if (
            ancestors.some((parent) => parent.attributes['role'] === 'option') ||
            (field && isTaigaFiller(target))
        ) {
            continue;
        }

        let native = nativeKind(target);

        // Select-like editors must not fall back to an ordinary textbox.
        if (native === 'textbox' && 'tuiselectlike' in target.attributes) {
            native = null;
        }

        const match =
            matchTaigaControl(target, field, native) ??
            (native ? {kind: native, source: 'native' as const, host: target} : null);

        if (!match) {
            continue;
        }

        // Multi-value textfields still require a separate adapter.
        if (
            field &&
            'multi' in field.attributes &&
            (match.kind === 'textbox' || match.kind === 'number')
        ) {
            continue;
        }

        candidates.push({...match, target, ancestors});
    }

    const fieldHosts = new Set(
        candidates.filter(isTaigaField).map((candidate) => candidate.host.id),
    );

    // Only known cleaners of supported fields are folded; independent buttons remain controls.
    return candidates.filter(
        ({target, ancestors}) =>
            !('tuibuttonx' in target.attributes) ||
            !ancestors.some((parent) => fieldHosts.has(parent.id)),
    );
}

export function taigaFloatingLabel(
    reader: SnapshotReader,
    control: ControlCandidate,
    members: ReadonlySet<DomNodeId>,
): string {
    if (!isTaigaField(control)) {
        return '';
    }

    const labels = reader.labels.filter(
        (label) => members.has(label.id) && 'tuilabel' in label.attributes,
    );

    // Never guess among several unassociated floating labels.
    const label = labels[0];

    return labels.length === 1 && label ? normalizeText(reader.text(label.id)) : '';
}

export function hasTaigaInputPopup(control: ControlCandidate): boolean {
    return (
        control.source === 'taiga-ui' &&
        (control.kind === 'textbox' || control.kind === 'number') &&
        control.target.attributes['role'] === 'combobox'
    );
}

function isTaigaField(control: ControlMatch): boolean {
    return control.source === 'taiga-ui' && TAIGA_FIELD_KINDS.includes(control.kind);
}

function isTaigaFiller(node: DomElementSnapshot): boolean {
    return (
        node.tagName === 'input' &&
        node.state.disabled &&
        node.attributes['aria-hidden'] === 'true' &&
        (node.attributes['class'] ?? '').split(/\s+/).includes('t-filler')
    );
}

function nativeKind(node: DomElementSnapshot): ControlKind | null {
    const type = (node.attributes['type'] ?? 'text').toLowerCase();
    const role = node.attributes['role'];

    if (node.tagName === 'select') {
        return 'select';
    }

    if (
        node.tagName === 'button' ||
        (node.tagName === 'input' && ['button', 'reset', 'submit'].includes(type))
    ) {
        return !role || role === 'button' ? 'button' : null;
    }

    if (node.tagName === 'input' && type === 'checkbox') {
        if (role === 'switch' || (!role && 'switch' in node.attributes)) {
            return 'switch';
        }

        return !role || role === 'checkbox' ? 'checkbox' : null;
    }

    if (node.tagName === 'input' && type === 'radio') {
        return !role || role === 'radio' ? 'radio' : null;
    }

    if (node.tagName === 'input' && type === 'number') {
        return !role || role === 'spinbutton' ? 'number' : null;
    }

    const textInput =
        node.tagName === 'input' &&
        ['email', 'password', 'search', 'tel', 'text', 'url'].includes(type);

    return (node.tagName === 'textarea' || textInput) &&
        (!role || role === 'textbox' || role === 'searchbox')
        ? 'textbox'
        : null;
}

/** DOM signatures verified against Taiga UI 5.15. No Angular instances/private fields. */
function matchTaigaControl(
    node: DomElementSnapshot,
    field: DomElementSnapshot | undefined,
    native: ControlKind | null,
): ControlMatch | null {
    const attributes = node.attributes;

    if (
        (node.tagName === 'input' || node.tagName === 'select') &&
        'tuiselect' in attributes
    ) {
        return {kind: 'select', source: 'taiga-ui', host: field ?? node};
    }

    if (node.tagName === 'input' && 'tuicombobox' in attributes) {
        return {kind: 'combobox', source: 'taiga-ui', host: field ?? node};
    }

    // inputmode alone cannot distinguish numbers from phone/account identifiers.
    if (
        node.tagName === 'input' &&
        'tuiinputnumber' in attributes &&
        ['number', 'text'].includes((attributes['type'] ?? 'text').toLowerCase()) &&
        (!attributes['role'] ||
            ['combobox', 'spinbutton', 'textbox'].includes(attributes['role']))
    ) {
        return {kind: 'number', source: 'taiga-ui', host: field ?? node};
    }

    // Generic dropdown content does not imply selection semantics.
    if (
        node.tagName === 'input' &&
        'tuiinput' in attributes &&
        attributes['role'] === 'combobox' &&
        !('tuiselectlike' in attributes)
    ) {
        return {kind: 'textbox', source: 'taiga-ui', host: field ?? node};
    }

    if (
        native === 'textbox' &&
        (field || 'tuiinput' in attributes || 'tuitextfield' in attributes)
    ) {
        return {kind: native, source: 'taiga-ui', host: field ?? node};
    }

    return (native === 'button' &&
        ('tuibutton' in attributes || 'tuiiconbutton' in attributes)) ||
        (native === 'checkbox' && 'tuicheckbox' in attributes) ||
        (native === 'radio' && 'tuiradio' in attributes) ||
        (native === 'switch' && 'tuiswitch' in attributes)
        ? {kind: native, source: 'taiga-ui', host: node}
        : null;
}
