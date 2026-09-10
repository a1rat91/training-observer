import {inject, Injectable} from '@angular/core';

import {type ControlSnapshot} from '../models/control-snapshot';
import {type DomElementSnapshot, type DomNodeId, type DomSnapshot} from '../models/dom-snapshot';
import {NativeControlAdapter, TaigaControlAdapter} from './control-adapters';
import {buildChoiceSnapshot, buildPopupSnapshot} from './choice-snapshot-builder';

@Injectable({providedIn: 'root'})
export class ControlSnapshotBuilder {
    private readonly taiga = inject(TaigaControlAdapter);
    private readonly native = inject(NativeControlAdapter);

    /** Pure projection: only captured nodes are used, with no extra live DOM reads. */
    build(snapshot: DomSnapshot): readonly ControlSnapshot[] {
        const elements = Object.values(snapshot.nodes)
            .filter((node): node is DomElementSnapshot => node.kind === 'element');
        const ancestors = (node: DomElementSnapshot): DomElementSnapshot[] => {
            const result: DomElementSnapshot[] = [];

            for (let parent = node.parentId ? snapshot.nodes[node.parentId] : null;
                parent?.kind === 'element'; parent = parent.parentId ? snapshot.nodes[parent.parentId] : null) {
                result.push(parent);
            }

            return result;
        };
        const candidates = elements.flatMap((target) => {
            const parents = ancestors(target);
            // Checkmarks inside Taiga options are presentation of selection, not standalone checkboxes.
            if (parents.some((parent) => parent.attributes['role'] === 'option')) return [];
            const field = parents.find((parent) => parent.tagName === 'tui-textfield');
            // Taiga's disabled, aria-hidden filler input is decoration, not another textbox.
            if (field && target.tagName === 'input' && target.state.disabled &&
                target.attributes['aria-hidden'] === 'true' &&
                (target.attributes['class'] ?? '').split(/\s+/).includes('t-filler')) {
                return [];
            }

            const match = this.taiga.match(target, parents) ?? this.native.match(target);

            // Multi-value textfields need their own adapter; don't mislabel their editing input.
            if (match?.kind === 'textbox' && field && 'multi' in field.attributes) {
                return [];
            }

            return match ? [{target, parents, match}] : [];
        });
        // Only a known Taiga cleaner belonging to a supported field is folded into that field.
        const fieldHosts = new Set(candidates.filter(({match}) => ['textbox', 'select', 'combobox'].includes(match.kind) && match.source === 'taiga-ui')
            .map(({match}) => match.host.id));
        const controls = candidates.filter(({target, parents}) =>
            !('tuibuttonx' in target.attributes && parents.some((parent) => fieldHosts.has(parent.id))));
        const targets = new Set(controls.map(({target}) => target.id));
        const labels = elements.filter((node) => node.tagName === 'label');
        const byDomId = new Map(elements.filter((node) => node.attributes['id']).map((node) => [node.attributes['id'], node]));
        const text = (id: DomNodeId): string => {
            const node = snapshot.nodes[id];

            return node?.kind === 'text' ? node.text : node?.kind === 'element' ? node.children.map(text).join(' ') : '';
        };
        const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

        return controls.map<ControlSnapshot>(({target, parents, match}) => {
            const {host, kind, source} = match;
            const members = new Set<DomNodeId>();
            const collect = (id: DomNodeId): void => {
                if (id !== target.id && targets.has(id)) {
                    return;
                }

                const node = snapshot.nodes[id];

                if (node) {
                    members.add(id);
                    if (node.kind === 'element') node.children.forEach(collect);
                }
            };
            collect(host.id);
            const relatedLabels = labels.filter((label) =>
                (target.attributes['id'] && label.attributes['for'] === target.attributes['id']) ||
                parents.some((parent) => parent.id === label.id));
            relatedLabels.forEach((label) => collect(label.id));
            const fieldLabels = source === 'taiga-ui' && ['textbox', 'select', 'combobox'].includes(kind)
                ? labels.filter((label) => members.has(label.id) && 'tuilabel' in label.attributes) : [];
            // A single unassociated floating label is usable; don't guess among several labels.
            const label = target.label || (fieldLabels.length === 1 ? normalize(text(fieldLabels[0].id)) : '') ||
                (kind === 'button' && typeof target.state.value === 'string' ? target.state.value : '');
            const state = {
                ...target.state,
                value: ['textbox', 'select', 'combobox'].includes(kind) && !target.state.redacted ? target.state.value : undefined,
                expanded: target.state.expanded ?? host.state.expanded,
                disabled: target.state.disabled || host.state.disabled,
                readOnly: target.state.readOnly || host.state.readOnly,
                inert: target.state.inert || host.state.inert,
                required: target.state.required || host.state.required,
                invalid: target.state.invalid || host.state.invalid,
            };
            const context = parents.filter((parent) =>
                ['form', 'fieldset', 'section', 'dialog'].includes(parent.tagName) ||
                ['form', 'group', 'region', 'dialog'].includes(parent.attributes['role'] ?? ''))
                .reverse().map((parent) => {
                    const labelledBy = parent.attributes['aria-labelledby']?.trim().split(/\s+/)
                        .map((id) => byDomId.get(id)).filter((node): node is DomElementSnapshot => !!node)
                        .map((node) => text(node.id)).join(' ');
                    const legend = parent.tagName === 'fieldset' ? parent.children
                        .map((id) => snapshot.nodes[id]).find((node) => node?.kind === 'element' && node.tagName === 'legend') : null;

                    return {tagName: parent.tagName, id: parent.attributes['id'],
                        label: normalize(labelledBy || parent.attributes['aria-label'] || (legend ? text(legend.id) : ''))};
                });

            return {
                schemaVersion: 1, id: `control:${target.id}`, kind, source, label,
                targetNodeId: target.id, hostNodeId: host.id, memberNodeIds: [...members], state,
                visible: target.visible, inViewport: target.inViewport, hitTest: target.hitTest,
                pointerActionable: target.pointerActionable && !state.disabled && !state.inert,
                rects: target.rects,
                choice: kind === 'select' || kind === 'combobox' ? buildChoiceSnapshot(snapshot, target, host, kind) : undefined,
                popup: source === 'taiga-ui' && kind === 'textbox' && target.attributes['role'] === 'combobox'
                    ? buildPopupSnapshot(snapshot, target, host) : undefined,
                locatorHints: {
                    kind, label, tagName: target.tagName,
                    role: target.attributes['role'] || (kind === 'select' ? 'multiple' in target.attributes ? 'listbox' : 'combobox' : kind),
                    inputType: target.tagName === 'input' ? (target.attributes['type'] || 'text').toLowerCase() : undefined,
                    id: target.attributes['id'], name: target.attributes['name'],
                    testId: target.attributes['data-testid'] || host.attributes['data-testid'],
                    placeholder: target.attributes['placeholder'], context,
                },
            };
        });
    }
}
