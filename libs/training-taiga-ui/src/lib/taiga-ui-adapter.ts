/** Taiga UI DOM rules. No Angular instances or component private fields are read. */
import {
    type ControlAdapter,
    type ControlAdapterResult,
    type ControlCandidate,
    normalizeText,
} from '@training-observer/core/adapters';
import {
    type ControlKind,
    type DomElementSnapshot,
    type DomNodeId,
} from '@training-observer/core/models';

const TAIGA_FIELD_KINDS: readonly ControlKind[] = [
    'textbox',
    'number',
    'select',
    'combobox',
];

// Each projection owns its candidate array; the weak key retains no snapshot graph.
const fieldHostsByCandidates = new WeakMap<
    readonly ControlCandidate[],
    ReadonlySet<DomNodeId>
>();

/** DOM markers verified with Taiga UI 4.98. Native controls remain core fallbacks. */
export const taigaUiAdapter: ControlAdapter = {
    id: 'taiga-ui',
    priority: 100,
    excludedSubtreeSelectors: ['tui-scroll-controls'],
    match({target, ancestors, nativeKind}) {
        const field = ancestors.find((parent) => parent.tagName === 'tui-textfield');

        if (field && isTaigaFiller(target)) {
            return {status: 'exclude'};
        }

        // Select editors must not fall back to ordinary textboxes.
        const native =
            nativeKind === 'textbox' && 'tuiselectlike' in target.attributes
                ? null
                : nativeKind;

        const match = matchTaigaControl(target, field, native);
        const kind = match?.kind ?? native;

        // Multi-value fields need a dedicated adapter.
        if (
            field &&
            'multi' in field.attributes &&
            (kind === 'textbox' || kind === 'number')
        ) {
            return {status: 'exclude'};
        }

        if (match) {
            return match;
        }

        return nativeKind === 'textbox' && 'tuiselectlike' in target.attributes
            ? {status: 'exclude'}
            : null;
    },
    excludeCandidate({candidate, candidates}) {
        if (!isTaigaCleaner(candidate.target)) {
            return false;
        }

        const fieldHosts = taigaFieldHosts(candidates);

        // Only known clear buttons inside supported fields join those fields.
        return candidate.ancestors.some((parent) => fieldHosts.has(parent.id));
    },
    resolveLabel({reader, candidate, members}) {
        if (!isTaigaField(candidate)) {
            return;
        }

        const labels = reader.labels.filter(
            (label) => members.has(label.id) && 'tuilabel' in label.attributes,
        );

        // Do not choose between unrelated floating labels.
        return labels.length === 1 && labels[0]
            ? normalizeText(reader.text(labels[0].id))
            : undefined;
    },
};

function taigaFieldHosts(
    candidates: readonly ControlCandidate[],
): ReadonlySet<DomNodeId> {
    const existing = fieldHostsByCandidates.get(candidates);

    if (existing) {
        return existing;
    }

    const fieldHosts = new Set<DomNodeId>();

    for (const control of candidates) {
        let layer: ControlCandidate | undefined = control;

        while (layer) {
            if (isTaigaField(layer)) {
                fieldHosts.add(layer.host.id);
            }

            layer = layer.base;
        }
    }

    fieldHostsByCandidates.set(candidates, fieldHosts);

    return fieldHosts;
}

function isTaigaField(candidate: ControlCandidate): boolean {
    return candidate.source === 'taiga-ui' && TAIGA_FIELD_KINDS.includes(candidate.kind);
}

/** v4 clear buttons require a supported textfield plus these DOM markers. */
function isTaigaCleaner(node: DomElementSnapshot): boolean {
    return (
        'tuibuttonx' in node.attributes ||
        (node.tagName === 'button' &&
            'tuiiconbutton' in node.attributes &&
            (node.attributes['class'] ?? '').split(/\s+/).includes('t-clear'))
    );
}

function isTaigaFiller(node: DomElementSnapshot): boolean {
    return (
        node.tagName === 'input' &&
        node.state.disabled &&
        node.attributes['aria-hidden'] === 'true' &&
        (node.attributes['class'] ?? '').split(/\s+/).includes('t-filler')
    );
}

function matchTaigaControl(
    node: DomElementSnapshot,
    field: DomElementSnapshot | undefined,
    native: ControlKind | null,
): Extract<ControlAdapterResult, {status: 'match'}> | null {
    const attributes = node.attributes;
    let kind: ControlKind | undefined;

    if (
        (node.tagName === 'input' || node.tagName === 'select') &&
        'tuiselect' in attributes
    ) {
        kind = 'select';
    } else if (node.tagName === 'input' && 'tuicombobox' in attributes) {
        kind = 'combobox';
    } else if (
        node.tagName === 'input' &&
        'tuiinputnumber' in attributes &&
        ['number', 'text'].includes((attributes['type'] ?? 'text').toLowerCase()) &&
        (!attributes['role'] ||
            ['combobox', 'spinbutton', 'textbox'].includes(attributes['role']))
    ) {
        // Inputmode alone cannot distinguish numbers from phones or account IDs.
        kind = 'number';
    } else if (
        node.tagName === 'input' &&
        ('tuiinput' in attributes ||
            'tuitextfield' in attributes ||
            'tuidropdowna11y' in attributes ||
            'tuidropdownrole' in attributes) &&
        attributes['role'] === 'combobox' &&
        !('tuiselectlike' in attributes)
    ) {
        // A generic dropdown does not imply selection semantics.
        kind = 'textbox';
    } else if (
        native === 'textbox' &&
        (field || 'tuiinput' in attributes || 'tuitextfield' in attributes)
    ) {
        kind = native;
    }

    if (kind) {
        return {
            status: 'match',
            kind,
            hostId: (field ?? node).id,
            popup:
                (kind === 'textbox' || kind === 'number') &&
                attributes['role'] === 'combobox',
        };
    }

    return (native === 'button' &&
        ('tuibutton' in attributes || 'tuiiconbutton' in attributes)) ||
        (native === 'checkbox' && 'tuicheckbox' in attributes) ||
        (native === 'radio' && 'tuiradio' in attributes) ||
        (native === 'switch' && 'tuiswitch' in attributes)
        ? {status: 'match', kind: native, hostId: node.id}
        : null;
}
