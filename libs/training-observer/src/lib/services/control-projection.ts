import {
    type ControlKind,
    type ControlLocatorHints,
    type ControlSnapshot,
} from '../models/control-snapshot';
import {
    type DomControlState,
    type DomElementSnapshot,
    type DomNodeId,
} from '../models/dom-snapshot';
import {buildChoiceSnapshot, buildPopupSnapshot} from './choice-snapshot-builder';
import {
    type ControlCandidate,
    hasTaigaInputPopup,
    taigaFloatingLabel,
} from './control-adapters';
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

    const label = controlLabel(reader, control, members);
    const state = controlState(control);

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
                ? buildChoiceSnapshot(reader.snapshot, target, host, kind)
                : undefined,
        popup: hasTaigaInputPopup(control)
            ? buildPopupSnapshot(reader.snapshot, target, host)
            : undefined,
        locatorHints: locatorHints(reader, control, label),
    };
}

function controlLabel(
    reader: SnapshotReader,
    control: ControlCandidate,
    members: ReadonlySet<DomNodeId>,
): string {
    if (control.target.label) {
        return control.target.label;
    }

    const floatingLabel = taigaFloatingLabel(reader, control, members);

    if (floatingLabel) {
        return floatingLabel;
    }

    return control.kind === 'button' && typeof control.target.state.value === 'string'
        ? control.target.state.value
        : '';
}

function controlState({target, host, kind}: ControlCandidate): DomControlState {
    // Values remain DOM strings. Radio value describes the option; checked describes selection.
    const carriesValue = ['combobox', 'number', 'radio', 'select', 'textbox'].includes(
        kind,
    );

    return {
        ...target.state,
        value: carriesValue && !target.state.redacted ? target.state.value : undefined,
        indeterminate: kind === 'switch' ? undefined : target.state.indeterminate,
        expanded: target.state.expanded ?? host.state.expanded,
        disabled: target.state.disabled || host.state.disabled,
        readOnly: target.state.readOnly || host.state.readOnly,
        inert: target.state.inert || host.state.inert,
        required: target.state.required || host.state.required,
        invalid: target.state.invalid || host.state.invalid,
    };
}

function locatorHints(
    reader: SnapshotReader,
    control: ControlCandidate,
    label: string,
): ControlLocatorHints {
    const {target, host, kind, ancestors} = control;

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
        testId: target.attributes['data-testid'] || host.attributes['data-testid'],
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

    // A Taiga masked number still has an implicit textbox role.
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
