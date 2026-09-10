import {type DomSnapshot} from '../models/dom-snapshot';

export const MICROFRONTEND_SELECTOR = '[data-mf]';

/** Routes invalidations using DOM ownership and explicit external dependencies. */
export class DomObservationScope {
    private portals: Element[] = [];
    private dependencies: Element[] = [];
    private referenceIds = new Set<string>();

    constructor(readonly root: Element) {}

    update(snapshot: DomSnapshot): void {
        const document = this.root.ownerDocument;
        this.referenceIds = new Set<string>();
        for (const node of Object.values(snapshot.nodes)) {
            if (node.kind !== 'element') continue;
            const attributes = ['aria-labelledby', 'aria-describedby'];
            if (node.state.expanded) attributes.push('aria-controls');
            for (const attribute of attributes) {
                for (const id of (node.attributes[attribute] ?? '').split(/\s+/).filter(Boolean)) {
                    this.referenceIds.add(id);
                }
            }
        }
        this.dependencies = [...this.referenceIds].flatMap((id) => {
            const element = document.getElementById(id);
            return element ? [element] : [];
        });
        this.portals = (snapshot.relatedRootIds ?? []).flatMap((id) => {
            const node = snapshot.nodes[id];
            const element = node?.kind === 'element' && node.attributes['id']
                ? document.getElementById(node.attributes['id']) : null;
            return element ? [element] : [];
        });
    }

    owns(node: Node): boolean {
        const element = node.nodeType === 1 ? node as Element : node.parentElement;
        if (!element) return false;
        const owner = element.closest(MICROFRONTEND_SELECTOR);
        if (owner) return owner === this.root;
        return this.portals.some((portal) => portal.contains(element));
    }

    acceptsEvent(node: Node): boolean {
        // A stylesheet can finish loading after the mutation batch that inserted its link.
        if (node.nodeType === 1 && (node as Element).matches('style,link[rel="stylesheet"]')) return true;
        return this.owns(node) || this.dependencies.some((element) => element.contains(node)) ||
            (node.nodeType === 1 && (node as Element).contains(this.root));
    }

    acceptsMutation(record: MutationRecord): boolean {
        if (this.owns(record.target)) {
            if (record.type !== 'childList') return true;
            // A separately observed nested root contributes no nodes to this snapshot.
            return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) =>
                node.nodeType !== 1 || !(node as Element).matches(MICROFRONTEND_SELECTOR));
        }

        const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
        if (!target) return false;
        // Adding a boundary to existing content removes that content from the enclosing area.
        if (record.type === 'attributes' && record.attributeName === 'data-mf' &&
            target.parentElement?.closest(MICROFRONTEND_SELECTOR) === this.root) return true;
        // Common ancestor attributes and stylesheet updates may affect multiple areas.
        if (record.type === 'attributes' && target.contains(this.root)) return true;
        if (target.closest('style,link[rel="stylesheet"]')) return true;
        if (this.dependencies.some((element) => element.contains(target))) return true;

        if (record.type === 'attributes' && record.attributeName === 'id' && this.referenceIds.has(target.id)) return true;
        if (record.type !== 'childList') return false;
        return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) => {
            if (node.contains(this.root)) return true;
            if (this.dependencies.some((element) => node.contains(element))) return true;
            if (node.nodeType !== 1) return false;
            const element = node as Element;
            if (element.matches('style,link[rel="stylesheet"]') || element.querySelector('style,link[rel="stylesheet"]')) return true;
            return this.referenceIds.has(element.id) ||
                Array.from(element.querySelectorAll('[id]')).some((child) => this.referenceIds.has(child.id));
        });
    }
}
