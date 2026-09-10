import {type ChoiceSnapshot, type PopupSnapshot} from '../models/control-snapshot';
import {type DomElementSnapshot, type DomNodeId, type DomSnapshot} from '../models/dom-snapshot';

/** Resolve a portal only from explicit DOM evidence. No live DOM, Angular values or focus guesses. */
export function buildChoiceSnapshot(snapshot: DomSnapshot, target: DomElementSnapshot,
    host: DomElementSnapshot, kind: 'select' | 'combobox'): ChoiceSnapshot {
    const popup = buildPopupSnapshot(snapshot, target, host);
    const selectedLabels = popup.options.filter((option) => option.selected === true).map((option) => option.label);
    const native = target.tagName === 'select';
    const displayValue = native ? selectedLabels.join(', ') : typeof target.state.value === 'string' ? target.state.value : '';

    return {
        displayValue,
        selection: kind === 'select' ? {status: 'observed', labels: native ? selectedLabels : displayValue ? [displayValue] : []} :
            selectedLabels.length ? {status: 'observed', labels: selectedLabels} : {status: 'unknown', labels: []},
        popup,
    };
}

export function buildPopupSnapshot(snapshot: DomSnapshot, target: DomElementSnapshot,
    host: DomElementSnapshot): PopupSnapshot {
    const native = target.tagName === 'select';
    const expanded = target.state.expanded ?? host.state.expanded;
    const referencedIds = [...new Set((target.attributes['aria-controls'] ?? host.attributes['aria-controls'] ?? '').trim().split(/\s+/).filter(Boolean))];
    const elements = Object.values(snapshot.nodes).filter((node): node is DomElementSnapshot => node.kind === 'element');
    const roots = native ? [target] : expanded === true ? referencedIds.flatMap((id) => {
        const matches = elements.filter((node) => node.attributes['id'] === id);
        return matches.length === 1 ? matches : [];
    }) : [];
    const descendants = new Set<DomElementSnapshot>();
    const text = (id: DomNodeId): string => {
        const node = snapshot.nodes[id];
        return node?.kind === 'text' ? node.text : node?.kind === 'element' ? node.children.map(text).join(' ') : '';
    };
    const visit = (node: DomElementSnapshot): void => {
        if (descendants.has(node)) return;
        descendants.add(node);
        node.children.forEach((id) => {
            const child = snapshot.nodes[id];
            if (child?.kind === 'element') visit(child);
        });
    };
    roots.forEach(visit);
    const options = [...descendants].filter((node) => node.tagName === 'option' || node.attributes['role'] === 'option')
        .map((node) => ({
            nodeId: node.id, label: node.label || text(node.id).replace(/\s+/g, ' ').trim(),
            // Angular [value] need not be an HTML attribute: don't use ng-reflect or invent a key.
            value: node.attributes['value'], selected: node.state.selected ?? null,
            disabled: node.state.disabled || node.state.inert,
        }));
    const busyNodes = [...descendants].filter((node) => 'aria-busy' in node.attributes);

    return {
        status: native ? 'native' : expanded === false ? 'closed' :
            expanded === true && roots.length > 0 && roots.length === referencedIds.length ? 'open' : 'unresolved',
        relation: native ? 'native-options' : referencedIds.length ? 'aria-controls' : 'missing',
        referencedIds, rootNodeIds: roots.map((root) => root.id),
        busy: busyNodes.some((node) => node.attributes['aria-busy'] === 'true') ? true : busyNodes.length ? false : null,
        text: roots.map((root) => text(root.id)).join(' ').replace(/\s+/g, ' ').trim(), options,
    };
}
