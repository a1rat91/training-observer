/** Taiga UI DOM rules. No Angular instances or component private fields are read. */
import {
    type ControlAdapter,
    type ControlCandidate,
    normalizeText,
    type SnapshotReader,
} from '@training-observer/core/adapters';
import {
    type ControlKind,
    ControlType,
    type DomElementSnapshot,
    type DomNodeId,
} from '@training-observer/core/models';

import {
    isSelectLikeEditor,
    isTextValue,
    matchTaigaControl,
} from './taiga-ui-control-rules';
import {
    findTaigaField,
    hasDateField,
    hasTaigaAttribute,
    hasTaigaClass,
    hasTaigaHost,
    isTaigaField,
    TAIGA_ADAPTER_ID,
    TaigaAttribute,
    TaigaClass,
    TaigaFieldHost,
} from './taiga-ui-dom';

// One projection owns each candidate array; this cache retains no snapshot graph.
const fieldHostsByCandidates = new WeakMap<
    readonly ControlCandidate[],
    ReadonlySet<DomNodeId>
>();

/** DOM markers verified with Taiga UI 4.98. Native controls remain core fallbacks. */
export const taigaUiAdapter: ControlAdapter = {
    id: TAIGA_ADAPTER_ID,
    priority: 100,
    excludedSubtreeSelectors: ['tui-calendar', 'tui-scroll-controls'],
    match({target, ancestors, nativeKind}) {
        if (isLegacyDuplicate(target)) {
            return {status: 'exclude'};
        }

        const field = findTaigaField(ancestors);

        if (field && isFiller(target)) {
            return {status: 'exclude'};
        }

        const selectLike = isSelectLikeEditor(target, nativeKind);
        const native = selectLike ? null : nativeKind;
        const match = matchTaigaControl(target, field, native, ancestors);

        // A multi textfield needs its own adapter; select/combobox rules may still claim it.
        return isUnsupportedMultiField(field, match?.kind ?? native)
            ? {status: 'exclude'}
            : (match ?? (selectLike ? {status: 'exclude'} : null));
    },
    excludeCandidate({candidate, candidates}) {
        if (!isCleaner(candidate.target)) {
            return false;
        }

        const fieldHosts = taigaFieldHosts(candidates);

        // Only cleaners belonging to a recognized field are decoration.
        return candidate.ancestors.some((parent) => fieldHosts.has(parent.id));
    },
    resolveLabel({reader, candidate, members}) {
        if (!isTaigaField(candidate)) {
            return;
        }

        const labels = reader.labels.filter(
            (label) =>
                members.has(label.id) && hasTaigaAttribute(label, TaigaAttribute.Label),
        );

        const placeholders = reader.labels.filter(
            (label) =>
                members.has(label.id) && hasTaigaClass(label, TaigaClass.Placeholder),
        );

        // Legacy placeholder.for points to the excluded duplicate input.
        return uniqueLabel(reader, labels) ?? uniqueLabel(reader, placeholders);
    },
    resolveValue({reader, candidate, members}) {
        if (candidate.kind !== ControlType.Textbox || !isTaigaField(candidate)) {
            return;
        }

        if (hasTaigaHost(candidate.ancestors, TaigaFieldHost.MultiSelect)) {
            return selectedTags(reader, candidate, members);
        }

        if (hasDateField(candidate.ancestors)) {
            return dateValue(reader, members);
        }

        return;
    },
};

function uniqueLabel(
    reader: SnapshotReader,
    labels: readonly DomElementSnapshot[],
): string | undefined {
    const [label] = labels;

    return labels.length === 1 && label
        ? normalizeText(reader.text(label.id))
        : undefined;
}

function selectedTags(
    reader: SnapshotReader,
    candidate: ControlCandidate,
    members: ReadonlySet<DomNodeId>,
): readonly string[] | undefined {
    const tags = candidate.ancestors.find((node) => hasTaigaClass(node, TaigaClass.Tags));

    if (!tags) {
        return;
    }

    const labels: string[] = [];

    for (const id of members) {
        const node = reader.snapshot.nodes[id];

        if (
            node?.kind !== 'element' ||
            !hasTaigaClass(node, TaigaClass.TagText) ||
            !reader.ancestors(node).some((parent) => parent.id === tags.id)
        ) {
            continue;
        }

        const label = normalizeText(reader.text(id));

        if (label) {
            labels.push(label);
        }
    }

    return labels;
}

function dateValue(
    reader: SnapshotReader,
    members: ReadonlySet<DomNodeId>,
): string | undefined {
    for (const id of members) {
        const node = reader.snapshot.nodes[id];

        if (node?.kind === 'element' && hasTaigaClass(node, TaigaClass.Ghost)) {
            return normalizeText(reader.text(id));
        }
    }

    return;
}

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

function isLegacyDuplicate(node: DomElementSnapshot): boolean {
    return (
        hasTaigaAttribute(node, TaigaAttribute.LegacyTextfield) &&
        (node.tagName === 'input' || node.tagName === 'textarea')
    );
}

function isCleaner(node: DomElementSnapshot): boolean {
    return hasTaigaAttribute(node, TaigaAttribute.Cleaner) || isIconCleaner(node);
}

function isIconCleaner(node: DomElementSnapshot): boolean {
    return (
        node.tagName === 'button' &&
        hasTaigaAttribute(node, TaigaAttribute.IconButton) &&
        hasTaigaClass(node, TaigaClass.Clear)
    );
}

function isUnsupportedMultiField(
    field: DomElementSnapshot | undefined,
    kind: ControlKind | null,
): boolean {
    return !!field && hasTaigaAttribute(field, TaigaAttribute.Multi) && isTextValue(kind);
}

function isFiller(node: DomElementSnapshot): boolean {
    return (
        node.tagName === 'input' &&
        node.state.disabled &&
        node.attributes['aria-hidden'] === 'true' &&
        hasTaigaClass(node, TaigaClass.Filler)
    );
}
