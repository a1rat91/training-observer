import {computeAccessibleName, getRole, isInaccessible} from 'dom-accessibility-api';

import {type Fingerprint, type ObservationOptions} from './model';

export const INTERACTIVE =
    'button,a[href],input,textarea,select,summary,[role],[contenteditable="true"],[tabindex]';

export const normalize = (value: string | null | undefined): string =>
    (value ?? '').normalize('NFKC').replaceAll(/\s+/gu, ' ').trim();

export function included(element: Element, options: ObservationOptions = {}): boolean {
    return !options.excludedRoots?.some(
        (root) => root === element || root.contains(element),
    );
}

export function available(element: Element): boolean {
    return !element.isConnected ||
        element.closest('[hidden],[inert],[aria-hidden="true"]') ||
        element.matches(':disabled,[aria-disabled="true"],input[type="hidden"]')
        ? false
        : !isInaccessible(element);
}

export function elements(
    root: Document | Element,
    options: ObservationOptions = {},
): Element[] {
    const list = [...root.querySelectorAll(INTERACTIVE)];

    if (root.nodeType === 1 && (root as Element).matches(INTERACTIVE)) {
        list.unshift(root as Element);
    }

    return list.filter((element) => included(element, options) && available(element));
}

function content(element: Element): string {
    // Editable values and entire option lists are not identity evidence.
    if (element.matches('input,textarea,select,[contenteditable="true"]')) {
        return '';
    }

    const clone = element.cloneNode(true) as Element;

    clone
        .querySelectorAll('[aria-hidden="true"],script,style,input,textarea,select')
        .forEach((node) => node.remove());

    return normalize(clone.textContent).slice(0, 160);
}

function contexts(element: Element, root: Document | Element): string[] {
    const result: string[] = [];

    for (
        let ancestor = element.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
    ) {
        const role = getRole(ancestor) ?? '';
        let name = '';

        if (ancestor.matches('fieldset')) {
            name = normalize(ancestor.querySelector(':scope > legend')?.textContent);
        } else if (ancestor.matches('tr,[role="row"]')) {
            name = normalize(
                ancestor.querySelector('th,[role="rowheader"]')?.textContent,
            );
        } else if (
            ['dialog', 'form', 'group', 'listbox', 'navigation', 'region'].includes(
                role,
            ) ||
            ancestor.matches('section,article,form')
        ) {
            name = normalize(
                computeAccessibleName(ancestor, {
                    computedStyleSupportsPseudoElements: false,
                }),
            );

            if (!name) {
                name = normalize(
                    ancestor.querySelector(':scope > h1,:scope > h2,:scope > h3')
                        ?.textContent,
                );
            }
        }

        if (name) {
            result.push(`${role || ancestor.localName}:${name.slice(0, 120)}`);
        }

        if (ancestor === root || result.length === 4) {
            break;
        }
    }

    return result;
}

export function fingerprint(element: Element, root: Document | Element): Fingerprint {
    const attributes: Record<string, string> = {};

    for (const key of ['name', 'type', 'href', 'alt', 'title']) {
        const value = normalize(element.getAttribute(key));

        if (value) {
            attributes[key] = value;
        }
    }

    const labels = 'labels' in element ? (element as HTMLInputElement).labels : null;

    return {
        tag: element.localName,
        role: getRole(element) ?? (element.matches('summary') ? 'button' : ''),
        accessibleName: normalize(
            computeAccessibleName(element, {computedStyleSupportsPseudoElements: false}),
        ).slice(0, 160),
        text: content(element),
        label: normalize(
            labels ? [...labels].map((label) => label.textContent).join(' ') : '',
        ).slice(0, 160),
        placeholder: normalize(element.getAttribute('placeholder')),
        attributes,
        context: contexts(element, root),
    };
}

/** composedPath handles an icon/span click without writing to the host DOM. */
export function actionTarget(
    event: Event,
    root: Document | Element,
    options: ObservationOptions,
): Element | undefined {
    for (const node of event.composedPath()) {
        if (!(node instanceof Element)) {
            continue;
        }

        if (!included(node, options) || node.getRootNode() !== node.ownerDocument) {
            return undefined;
        } // Shadow DOM explicitly out of scope.

        if (!root.contains(node)) {
            continue;
        }

        if (node.matches(INTERACTIVE) && available(node)) {
            return node;
        }

        if (node === root) {
            break;
        }
    }

    return undefined;
}
