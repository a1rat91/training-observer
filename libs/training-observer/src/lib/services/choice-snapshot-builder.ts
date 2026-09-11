import {type ChoiceSnapshot, type PopupSnapshot} from '../models/control-snapshot';
import {
    type DomElementSnapshot,
    type DomNodeId,
    type DomSnapshot,
} from '../models/dom-snapshot';

/** Resolve a portal only from explicit DOM evidence. No live DOM, Angular values or focus guesses. */
export function buildChoiceSnapshot(
    snapshot: DomSnapshot,
    target: DomElementSnapshot,
    host: DomElementSnapshot,
    kind: 'combobox' | 'select',
): ChoiceSnapshot {
    const popup = buildPopupSnapshot(snapshot, target, host);
    const selectedLabels = popup.options
        .filter((option) => option.selected === true)
        .map((option) => option.label);

    const native = target.tagName === 'select';
    let displayValue = '';

    if (native) {
        displayValue = selectedLabels.join(', ');
    } else if (typeof target.state.value === 'string') {
        displayValue = target.state.value;
    }

    let selection: ChoiceSnapshot['selection'];

    if (kind === 'select') {
        let labels = selectedLabels;

        if (!native) {
            labels = displayValue ? [displayValue] : [];
        }

        selection = {status: 'observed', labels};
    } else if (selectedLabels.length) {
        selection = {status: 'observed', labels: selectedLabels};
    } else {
        selection = {status: 'unknown', labels: []};
    }

    return {
        displayValue,
        selection,
        popup,
    };
}

export function buildPopupSnapshot(
    snapshot: DomSnapshot,
    target: DomElementSnapshot,
    host: DomElementSnapshot,
): PopupSnapshot {
    const native = target.tagName === 'select';
    const expanded = target.state.expanded ?? host.state.expanded;
    const referencedIds = [
        ...new Set(
            (target.attributes['aria-controls'] ?? host.attributes['aria-controls'] ?? '')
                .trim()
                .split(/\s+/)
                .filter(Boolean),
        ),
    ];

    const elements = Object.values(snapshot.nodes).filter(
        (node): node is DomElementSnapshot => node.kind === 'element',
    );

    let roots = [target];

    if (!native && expanded === true) {
        roots = referencedIds.flatMap((id) => {
            const matches = elements.filter((node) => node.attributes['id'] === id);

            return matches.length === 1 ? matches : [];
        });
    }

    const descendants = new Set<DomElementSnapshot>();
    const text = (id: DomNodeId): string => {
        const node = snapshot.nodes[id];

        if (node?.kind === 'text') {
            return node.text;
        }

        return node?.kind === 'element' ? node.children.map(text).join(' ') : '';
    };

    const visit = (node: DomElementSnapshot): void => {
        if (descendants.has(node)) {
            return;
        }

        descendants.add(node);
        node.children.forEach((id) => {
            const child = snapshot.nodes[id];

            if (child?.kind === 'element') {
                visit(child);
            }
        });
    };

    roots.forEach(visit);
    const options = [...descendants]
        .filter(
            (node) => node.tagName === 'option' || node.attributes['role'] === 'option',
        )
        .map((node) => ({
            nodeId: node.id,
            label: node.label || text(node.id).replaceAll(/\s+/g, ' ').trim(),
            // Angular [value] need not be an HTML attribute: don't use ng-reflect or invent a key.
            value: node.attributes['value'],
            selected: node.state.selected ?? null,
            disabled: node.state.disabled || node.state.inert,
        }));

    const busyNodes = [...descendants].filter((node) => 'aria-busy' in node.attributes);
    let status: PopupSnapshot['status'];

    if (native) {
        status = 'native';
    } else if (expanded === false) {
        status = 'closed';
    } else if (
        expanded === true &&
        roots.length > 0 &&
        roots.length === referencedIds.length
    ) {
        status = 'open';
    } else {
        status = 'unresolved';
    }

    let relation: PopupSnapshot['relation'];

    if (native) {
        relation = 'native-options';
    } else if (referencedIds.length) {
        relation = 'aria-controls';
    } else {
        relation = 'missing';
    }

    let busy: boolean | null = null;

    if (busyNodes.some((node) => node.attributes['aria-busy'] === 'true')) {
        busy = true;
    } else if (busyNodes.length) {
        busy = false;
    }

    return {
        status,
        relation,
        referencedIds,
        rootNodeIds: roots.map((root) => root.id),
        busy,
        text: roots
            .map((root) => text(root.id))
            .join(' ')
            .replaceAll(/\s+/g, ' ')
            .trim(),
        options,
    };
}
