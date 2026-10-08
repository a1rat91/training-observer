/* eslint-disable unicorn/prefer-query-selector -- Нужен точный поиск HTML ID, включая пустые строки и специальные символы CSS. */
/** Поиск связанных popup для capture. Явные ссылки позволяют включать portal за пределами основного корня. */
import {type DomNodeSnapshot} from '@training-observer/core/models';

import {isObserverUi} from '../observation/dom-observer-ui';
import {type DomSnapshotOptions} from '../tokens/dom-snapshot-options';
import {isAdapterExcluded} from './dom-adapter-exclusions';

const POPUP_ROLES = new Set(['dialog', 'grid', 'listbox', 'menu', 'tree', 'true']);

/** Однократно следует ссылкам основного дерева, не обходит цепочки popup рекурсивно. */
export function findPopupRoots(
    root: Element,
    nodes: readonly DomNodeSnapshot[],
    options: DomSnapshotOptions,
    excludedSelector: string,
): readonly Element[] {
    const linked = new Set<Element>();

    for (const node of nodes) {
        if (
            node.kind !== 'element' ||
            node.attributes['aria-expanded'] !== 'true' ||
            !POPUP_ROLES.has(node.attributes['aria-haspopup'] ?? '')
        ) {
            continue;
        }

        for (const id of (node.attributes['aria-controls'] ?? '').trim().split(/\s+/)) {
            const element = root.ownerDocument.getElementById(id);

            if (element && isExternalPopup(root, element, options, excludedSelector)) {
                linked.add(element);
            }
        }
    }

    // Пересекающиеся ссылки используют внешний корень, сохраняя согласованность parent-связей.
    return [...linked].filter(
        (element) =>
            ![...linked].some((other) => other !== element && other.contains(element)),
    );
}

function isExternalPopup(
    root: Element,
    element: Element,
    options: DomSnapshotOptions,
    excludedSelector: string,
): boolean {
    return root.contains(element) ||
        element.contains(root) ||
        (options.boundarySelector && element.closest(options.boundarySelector)) ||
        (options.ignoreSelector && element.closest(options.ignoreSelector))
        ? false
        : !isAdapterExcluded(element, excludedSelector) && !isObserverUi(element);
}
