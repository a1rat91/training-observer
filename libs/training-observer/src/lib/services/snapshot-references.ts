import {type DomSnapshot} from '../models/dom-snapshot';

/** Resolves only portal roots already captured for this session; never discovers new owners. */
export function resolveRelatedRoots(snapshot: DomSnapshot, document: Document): Element[] {
    const roots: Element[] = [];

    for (const id of snapshot.relatedRootIds ?? []) {
        const node = snapshot.nodes[id];
        const htmlId = node?.kind === 'element' ? node.attributes['id'] : undefined;
        const element = htmlId ? document.getElementById(htmlId) : null;
        if (element) roots.push(element);
    }

    return roots;
}
