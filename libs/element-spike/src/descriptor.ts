import {finder} from '@medv/finder';

import {elements, fingerprint} from './dom';
import {
    type ElementDescriptor,
    type LocatorCandidate,
    type ObservationOptions,
} from './model';

export function describeElement(
    element: Element,
    root: Document | Element = element.ownerDocument,
    options: ObservationOptions = {},
): ElementDescriptor {
    if (!elements(root, options).includes(element)) {
        throw new Error('Target is outside the supported observable DOM');
    }

    const fp = fingerprint(element, root);
    const locators: LocatorCandidate[] = [];
    const peers = elements(root, options).filter((other) => {
        const candidate = fingerprint(other, root);

        return (
            candidate.role === fp.role && candidate.accessibleName === fp.accessibleName
        );
    });

    const requiresContext = peers.length > 1;

    if (fp.role && fp.accessibleName) {
        for (const context of fp.context) {
            locators.push({
                kind: 'role',
                role: fp.role,
                name: fp.accessibleName,
                context,
            });
        }

        locators.push({kind: 'role', role: fp.role, name: fp.accessibleName});
    }

    if (fp.label) {
        locators.push({kind: 'label', value: fp.label});
    }

    if (fp.placeholder) {
        locators.push({kind: 'placeholder', value: fp.placeholder});
    }

    if (fp.text) {
        locators.push({kind: 'text', value: fp.text});
    }

    for (const name of ['name', 'href', 'alt', 'title']) {
        const value = fp.attributes[name];

        if (value) {
            locators.push({kind: 'attribute', name, value});
        }
    }

    let cssFallback: string | undefined;

    try {
        cssFallback = finder(element, {
            root: root.nodeType === 9 ? (root as Document).body : (root as Element),
            timeoutMs: 30,
            idName: () => false,
            className: () => false,
            attr: (name) =>
                ['alt', 'href', 'name', 'placeholder', 'title', 'type'].includes(name),
        });
        locators.push({kind: 'css', value: cssFallback});
    } catch {
        /* CSS generation is optional evidence, never a recording failure. */
    }

    return {
        version: 1,
        page: element.ownerDocument.location.pathname,
        ...fp,
        locators,
        cssFallback,
        fingerprint: fp,
        requiresContext,
    };
}
