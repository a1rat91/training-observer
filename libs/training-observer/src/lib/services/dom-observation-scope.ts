import {type DomSnapshot} from '../models/dom-snapshot';
import {resolveRelatedRoots} from './snapshot-references';

export const MICROFRONTEND_SELECTOR = '[data-mf]';

const STYLESHEET_SELECTOR = 'style,link[rel="stylesheet"]';

type FormControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Routes invalidations using DOM ownership and explicit external dependencies. */
export class DomObservationScope {
    private portals: Element[] = [];
    private dependencies: Element[] = [];
    private nestedRoots = new WeakSet<Element>();
    private referenceIds = new Set<string>();

    constructor(
        public readonly root: Element,
        private readonly ignoreSelector = '',
        private readonly boundarySelector = MICROFRONTEND_SELECTOR,
    ) {}

    public update(snapshot: DomSnapshot): void {
        const document = this.root.ownerDocument;
        this.nestedRoots = new WeakSet(this.boundarySelector
            ? Array.from(this.root.querySelectorAll(this.boundarySelector)) : []);

        this.referenceIds = new Set<string>();

        for (const node of Object.values(snapshot.nodes)) {
            if (node.kind !== 'element') {
                continue;
            }

            const attributes = ['aria-labelledby', 'aria-describedby'];

            if (node.state.expanded) {
                attributes.push('aria-controls');
            }

            for (const attribute of attributes) {
                for (const id of (node.attributes[attribute] ?? '')
                    .split(/\s+/)
                    .filter(Boolean)) {
                    this.referenceIds.add(id);
                }
            }
        }

        this.dependencies = [...this.referenceIds].flatMap((id) => {
            const element = document.querySelector(`#${CSS.escape(id)}`);

            return element ? [element] : [];
        });
        this.portals = resolveRelatedRoots(snapshot, document);
    }

    public owns(node: Node): boolean {
        const element = node.nodeType === 1 ? (node as Element) : node.parentElement;

        if (!element) {
            return false;
        }

        if (this.root.contains(element)) {
            const owner = this.boundarySelector ? element.closest(this.boundarySelector) : null;
            return !owner || !this.root.contains(owner) || owner === this.root;
        }
        const owner = this.boundarySelector ? element.closest(this.boundarySelector) : null;
        return !owner && this.portals.some((portal) => portal.contains(element));
    }

    public acceptsEvent(node: Node, eventType: string): boolean {
        if (this.owns(node)) {
            return true;
        }

        // Stylesheets can finish loading after the mutation batch that inserted their link.
        if (node.nodeType === 1 && (node as Element).matches(STYLESHEET_SELECTOR)) {
            return true;
        }

        // Browsers do not emit change on the radio that becomes unchecked.
        return ((eventType === 'input' || eventType === 'change') &&
            this.hasRadioPeer(node)) ||
            (eventType === 'reset' && this.isOwnedForm(node))
            ? true
            : this.isInsideDependency(node) || this.isAncestorElement(node);
    }

    public acceptsMutation(record: MutationRecord): boolean {
        if (this.owns(record.target)) {
            return this.changesOwnedContent(record);
        }

        const target =
            record.target.nodeType === 1
                ? (record.target as Element)
                : record.target.parentElement;

        if (!target) {
            return false;
        }

        if (
            this.changesNestedBoundary(record, target) ||
            (record.type === 'attributes' && this.isAncestorElement(target)) ||
            target.closest(STYLESHEET_SELECTOR) ||
            this.isInsideDependency(target) ||
            this.changesReferencedId(record, target)
        ) {
            return true;
        }

        return record.type === 'childList'
            ? changedNodes(record).some((node) => this.affectsExternalContext(node))
            : false;
    }

    private changesOwnedContent(record: MutationRecord): boolean {
        if (record.type !== 'childList') {
            return true;
        }

        // Mounting/removing only nested microfrontend roots contributes no nodes to this area.
        return changedNodes(record).some(
            (node) =>
                node.nodeType !== 1 || !this.boundarySelector || !(node as Element).matches(this.boundarySelector),
        );
    }

    private changesNestedBoundary(record: MutationRecord, target: Element): boolean {
        if (record.type !== 'attributes' || !this.boundarySelector || !this.root.contains(target)) {
            return false;
        }
        const wasBoundary = this.nestedRoots.has(target);
        const isBoundary = target.matches(this.boundarySelector);
        return wasBoundary !== isBoundary && Boolean(target.parentElement && this.owns(target.parentElement));
    }

    private changesReferencedId(record: MutationRecord, target: Element): boolean {
        return (
            record.type === 'attributes' &&
            record.attributeName === 'id' &&
            this.referenceIds.has(target.id)
        );
    }

    private isAncestorElement(node: Node): boolean {
        return node.nodeType === 1 && (node as Element).contains(this.root);
    }

    private isInsideDependency(node: Node): boolean {
        return this.dependencies.some((element) => element.contains(node));
    }

    private affectsExternalContext(node: Node): boolean {
        if (
            node.contains(this.root) ||
            this.dependencies.some((element) => node.contains(element))
        ) {
            return true;
        }

        if (node.nodeType !== 1) {
            return false;
        }

        const element = node as Element;

        return element.matches(STYLESHEET_SELECTOR) ||
            element.querySelector(STYLESHEET_SELECTOR)
            ? true
            : this.referenceIds.has(element.id) ||
                  Array.from(element.querySelectorAll('[id]')).some((child) =>
                      this.referenceIds.has(child.id),
                  );
    }

    private isOwnedForm(node: Node): boolean {
        // The form owner can live outside this area through an explicit form="id".
        return (
            node.nodeType === 1 &&
            (node as Element).localName === 'form' &&
            this.ownedFormControls().some((control) => control.form === node)
        );
    }

    private hasRadioPeer(node: Node): boolean {
        if (node.nodeType !== 1 || !(node as Element).matches('input[type="radio"]')) {
            return false;
        }

        const radio = node as HTMLInputElement;

        // Unnamed radios are independent, even in the same form/fieldset.
        return (
            Boolean(radio.name) &&
            this.ownedFormControls().some(
                (control) =>
                    control.localName === 'input' &&
                    control.type === 'radio' &&
                    control.name === radio.name &&
                    control.form === radio.form &&
                    control.getRootNode() === radio.getRootNode(),
            )
        );
    }

    private ownedFormControls(): FormControlElement[] {
        const selector = 'input,select,textarea';
        const controls: FormControlElement[] = [];

        for (const root of [this.root, ...this.portals]) {
            if (root.matches(selector)) {
                controls.push(root as FormControlElement);
            }

            root.querySelectorAll<FormControlElement>(selector).forEach((control) => {
                controls.push(control);
            });
        }

        return controls.filter(
            (element) =>
                this.owns(element) &&
                (!this.ignoreSelector || !element.closest(this.ignoreSelector)),
        );
    }
}

function changedNodes(record: MutationRecord): Node[] {
    return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
}
