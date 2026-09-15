/** Проекция выбора и popup из DOM-графа. Отображаемый текст не доказывает выбор объекта приложения. */
import {
    type ChoiceSnapshot,
    type DomElementSnapshot,
    type DomNodeId,
    type DomSnapshot,
    type PopupSnapshot,
} from '@training-observer/core/models';

/** Разрешает выбор только по явно наблюдаемым состояниям, без доступа к Angular-компонентам. */
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
    const inputValue = typeof target.state.value === 'string' ? target.state.value : '';
    const displayValue = native ? selectedLabels.join(', ') : inputValue;
    let selection: ChoiceSnapshot['selection'] = {status: 'unknown', labels: []};

    if (kind === 'select') {
        const displayedLabels = displayValue ? [displayValue] : [];

        selection = {
            status: 'observed',
            labels: native ? selectedLabels : displayedLabels,
        };
    } else if (selectedLabels.length) {
        selection = {status: 'observed', labels: selectedLabels};
    }

    return {displayValue, selection, popup};
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

    let roots: DomElementSnapshot[] = [];

    if (native) {
        roots = [target];
    } else if (expanded === true) {
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
            // HTML value доступен; скрытый Angular-объект или backend ID не восстанавливаем.
            value: node.attributes['value'],
            selected: node.state.selected ?? null,
            disabled: node.state.disabled || node.state.inert,
        }));

    const busyNodes = [...descendants].filter((node) => 'aria-busy' in node.attributes);
    let status: PopupSnapshot['status'] = 'unresolved';

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
    }

    const relation = referencedIds.length ? 'aria-controls' : 'missing';
    const busy = busyNodes.length
        ? busyNodes.some((node) => node.attributes['aria-busy'] === 'true')
        : null;

    return {
        status,
        relation: native ? 'native-options' : relation,
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
