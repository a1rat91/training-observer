/** Правила владения DOM-областью и её зависимостями. Отфильтровывает чужие события, учитывая popup и внешние подписи. */
import { type DomSnapshot } from '@training-observer/core/models';
import { resolveRelatedRoots } from '../capture/snapshot-references';

export const MICROFRONTEND_SELECTOR = '[data-mf]';
const STYLESHEET_SELECTOR = 'style,link[rel="stylesheet"]';
type FormControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Определяет нужные обновления по владению DOM и явным внешним зависимостям. */
export class DomObservationScope {
    private portals: Element[] = [];
    private dependencies: Element[] = [];
    private referenceIds = new Set<string>();

    constructor(
        readonly root: Element,
        private readonly ignoreSelector = '',
    ) {}

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
        this.portals = resolveRelatedRoots(snapshot, document);
    }

    owns(node: Node): boolean {
        const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
        if (!element) return false;
        const owner = element.closest(MICROFRONTEND_SELECTOR);
        if (owner) return owner === this.root;
        return this.portals.some((portal) => portal.contains(element));
    }

    acceptsEvent(node: Node, eventType: string): boolean {
        if (this.owns(node)) return true;
        // Stylesheet может закончить загрузку после mutation batch, добавившего его link.
        if (node.nodeType === 1 && (node as Element).matches(STYLESHEET_SELECTOR)) return true;
        // Браузер не отправляет change для radio, который стал невыбранным.
        if ((eventType === 'input' || eventType === 'change') && this.hasRadioPeer(node)) return true;
        if (eventType === 'reset' && this.isOwnedForm(node)) return true;

        return this.isInsideDependency(node) || this.isAncestorElement(node);
    }

    acceptsMutation(record: MutationRecord): boolean {
        if (this.owns(record.target)) return this.changesOwnedContent(record);

        const target =
            record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
        if (!target) return false;
        if (this.changesNestedBoundary(record, target)) return true;
        if (record.type === 'attributes' && this.isAncestorElement(target)) return true;
        if (target.closest(STYLESHEET_SELECTOR)) return true;
        if (this.isInsideDependency(target)) return true;
        if (this.changesReferencedId(record, target)) return true;
        if (record.type !== 'childList') return false;

        return changedNodes(record).some((node) => this.affectsExternalContext(node));
    }

    private changesOwnedContent(record: MutationRecord): boolean {
        if (record.type !== 'childList') return true;
        // Монтаж и удаление только вложенных корней MF не добавляют узлов в текущую область.
        return changedNodes(record).some(
            (node) => node.nodeType !== 1 || !(node as Element).matches(MICROFRONTEND_SELECTOR),
        );
    }

    private changesNestedBoundary(record: MutationRecord, target: Element): boolean {
        // Добавление признака отдельной области исключает это содержимое из внешней области.
        return (
            record.type === 'attributes' &&
            record.attributeName === 'data-mf' &&
            target.parentElement?.closest(MICROFRONTEND_SELECTOR) === this.root
        );
    }

    private changesReferencedId(record: MutationRecord, target: Element): boolean {
        return (
            record.type === 'attributes' && record.attributeName === 'id' && this.referenceIds.has(target.id)
        );
    }

    private isAncestorElement(node: Node): boolean {
        return node.nodeType === 1 && (node as Element).contains(this.root);
    }

    private isInsideDependency(node: Node): boolean {
        return this.dependencies.some((element) => element.contains(node));
    }

    private affectsExternalContext(node: Node): boolean {
        if (node.contains(this.root)) return true;
        if (this.dependencies.some((element) => node.contains(element))) return true;
        if (node.nodeType !== 1) return false;
        const element = node as Element;
        if (element.matches(STYLESHEET_SELECTOR) || element.querySelector(STYLESHEET_SELECTOR)) return true;

        return (
            this.referenceIds.has(element.id) ||
            Array.from(element.querySelectorAll('[id]')).some((child) => this.referenceIds.has(child.id))
        );
    }

    private isOwnedForm(node: Node): boolean {
        // Владелец формы может находиться вне области при явном form="id".
        return (
            node.nodeType === 1 &&
            (node as Element).localName === 'form' &&
            this.ownedFormControls().some((control) => control.form === node)
        );
    }

    private hasRadioPeer(node: Node): boolean {
        if (node.nodeType !== 1 || !(node as Element).matches('input[type="radio"]')) return false;
        const radio = node as HTMLInputElement;
        // Radio без name независимы даже в одной форме или fieldset.
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
            if (root.matches(selector)) controls.push(root as FormControlElement);
            root.querySelectorAll<FormControlElement>(selector).forEach((control) => controls.push(control));
        }

        return controls.filter(
            (element) => this.owns(element) && !(this.ignoreSelector && element.closest(this.ignoreSelector)),
        );
    }
}

function changedNodes(record: MutationRecord): Node[] {
    return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
}
