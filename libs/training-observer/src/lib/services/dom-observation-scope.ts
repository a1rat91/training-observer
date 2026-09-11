import {type DomSnapshot} from '../models/dom-snapshot';
import {resolveRelatedRoots} from './snapshot-references';

export const MICROFRONTEND_SELECTOR = '[data-mf]';

const STYLESHEET_SELECTOR = 'style,link[rel="stylesheet"]';

type FormControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Routes invalidations using DOM ownership and explicit external dependencies. */
export class DomObservationScope {
    private portals: Element[] = [];
    private dependencies: Element[] = [];
    private referenceIds = new Set<string>();

    constructor(
        public readonly root: Element,
        private readonly ignoreSelector = '',
    ) {}

    public update(snapshot: DomSnapshot): void {
        const document = this.root.ownerDocument;

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

        const owner = element.closest(MICROFRONTEND_SELECTOR);

        return owner
            ? owner === this.root
            : this.portals.some((portal) => portal.contains(element));
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
                node.nodeType !== 1 || !(node as Element).matches(MICROFRONTEND_SELECTOR),
        );
    }

    private changesNestedBoundary(record: MutationRecord, target: Element): boolean {
        // Adding a marker to existing content removes that content from the enclosing area.
        return (
            record.type === 'attributes' &&
            record.attributeName === 'data-mf' &&
            target.parentElement?.closest(MICROFRONTEND_SELECTOR) === this.root
        );
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
