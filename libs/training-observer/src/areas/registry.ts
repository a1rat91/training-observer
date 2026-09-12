/**
 * AreaRegistry — browser adapter без UI: находит экземпляры MF и определяет владельца узла.
 * Алгоритм: ищет только заданные host-теги в scope, проверяет контекст предков, затем одновременно
 * вычисляет конфликты определений. Для ownership выбирает ближайший известный host, включая
 * выключенные и неоднозначные области: они не передают события включённому родителю.
 * MutationObserver следит за структурой и атрибутами контекста, не читая значения controls.
 * Перед синхронным чтением обрабатывает очередь мутаций. stop отключает observer и очищает DOM-ссылки.
 */
import {type AreaDefinition, type AreaOwner, type AreaSnapshot} from './types';

interface Entry {
    definition: AreaDefinition;
    roots: Element[];
    snapshot: AreaSnapshot;
}

export class AreaRegistry {
    private readonly entries: Entry[];
    private scope?: Element;
    private observer?: MutationObserver;
    private readonly listeners = new Set<() => void>();

    constructor(definitions: readonly AreaDefinition[]) {
        const keys = new Set<string>();
        const tag = /^[a-z][a-z0-9-]*$/;

        this.entries = definitions.map((definition) => {
            if (!definition.key.trim() || keys.has(definition.key)) {
                throw new Error(`Duplicate or empty area key: ${definition.key}`);
            }

            if (
                !tag.test(definition.hostTag) ||
                (definition.context && !tag.test(definition.context.ancestorTag))
            ) {
                throw new Error(
                    `Area ${definition.key}: use an existing tag name, not a CSS selector`,
                );
            }

            keys.add(definition.key);
            const copy: AreaDefinition = {
                ...definition,
                context: definition.context
                    ? {
                          ...definition.context,
                          attributes: {...definition.context.attributes},
                      }
                    : undefined,
            };

            return {
                definition: copy,
                roots: [],
                snapshot: Object.freeze({
                    key: copy.key,
                    status: 'missing',
                    generation: 0,
                    matches: 0,
                    observe: copy.observe,
                }),
            };
        });
    }

    public start(scope: Element): void {
        this.stop();
        this.scope = scope;
        const Observer = scope.ownerDocument.defaultView?.MutationObserver;

        if (!Observer) {
            throw new Error('AreaRegistry requires a browser document');
        }

        this.observer = new Observer((records) => this.refresh(records));
        const attributes = [
            ...new Set(
                this.entries.flatMap((entry) =>
                    Object.keys(entry.definition.context?.attributes ?? {}),
                ),
            ),
        ];

        this.observer.observe(scope, {
            childList: true,
            subtree: true,
            ...(attributes.length ? {attributes: true, attributeFilter: attributes} : {}),
        });
        this.refresh([]);
    }

    public stop(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.scope = undefined;
        let changed = false;

        for (const entry of this.entries) {
            if (entry.roots.length) {
                entry.roots = [];
                entry.snapshot = Object.freeze({
                    ...entry.snapshot,
                    status: 'missing',
                    matches: 0,
                    generation: entry.snapshot.generation + 1,
                });
                changed = true;
            }
        }

        if (changed) {
            this.notify();
        }
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public snapshots(): readonly AreaSnapshot[] {
        this.flush();

        return this.entries.map((entry) => entry.snapshot);
    }

    public setObserved(key: string, observe: boolean): void {
        this.flush();
        const entry = this.entries.find((item) => item.definition.key === key);

        if (!entry) {
            throw new Error(`Unknown area: ${key}`);
        }

        if (entry.definition.observe === observe) {
            return;
        }

        entry.definition = {...entry.definition, observe};
        entry.snapshot = Object.freeze({
            ...entry.snapshot,
            observe,
            generation: entry.snapshot.generation + 1,
        });
        this.notify();
    }

    public root(key: string): Element | null {
        this.flush();
        const entry = this.entries.find((item) => item.definition.key === key);

        return entry?.snapshot.status === 'resolved' ? entry.roots[0]! : null;
    }

    public owner(node: Node): AreaOwner {
        this.flush();

        if (!this.scope?.contains(node)) {
            return {status: 'outside'};
        }

        for (
            let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
            element;
            element = element.parentElement
        ) {
            const entries = this.entries.filter((entry) => entry.roots.includes(element));

            if (entries.length) {
                if (entries.length !== 1 || entries[0]!.snapshot.status !== 'resolved') {
                    return {
                        status: 'ambiguous',
                        keys: entries.map((entry) => entry.definition.key),
                    };
                }

                const area = entries[0]!.snapshot;

                return {status: area.observe ? 'owned' : 'excluded', area};
            }

            if (element === this.scope) {
                break;
            }
        }

        return {status: 'outside'};
    }

    public accepts(key: string, node: Node): boolean {
        const owner = this.owner(node);

        return owner.status === 'owned' && owner.area.key === key;
    }

    private flush(): void {
        const records = this.observer?.takeRecords() ?? [];

        if (records.length) {
            this.refresh(records);
        }
    }

    private refresh(records: readonly MutationRecord[]): void {
        const scope = this.scope;

        if (!scope) {
            return;
        }

        const candidates = this.entries.map(({definition}) => {
            const roots = [...scope.querySelectorAll(definition.hostTag)];

            if (scope.localName === definition.hostTag) {
                roots.unshift(scope);
            }

            return roots.filter((root) => this.matchesContext(root, definition, scope));
        });

        let changed = false;

        this.entries.forEach((entry, index) => {
            const roots = candidates[index]!;
            const conflict = roots.some((root) =>
                candidates.some(
                    (other, otherIndex) => otherIndex !== index && other.includes(root),
                ),
            );

            let status: AreaSnapshot['status'] = 'missing';

            if (conflict) {
                status = 'conflict';
            } else if (roots.length > 1) {
                status = 'ambiguous';
            } else if (roots.length === 1) {
                status = 'resolved';
            }

            const removed = entry.roots.some((root) =>
                records.some((record) =>
                    [...record.removedNodes].some(
                        (node) => node === root || node.contains(root),
                    ),
                ),
            );

            const different =
                roots.length !== entry.roots.length ||
                roots.some((root) => !entry.roots.includes(root));

            if (different || removed || status !== entry.snapshot.status) {
                entry.roots = roots;
                entry.snapshot = Object.freeze({
                    ...entry.snapshot,
                    status,
                    matches: roots.length,
                    generation: entry.snapshot.generation + 1,
                });
                changed = true;
            }
        });

        if (changed) {
            this.notify();
        }
    }

    private matchesContext(
        root: Element,
        definition: AreaDefinition,
        scope: Element,
    ): boolean {
        const context = definition.context;

        if (!context) {
            return true;
        }

        // The discovery scope bounds context too; attributes outside it cannot silently change ownership.
        if (root === scope) {
            return false;
        }

        for (
            let ancestor = root.parentElement;
            ancestor;
            ancestor = ancestor.parentElement
        ) {
            if (
                ancestor.localName === context.ancestorTag &&
                Object.entries(context.attributes).every(
                    ([name, value]) => ancestor.getAttribute(name) === value,
                )
            ) {
                return true;
            }

            if (ancestor === scope) {
                break;
            }
        }

        return false;
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
