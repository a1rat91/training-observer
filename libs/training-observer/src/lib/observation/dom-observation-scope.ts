/* eslint-disable unicorn/prefer-query-selector -- Нужен точный поиск HTML ID, включая пустые строки и специальные символы CSS. */
/** Правила владения DOM-областью и её зависимостями. Отфильтровывает чужие события, учитывая popup и внешние подписи. */
import {type DomSnapshot} from '@training-observer/core/models';

import {
    closestAcrossShadow,
    containsAcrossShadow,
    parentAcrossShadow,
    querySelectorAllDeep,
} from '../capture/dom-tree';
import {resolveRelatedRoots} from '../capture/snapshot-references';

export const MICROFRONTEND_SELECTOR = 'microfrontend > *';

const STYLESHEET_SELECTOR = 'style,link[rel="stylesheet"]';

type FormControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Определяет нужные обновления по владению DOM и явным внешним зависимостям. */
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

    public update(snapshot: DomSnapshot, resolve?: (id: string) => Element | null): void {
        const document = this.root.ownerDocument;
        const dependencies: Element[] = [];

        this.nestedRoots = new WeakSet(
            this.boundarySelector
                ? querySelectorAllDeep(this.root, this.boundarySelector)
                : [],
        );
        this.referenceIds = new Set<string>();

        for (const node of Object.values(snapshot.nodes)) {
            if (node.kind !== 'element') {
                continue;
            }

            const scope = resolve?.(node.id)?.getRootNode() as
                Document | ShadowRoot | undefined;

            const attributes = ['aria-labelledby', 'aria-describedby'];

            if (node.state.expanded) {
                attributes.push('aria-controls');
            }

            for (const attribute of attributes) {
                for (const id of (node.attributes[attribute] ?? '')
                    .split(/\s+/)
                    .filter(Boolean)) {
                    this.referenceIds.add(id);

                    const element = (scope ?? document).getElementById(id);

                    if (element) {
                        dependencies.push(element);
                    }
                }
            }
        }

        this.portals = resolve
            ? (snapshot.relatedRootIds ?? []).flatMap((id) => {
                  const element = resolve(id);

                  return element ? [element] : [];
              })
            : resolveRelatedRoots(snapshot, document);
        this.dependencies = [
            ...new Set([
                ...dependencies,
                ...this.ownedElements(
                    'button,input,meter,output,progress,select,textarea',
                ).flatMap((element) =>
                    Array.from((element as HTMLInputElement).labels ?? []),
                ),
            ]),
        ];
    }

    public owns(node: Node): boolean {
        const element =
            node.nodeType === 1 ? (node as Element) : parentAcrossShadow(node);

        if (!element) {
            return false;
        }

        const owner = this.boundarySelector
            ? closestAcrossShadow(element, this.boundarySelector)
            : null;

        return containsAcrossShadow(this.root, element)
            ? !owner || !containsAcrossShadow(this.root, owner) || owner === this.root
            : !owner &&
                  this.portals.some((portal) => containsAcrossShadow(portal, element));
    }

    public acceptsEvent(node: Node, eventType: string): boolean {
        if (this.owns(node)) {
            return true;
        }

        // Stylesheet может закончить загрузку после mutation batch, добавившего его link.
        if (node.nodeType === 1 && (node as Element).matches(STYLESHEET_SELECTOR)) {
            return true;
        }

        // Браузер не отправляет change для radio, который стал невыбранным.
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
                : parentAcrossShadow(record.target);

        if (!target) {
            return false;
        }

        if (
            this.changesNestedBoundary(record, target) ||
            (record.type === 'attributes' && this.isAncestorElement(target)) ||
            target.closest(STYLESHEET_SELECTOR) ||
            this.isInsideDependency(target) ||
            this.isOwnedLabel(target) ||
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

        // Монтаж и удаление только вложенных корней MF не добавляют узлов в текущую область.
        return changedNodes(record).some(
            (node) =>
                node.nodeType !== 1 ||
                !this.boundarySelector ||
                !(node as Element).matches(this.boundarySelector),
        );
    }

    private changesNestedBoundary(record: MutationRecord, target: Element): boolean {
        if (
            record.type !== 'attributes' ||
            !this.boundarySelector ||
            !containsAcrossShadow(this.root, target)
        ) {
            return false;
        }

        const wasBoundary = this.nestedRoots.has(target);
        const isBoundary = target.matches(this.boundarySelector);

        return (
            wasBoundary !== isBoundary &&
            Boolean(parentAcrossShadow(target) && this.owns(parentAcrossShadow(target)!))
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
        return (
            node.nodeType === 1 &&
            [this.root, ...this.portals, ...this.dependencies].some((element) =>
                containsAcrossShadow(node, element),
            )
        );
    }

    private isOwnedLabel(element: Element): boolean {
        const control =
            element.localName === 'label' ? (element as HTMLLabelElement).control : null;

        return Boolean(
            control &&
            this.owns(control) &&
            (!this.ignoreSelector || !closestAcrossShadow(control, this.ignoreSelector)),
        );
    }

    private isInsideDependency(node: Node): boolean {
        return this.dependencies.some((element) => containsAcrossShadow(element, node));
    }

    private affectsExternalContext(node: Node): boolean {
        if (
            containsAcrossShadow(node, this.root) ||
            this.dependencies.some((element) => containsAcrossShadow(node, element))
        ) {
            return true;
        }

        if (node.nodeType !== 1) {
            return false;
        }

        const element = node as Element;

        return element.matches(STYLESHEET_SELECTOR) ||
            element.querySelector(STYLESHEET_SELECTOR) ||
            this.isOwnedLabel(element) ||
            Array.from(element.querySelectorAll('label')).some((label) =>
                this.isOwnedLabel(label),
            )
            ? true
            : this.referenceIds.has(element.id) ||
                  Array.from(element.querySelectorAll('[id]')).some((child) =>
                      this.referenceIds.has(child.id),
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
        if (node.nodeType !== 1 || !(node as Element).matches('input[type="radio"]')) {
            return false;
        }

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
        return this.ownedElements('input,select,textarea') as FormControlElement[];
    }

    private ownedElements(selector: string): Element[] {
        const controls: Element[] = [];

        for (const root of [this.root, ...this.portals]) {
            if (root.matches(selector)) {
                controls.push(root);
            }

            querySelectorAllDeep(root, selector).forEach((control) => {
                controls.push(control);
            });
        }

        return controls.filter(
            (element) =>
                this.owns(element) &&
                (!this.ignoreSelector ||
                    !closestAcrossShadow(element, this.ignoreSelector)),
        );
    }
}

function changedNodes(record: MutationRecord): Node[] {
    return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
}
