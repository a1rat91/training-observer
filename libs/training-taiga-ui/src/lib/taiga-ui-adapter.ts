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

/** Хосты текстовых полей Taiga; нативный input лежит внутри них. */
const TAIGA_FIELD_HOSTS = new Set([
    'tui-combo-box',
    'tui-input',
    'tui-input-date',
    'tui-input-date-range',
    'tui-input-date-time',
    'tui-input-month',
    'tui-input-month-range',
    'tui-input-number',
    'tui-input-tag',
    'tui-input-time',
    'tui-input-time-range',
    'tui-multi-select',
    'tui-primitive-textfield',
    'tui-select',
    'tui-textarea',
    'tui-textfield',
]);

/** Даты/время: нативный input пуст, значение отображается в .t-ghost. */
const TAIGA_DATE_FIELD_HOSTS = new Set([
    'tui-input-date',
    'tui-input-date-range',
    'tui-input-date-time',
    'tui-input-month',
    'tui-input-month-range',
    'tui-input-time',
    'tui-input-time-range',
]);

// Each projection owns its candidate array; the weak key retains no snapshot graph.
const fieldHostsByCandidates = new WeakMap<
    readonly ControlCandidate[],
    ReadonlySet<DomNodeId>
>();

/** DOM markers verified with Taiga UI 4.98. Native controls remain core fallbacks. */
export const taigaUiAdapter: ControlAdapter = {
    id: 'taiga-ui',
    priority: 100,
    excludedSubtreeSelectors: ['tui-calendar', 'tui-scroll-controls'],
    match({target, ancestors, nativeKind}) {
        // Taiga рендерит legacy-дубликат рядом с нативным полем — это один логический контрол.
        if (
            'tuitextfieldlegacy' in target.attributes &&
            (target.tagName === 'input' || target.tagName === 'textarea')
        ) {
            return {status: 'exclude'};
        }

        const field = ancestors.find((parent) => TAIGA_FIELD_HOSTS.has(parent.tagName));

        if (field && isTaigaFiller(target)) {
            return {status: 'exclude'};
        }

        // Select editors must not fall back to ordinary textboxes.
        const native =
            nativeKind === 'textbox' && 'tuiselectlike' in target.attributes
                ? null
                : nativeKind;

        const match = matchTaigaControl(target, field, native, ancestors);
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
        if (labels.length === 1 && labels[0]) {
            return normalizeText(reader.text(labels[0].id));
        }

        // Без tuilabel меткой поля выступает плейсхолдер (t-placeholder): его for-связь
        // указывает на исключённый legacy-инпут, а не на нативный, поэтому generic-анализатор его не видит.
        const placeholders = reader.labels.filter(
            (label) =>
                members.has(label.id) &&
                (label.attributes['class'] ?? '').split(/\s+/).includes('t-placeholder'),
        );

        return placeholders.length === 1 && placeholders[0]
            ? normalizeText(reader.text(placeholders[0].id))
            : undefined;
    },
    resolveValue({reader, candidate, members}) {
        if (candidate.kind !== 'textbox' || !isTaigaField(candidate)) {
            return;
        }

        if (candidate.ancestors.some((parent) => parent.tagName === 'tui-multi-select')) {
            // Выбранные элементы живут в тегах .t-tags .t-text, а не в нативном input.
            const tagIds = [...members].filter((id) => {
                const node = reader.snapshot.nodes[id];

                return (
                    node?.kind === 'element' &&
                    (node.attributes['class'] ?? '').split(/\s+/).includes('t-text')
                );
            });

            if (!tagIds.length) {
                return;
            }

            return tagIds
                .map((id) => normalizeText(reader.text(id)))
                .filter(Boolean)
                .join(', ');
        }

        if (
            candidate.ancestors.some((parent) =>
                TAIGA_DATE_FIELD_HOSTS.has(parent.tagName),
            )
        ) {
            // Даты/время: нативный input пуст, значение отображается в .t-ghost.
            const ghostId = [...members].find((id) => {
                const node = reader.snapshot.nodes[id];

                return (
                    node?.kind === 'element' &&
                    (node.attributes['class'] ?? '').split(/\s+/).includes('t-ghost')
                );
            });

            return ghostId ? normalizeText(reader.text(ghostId)) : undefined;
        }

        return;
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
    ancestors: readonly DomElementSnapshot[],
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
        node.tagName === 'input' &&
        attributes['role'] === 'combobox' &&
        ancestors.some(
            (parent) =>
                parent.tagName === 'tui-multi-select' ||
                parent.tagName === 'tui-input-tag' ||
                TAIGA_DATE_FIELD_HOSTS.has(parent.tagName),
        )
    ) {
        // Multi-select: значение в тегах; даты/время: значение в .t-ghost, нативный input пуст.
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
