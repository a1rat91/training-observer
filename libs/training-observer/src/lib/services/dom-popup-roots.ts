import {type DomNodeSnapshot} from '../models/dom-snapshot';
import {type DomSnapshotOptions} from '../tokens/dom-snapshot-options';
import {isScrollDecoration} from './dom-scroll-decoration';

const POPUP_ROLES = new Set(['true', 'menu', 'listbox', 'tree', 'grid', 'dialog']);

/** Follows links from the main captured tree once, without recursively discovering popup chains. */
export function findPopupRoots(
    root: Element,
    nodes: readonly DomNodeSnapshot[],
    options: DomSnapshotOptions,
): readonly Element[] {
    const linked = new Set<Element>();

    for (const node of nodes) {
        if (node.kind !== 'element' || node.attributes['aria-expanded'] !== 'true' ||
            !POPUP_ROLES.has(node.attributes['aria-haspopup'])) continue;

        for (const id of (node.attributes['aria-controls'] ?? '').trim().split(/\s+/)) {
            const element = root.ownerDocument.getElementById(id);
            if (element && isExternalPopup(root, element, options)) linked.add(element);
        }
    }

    // Overlapping references share the outer root so their parent links stay consistent.
    return [...linked].filter((element) =>
        ![...linked].some((other) => other !== element && other.contains(element)));
}

function isExternalPopup(root: Element, element: Element, options: DomSnapshotOptions): boolean {
    if (root.contains(element) || element.contains(root)) return false;
    if (options.boundarySelector && element.closest(options.boundarySelector)) return false;
    if (options.ignoreSelector && element.closest(options.ignoreSelector)) return false;

    return !isScrollDecoration(element);
}
