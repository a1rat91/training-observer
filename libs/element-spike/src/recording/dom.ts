import {finder} from '@medv/finder';

import {
    type AttributeName,
    type CapturedValue,
    type ElementDescriptor,
    type Locator,
    type NormalizedValue,
    type ValuePolicy,
} from '../contracts';
import {CONTROLS, features, flags, sensitive} from '../dom/identity';

export {
    accessibleName,
    CONTROLS,
    editable,
    features,
    flags,
    normalize,
    selection,
} from '../dom/identity';

/** Generation only. No recovery/scoring is claimed here. Existing DOM nodes are used solely to count matches. */
export function describe(
    element: Element,
    root: Element,
    id: string,
    candidates = CONTROLS,
): ElementDescriptor {
    const identity = features(element, root);
    const scope = identity.context.slice(0, 1);
    const peers = Array.from(root.querySelectorAll(candidates))
        .filter((node) => flags(node).visible)
        .map((node) => ({node, features: features(node, root)}));

    const scoped = peers.filter((peer) =>
        scope.every((entry) =>
            peer.features.context.some(
                (value) => value.role === entry.role && value.name === entry.name,
            ),
        ),
    );

    const locators: ElementDescriptor['locators'] = [];
    const add = (selector: Locator, count: number): void => {
        if (count > 0) {
            locators.push({
                id: `locator-${locators.length + 1}`,
                selector,
                recordedMatches: count,
            });
        }
    };

    if (identity.role) {
        add(
            {
                kind: 'role',
                role: identity.role,
                name: identity.accessibleName,
                exact: true,
            },
            scoped.filter(
                (peer) =>
                    peer.features.role === identity.role &&
                    peer.features.accessibleName === identity.accessibleName,
            ).length,
        );
    }

    for (const kind of ['label', 'placeholder', 'text'] as const) {
        const value = identity[kind];

        if (value) {
            add(
                {kind, value, exact: true},
                scoped.filter((peer) => peer.features[kind] === value).length,
            );
        }
    }

    for (const [name, value] of Object.entries(identity.attributes)) {
        add(
            {kind: 'attribute', name: name as AttributeName, value, exact: true},
            scoped.filter(
                (peer) => peer.features.attributes[name as AttributeName] === value,
            ).length,
        );
    }

    try {
        const value = finder(element, {
            root,
            timeoutMs: 30,
            idName: () => false,
            className: () => false,
            attr: (name) => ['alt', 'name', 'title', 'type'].includes(name),
        });

        add({kind: 'css', value}, root.querySelectorAll(value).length);
    } catch {
        /* Semantic candidates can stand alone when a CSS generator has no result. */
    }

    if (!locators.length) {
        throw new Error('No verifiable locator candidate');
    }

    const duplicate =
        peers.filter(
            (peer) =>
                peer.features.role === identity.role &&
                peer.features.accessibleName === identity.accessibleName,
        ).length > 1;

    return {
        version: 2,
        id,
        scope: {pathname: element.ownerDocument.location.pathname, context: scope},
        fingerprint: {
            algorithm: 'semantic-features-v1',
            normalization: 'nfc-whitespace-v1',
            features: identity,
        },
        locators,
        contextRequired: duplicate && scope.length > 0,
    };
}
export function normalizeValue(
    raw: string,
    rule: NormalizedValue['rule'],
): NormalizedValue | undefined {
    if (rule === 'decimal-comma-v1') {
        if (!/^[+-]?(?:\d+|\d{1,3}(?:[ \u00A0\u202F]\d{3})+)(?:,\d+)?$/.test(raw)) {
            return undefined;
        }

        const value = Number(raw.replaceAll(/[ \u00A0\u202F]/g, '').replace(',', '.'));

        return Number.isFinite(value) ? {rule, value} : undefined;
    }

    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);

    if (!match) {
        return undefined;
    }

    const value = `${match[3]}-${match[2]}-${match[1]}`;

    return Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value
        ? {rule, value}
        : undefined;
}
/** Taiga's existing public DOM directives select an explicitly enabled normalization rule, never an Angular model. */
export function readValue(element: Element, policy: ValuePolicy): CapturedValue {
    if (sensitive(element)) {
        return {status: 'redacted', reason: 'sensitive'};
    }

    if (policy.mode === 'omit') {
        return {status: 'omitted', reason: 'policy'};
    }

    let raw: string[] | boolean | string;

    if (element.matches('input[type="checkbox"],input[type="radio"]')) {
        raw = (element as HTMLInputElement).checked;
    } else if (element instanceof HTMLSelectElement) {
        raw = Array.from(element.selectedOptions, (option) => option.label);
    } else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
    ) {
        raw = element.value;
    } else if (element.matches('[contenteditable="true"]')) {
        raw = element.textContent ?? '';
    } else {
        return {status: 'unavailable', reason: 'unsupported'};
    }

    const result: CapturedValue = {status: 'captured', raw};
    let rule: NormalizedValue['rule'] | undefined;

    if (element.hasAttribute('tuiinputdate')) {
        rule = 'date-dmy-v1';
    } else if (element.hasAttribute('tuiinputnumber')) {
        rule = 'decimal-comma-v1';
    }

    if (rule && typeof raw === 'string' && policy.normalizers.includes(rule)) {
        const normalized = normalizeValue(raw, rule);

        if (normalized) {
            result.normalized = normalized;
        }
    }

    return result;
}
