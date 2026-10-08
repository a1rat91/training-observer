/** Проекция DOM-узлов в логические контролы. Объединяет служебные части, собирает состояние и смысловые признаки поиска. */
import {
    type ControlKind,
    type ControlLocatorHints,
    type ControlSnapshot,
    type DomControlState,
    type DomElementSnapshot,
    type DomNodeId,
} from '@training-observer/core/models';

import {buildChoiceSnapshot, buildPopupSnapshot} from './choice-snapshot-builder';
import {type ControlCandidate} from './control-adapter';
import {normalizeText, type SnapshotReader} from './snapshot-reader';

export function projectControl(
    reader: SnapshotReader,
    control: ControlCandidate,
    targets: ReadonlySet<DomNodeId>,
): ControlSnapshot {
    const {target, host, kind, source, ancestors} = control;
    const labels = reader.relatedLabels(target, ancestors);
    const members = reader.members(
        [host.id, ...labels.map((label) => label.id)],
        target.id,
        targets,
    );

    const label = controlLabel(reader, control, targets);
    const hosts = controlHosts(control);
    const state = controlState(control, hosts);

    return {
        schemaVersion: 1,
        id: `control:${target.id}`,
        kind,
        source,
        label,
        targetNodeId: target.id,
        hostNodeId: host.id,
        memberNodeIds: [...members],
        state,
        visible: target.visible,
        inViewport: target.inViewport,
        hitTest: target.hitTest,
        pointerActionable: target.pointerActionable && !state.disabled && !state.inert,
        rects: target.rects,
        choice:
            kind === 'select' || kind === 'combobox'
                ? buildChoiceSnapshot(reader.snapshot, target, hosts, kind)
                : undefined,
        popup:
            control.popup && (kind === 'textbox' || kind === 'number')
                ? buildPopupSnapshot(reader.snapshot, target, hosts)
                : undefined,
        locatorHints: locatorHints(reader, control, label, hosts),
    };
}

function controlLabel(
    reader: SnapshotReader,
    control: ControlCandidate,
    targets: ReadonlySet<DomNodeId>,
): string {
    if (control.label !== undefined) {
        return normalizeText(control.label);
    }

    if (control.target.label) {
        return control.target.label;
    }

    let layer: ControlCandidate | undefined = control;

    while (layer) {
        if (layer.label !== undefined) {
            return normalizeText(layer.label);
        }

        if (layer.adapter?.resolveLabel) {
            // Inner labels are resolved in their own host, even if the outer
            // business component groups several independent fields.
            const labels = reader.relatedLabels(layer.target, layer.ancestors);
            const members = reader.members(
                [layer.host.id, ...labels.map((label) => label.id)],
                layer.target.id,
                targets,
            );

            const label = layer.adapter.resolveLabel({reader, candidate: layer, members});

            if (label !== undefined && typeof label !== 'string') {
                throw new Error(
                    `Invalid label returned by control adapter ${layer.adapter.id}.`,
                );
            }

            if (label) {
                return normalizeText(label);
            }
        }

        layer = layer.base;
    }

    return control.kind === 'button' && typeof control.target.state.value === 'string'
        ? control.target.state.value
        : '';
}

function controlHosts(control: ControlCandidate): readonly DomElementSnapshot[] {
    const hosts: DomElementSnapshot[] = [];
    let layer: ControlCandidate | undefined = control;

    while (layer) {
        hosts.push(layer.host);
        layer = layer.base;
    }

    return hosts;
}

function controlState(
    control: ControlCandidate,
    hosts: readonly DomElementSnapshot[],
): DomControlState {
    const {target, kind} = control;

    // Значения остаются DOM-строками. У radio value описывает вариант, checked — его выбор.
    const carriesValue = ['combobox', 'number', 'radio', 'select', 'textbox'].includes(
        kind,
    );

    return {
        ...target.state,
        value: carriesValue && !target.state.redacted ? target.state.value : undefined,
        indeterminate: kind === 'switch' ? undefined : target.state.indeterminate,
        expanded:
            target.state.expanded ??
            hosts.find((host) => host.state.expanded !== undefined)?.state.expanded,
        disabled: target.state.disabled || hosts.some((host) => host.state.disabled),
        readOnly: target.state.readOnly || hosts.some((host) => host.state.readOnly),
        inert: target.state.inert || hosts.some((host) => host.state.inert),
        required: target.state.required || hosts.some((host) => host.state.required),
        invalid: target.state.invalid || hosts.some((host) => host.state.invalid),
    };
}

function locatorHints(
    reader: SnapshotReader,
    control: ControlCandidate,
    label: string,
    hosts: readonly DomElementSnapshot[],
): ControlLocatorHints {
    const {target, kind, ancestors} = control;

    return {
        kind,
        label,
        tagName: target.tagName,
        role: controlRole(target, kind),
        inputType:
            target.tagName === 'input'
                ? (target.attributes['type'] || 'text').toLowerCase()
                : undefined,
        id: target.attributes['id'],
        name: target.attributes['name'],
        testId:
            target.attributes['data-testid'] ||
            hosts.find((host) => !!host.attributes['data-testid'])?.attributes[
                'data-testid'
            ],
        placeholder: target.attributes['placeholder'],
        context: ancestors
            .filter(isContextElement)
            .reverse()
            .map((element) => ({
                tagName: element.tagName,
                id: element.attributes['id'],
                label: contextLabel(reader, element),
            })),
    };
}

function controlRole(target: DomElementSnapshot, kind: ControlKind): string {
    if (target.attributes['role']) {
        return target.attributes['role'];
    }

    if (kind === 'select') {
        return 'multiple' in target.attributes ? 'listbox' : 'combobox';
    }

    // Masked numeric inputs with type=text still have the implicit textbox role.
    if (kind === 'number') {
        return target.attributes['type']?.toLowerCase() === 'number'
            ? 'spinbutton'
            : 'textbox';
    }

    return kind;
}

function isContextElement(element: DomElementSnapshot): boolean {
    return (
        ['dialog', 'fieldset', 'form', 'section'].includes(element.tagName) ||
        ['dialog', 'form', 'group', 'region'].includes(element.attributes['role'] ?? '')
    );
}

function contextLabel(reader: SnapshotReader, element: DomElementSnapshot): string {
    const referenced = reader.referencedText(element.attributes['aria-labelledby'] ?? '');
    const legend = element.tagName === 'fieldset' ? reader.legendText(element) : '';

    return normalizeText(referenced || element.attributes['aria-label'] || legend);
}
