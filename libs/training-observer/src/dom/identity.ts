/**
 * Общий слой identity для записи и разрешения DOM-целей.
 * Получает role и accessible name, нормализует текст/атрибуты и собирает контекст предков.
 * Проверяет видимость и доступность отдельно от идентичности; значения полей не включаются
 * в признаки цели. Работает с существующим DOM, не добавляя метки и не читая Angular-модель.
 */
import {computeAccessibleName, getRole, isInaccessible} from 'dom-accessibility-api';

import {type IdentityFeatures} from '../contracts';

export const CONTROLS =
    'input:not([type="hidden"]),textarea,select,button,a[href],summary,[role="button"],[role="combobox"],[contenteditable="true"]';

/** Observable completion targets; not necessarily interactive controls. */
export const OBSERVABLES = `${CONTROLS},h1,h2,h3,h4,h5,h6,[role="heading"],[role="status"],[role="alert"],[role="region"],section[aria-label],form[aria-label],fieldset`;

export const normalize = (text: string | null): string =>
    (text ?? '').normalize('NFC').replaceAll(/\s+/gu, ' ').trim();

export const accessibleName = (element: Element): string =>
    normalize(
        computeAccessibleName(element, {computedStyleSupportsPseudoElements: false}),
    );

export const sensitive = (element: Element): boolean =>
    element.matches(
        'input[type="password"],input[type="file"],[autocomplete~="current-password"],[autocomplete~="new-password"],[autocomplete~="one-time-code"]',
    );

export const editable = (element: Element): boolean =>
    element.matches('input,textarea,select,[contenteditable="true"]');

export const selection = (element: Element): boolean =>
    element.matches(
        'select,input[type="checkbox"],input[type="radio"],[role="combobox"]',
    );

function safeText(element: Element): string {
    const clone = element.cloneNode(true) as Element;

    clone
        .querySelectorAll(
            'input,textarea,select,[contenteditable="true"],[aria-hidden="true"],script,style',
        )
        .forEach((node) => node.remove());

    return normalize(clone.textContent);
}

export function features(element: Element, root: Element): IdentityFeatures {
    const context: IdentityFeatures['context'] = [];

    for (
        let parent = element.parentElement;
        parent && root.contains(parent);
        parent = parent.parentElement
    ) {
        const role = getRole(parent);
        let name = '';

        if (parent.matches('fieldset')) {
            name = normalize(parent.querySelector(':scope > legend')?.textContent ?? '');
        } else if (parent.matches('tr,[role="row"]')) {
            name = normalize(
                parent.querySelector('th,[role="rowheader"]')?.textContent ?? '',
            );
        } else if (
            parent.matches(
                'form,section,article,[role="form"],[role="group"],[role="region"],[role="dialog"]',
            )
        ) {
            name =
                accessibleName(parent) ||
                normalize(
                    parent.querySelector(':scope > h1,:scope > h2,:scope > h3')
                        ?.textContent ?? '',
                );
        }

        if (name) {
            context.push({role, name});
        }

        if (context.length === 4 || parent === root) {
            break;
        }
    }

    const attributes: IdentityFeatures['attributes'] = {};

    for (const name of [
        'name',
        'type',
        'title',
        'alt',
        'href',
        'autocomplete',
    ] as const) {
        const value = element.getAttribute(name);

        if (value) {
            attributes[name] = value;
        }
    }

    const labels = 'labels' in element ? (element as HTMLInputElement).labels : null;

    return {
        tag: element.localName,
        role: getRole(element),
        accessibleName: accessibleName(element) || null,
        label: labels ? normalize(Array.from(labels, safeText).join(' ')) || null : null,
        text: editable(element) ? null : safeText(element) || null,
        placeholder: normalize(element.getAttribute('placeholder')) || null,
        attributes,
        context,
    };
}
export function flags(element: Element): {
    connected: boolean;
    visible: boolean;
    enabled: boolean;
    readOnly: boolean;
} {
    return {
        connected: element.isConnected,
        visible: element.isConnected && !isInaccessible(element),
        enabled: !element.matches(':disabled,[aria-disabled="true"]'),
        readOnly: element.matches('[readonly],[aria-readonly="true"]'),
    };
}
