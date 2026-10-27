/** Навигация по light DOM и открытым shadow roots без изменения страницы. */
export function shadowHost(node: Node): Element | null {
    return node.nodeType === 11 && 'host' in node ? (node as ShadowRoot).host : null;
}

export function parentAcrossShadow(node: Node): Element | null {
    return node.parentElement ?? shadowHost(node.getRootNode());
}

/** Для геометрии учитывается место проекции light DOM в slot. */
export function renderedParent(element: Element): Element | null {
    return element.assignedSlot ?? parentAcrossShadow(element);
}

export function closestAcrossShadow(node: Node, selector: string): Element | null {
    for (
        let element = node.nodeType === 1 ? (node as Element) : parentAcrossShadow(node);
        element;
        element = parentAcrossShadow(element)
    ) {
        if (element.matches(selector)) {
            return element;
        }
    }

    return null;
}

export function containsAcrossShadow(root: Node, node: Node): boolean {
    for (
        let current: Node | null = node;
        current;
        current = shadowHost(current.getRootNode())
    ) {
        if (root.contains(current)) {
            return true;
        }
    }

    return false;
}

export function openShadowRoots(root: ParentNode): ShadowRoot[] {
    const roots: ShadowRoot[] = [];
    const visit = (parent: ParentNode): void => {
        for (const element of Array.from(parent.querySelectorAll('*'))) {
            if (element.shadowRoot) {
                roots.push(element.shadowRoot);
                visit(element.shadowRoot);
            }
        }
    };

    if ('shadowRoot' in root && root.shadowRoot) {
        roots.push(root.shadowRoot as ShadowRoot);
        visit(root.shadowRoot as ShadowRoot);
    }

    visit(root);

    return roots;
}

export function querySelectorAllDeep(root: ParentNode, selector: string): Element[] {
    return [root, ...openShadowRoots(root)].flatMap((parent) =>
        Array.from(parent.querySelectorAll(selector)),
    );
}

export function eventOrigin(event: Event): EventTarget | null {
    return event.composedPath()[0] ?? event.target;
}

export function deepActiveElement(document: Document): Element | null {
    let active = document.activeElement;

    while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
    }

    return active;
}
