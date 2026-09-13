/**
 * Общий индекс ARIA-связей document для выбора option. Учитывает всех владельцев, включая
 * ненаблюдаемые области, но не читает значения controls. Связь доказывается существующим ID;
 * несколько владельцев, повторный ID и ссылка на общий контейнер нескольких listbox дают отказ.
 * Перед синхронным intent/commit забирает MutationObserver.takeRecords(), поэтому изменения
 * в том же стеке не остаются незамеченными. Последний release освобождает observer и DOM-ссылки.
 * Индекс подтверждает dropdown, но не присваивает произвольные dialogs/overlay целой области.
 */
export interface PortalProof {
    readonly owner: Element;
    readonly popup: Element;
    readonly id: string;
    readonly ownerGeneration: number;
    readonly popupGeneration: number;
    readonly session: number;
}

export type PortalResolution =
    | {readonly status: 'ambiguous' | 'unsupported'}
    | {readonly status: 'resolved'; readonly proof: PortalProof};

const indexes = new WeakMap<Document, PortalOwnership>();
const attributes = ['id', 'aria-controls', 'aria-owns', 'role'];

export class PortalOwnership {
    private users = 0;
    private session = 0;
    private observer?: MutationObserver;
    private dirty = true;
    private readonly ids = new Map<string, Element[]>();
    private readonly claims = new Map<string, Set<Element>>();
    private removals = new WeakMap<Element, number>();

    private constructor(private readonly document: Document) {}

    public static forDocument(document: Document): PortalOwnership {
        let index = indexes.get(document);

        if (!index) {
            index = new PortalOwnership(document);
            indexes.set(document, index);
        }

        return index;
    }

    public acquire(): () => void {
        if (!this.users++) {
            this.session++;
            this.dirty = true;
            const Observer = this.document.defaultView!.MutationObserver;

            this.observer = new Observer((records) => this.invalidate(records));
            this.observer.observe(this.document, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: attributes,
            });
        }

        let active = true;

        return () => {
            if (!active) {
                return;
            }

            active = false;

            if (--this.users) {
                return;
            }

            this.observer?.disconnect();
            this.observer = undefined;
            this.ids.clear();
            this.claims.clear();
            this.removals = new WeakMap();
            this.dirty = true;
        };
    }

    public byId(id: string): Element | null {
        this.flush();
        const elements = this.ids.get(id) ?? [];

        return elements.length === 1 ? elements[0]! : null;
    }

    public resolveOption(option: Element): PortalResolution {
        this.flush();

        if (!option.isConnected || option.ownerDocument !== this.document) {
            return {status: 'unsupported'};
        }

        const proofs: PortalProof[] = [];
        let conflict = false;

        for (const [id, owners] of this.claims) {
            const targets = this.ids.get(id) ?? [];
            const popup = targets.find((target) => target.contains(option));

            if (!popup) {
                continue;
            }

            // A shared overlay is not a dropdown: its unrelated listboxes cannot acquire one owner.
            conflict ||=
                targets.length !== 1 ||
                popup.querySelectorAll('[role="listbox"]').length > 1;

            for (const owner of owners) {
                proofs.push({
                    session: this.session,
                    owner,
                    popup,
                    id,
                    ownerGeneration: this.generation(owner),
                    popupGeneration: this.generation(popup),
                });
            }
        }

        const owners = new Set(proofs.map((proof) => proof.owner));

        if (conflict || owners.size > 1) {
            return {status: 'ambiguous'};
        }

        if (!proofs.length) {
            return {status: 'unsupported'};
        }

        // Prefer the narrowest proven subtree when one control links to both a wrapper and its listbox.
        const proof = proofs.find((entry) =>
            proofs.every((other) => other.popup.contains(entry.popup)),
        )!;

        return {status: 'resolved', proof};
    }

    /** Закрытие исходного popup допустимо. Повторное использование ID/новый конкурент отменяет pending intent. */
    public valid(proof: PortalProof): boolean {
        this.flush();

        if (
            !this.users ||
            proof.session !== this.session ||
            !proof.owner.isConnected ||
            proof.owner.ownerDocument !== this.document ||
            this.generation(proof.owner) !== proof.ownerGeneration
        ) {
            return false;
        }

        const removed = this.generation(proof.popup) - proof.popupGeneration;

        if (removed > 1 || (removed > 0 && proof.popup.isConnected)) {
            return false;
        }

        const targets = this.ids.get(proof.id) ?? [];
        const owners = this.claims.get(proof.id) ?? new Set<Element>();

        if (
            targets.some((target) => target !== proof.popup) ||
            targets.length > 1 ||
            [...owners].some((owner) => owner !== proof.owner)
        ) {
            return false;
        }

        if (proof.popup.isConnected) {
            if (proof.popup.id !== proof.id) {
                return false;
            }

            // Include claims to enclosing containers, not just the original ID.
            for (const [id, claimants] of this.claims) {
                if (
                    (this.ids.get(id) ?? []).some((target) =>
                        target.contains(proof.popup),
                    ) &&
                    [...claimants].some((owner) => owner !== proof.owner)
                ) {
                    return false;
                }
            }
        }

        return true;
    }

    private flush(): void {
        if (!this.users) {
            return;
        }

        this.invalidate(this.observer?.takeRecords() ?? []);

        if (!this.dirty) {
            return;
        }

        this.dirty = false;
        this.ids.clear();
        this.claims.clear();

        for (const element of this.document.querySelectorAll(
            '[id],[aria-controls],[aria-owns]',
        )) {
            if (element.id) {
                const elements = this.ids.get(element.id) ?? [];

                elements.push(element);
                this.ids.set(element.id, elements);
            }

            const references =
                `${element.getAttribute('aria-controls') ?? ''} ${element.getAttribute('aria-owns') ?? ''}`
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean);

            for (const id of references) {
                const owners = this.claims.get(id) ?? new Set<Element>();

                owners.add(element);
                this.claims.set(id, owners);
            }
        }
    }

    private generation(element: Element): number {
        const generation = this.removals.get(element) ?? 0;

        this.removals.set(element, generation);

        return generation;
    }

    private invalidate(records: readonly MutationRecord[]): void {
        this.dirty ||= records.length > 0;

        for (const record of records) {
            for (const node of record.removedNodes) {
                if (node.nodeType !== 1) {
                    continue;
                }

                const element = node as Element;

                for (const removed of [element, ...element.querySelectorAll('*')]) {
                    if (this.removals.has(removed)) {
                        this.removals.set(removed, this.removals.get(removed)! + 1);
                    }
                }
            }
        }
    }
}
