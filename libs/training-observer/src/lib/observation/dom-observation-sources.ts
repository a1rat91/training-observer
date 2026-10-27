import {openShadowRoots} from '../capture/dom-tree';

/** Browser-источники document и открытых shadow roots, включая non-composed events. */
export class DomObservationSources {
    private disposed = false;
    private readonly targets = new Map<Node, () => void>();

    constructor(
        private readonly document: Document,
        private readonly events: readonly string[],
        private readonly mutations: (records: readonly MutationRecord[]) => void,
        private readonly event: (event: Event) => void,
    ) {
        this.refresh();
    }

    /** Новые host обнаруживаются после DOM mutations, capture и при polling. */
    public refresh(): boolean {
        if (this.disposed) {
            return false;
        }

        const next = new Set<Node>([this.document, ...openShadowRoots(this.document)]);
        let changed = false;

        for (const [target, cleanup] of this.targets) {
            if (!next.has(target)) {
                cleanup();
                this.targets.delete(target);
                changed = true;
            }
        }

        for (const target of next) {
            if (!this.targets.has(target)) {
                this.connect(target);
                changed = true;
            }
        }

        return changed;
    }

    public dispose(): void {
        this.disposed = true;

        for (const cleanup of this.targets.values()) {
            cleanup();
        }

        this.targets.clear();
    }

    private connect(target: Node): void {
        const observer = new this.document.defaultView!.MutationObserver((records) => {
            this.mutations(records);

            if (records.some((record) => record.type === 'childList')) {
                this.refresh();
            }
        });

        observer.observe(target, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });

        const listener = (event: Event): void => {
            // Composed event уже обработан на самом внешнем наблюдаемом корне.
            const outermost = event
                .composedPath()
                .reverse()
                .find((node) => this.targets.has(node as Node));

            if (outermost === target) {
                this.event(event);
            }
        };

        for (const name of this.events) {
            target.addEventListener(name, listener, {capture: true, passive: true});
        }

        this.targets.set(target, () => {
            observer.disconnect();

            for (const name of this.events) {
                target.removeEventListener(name, listener, true);
            }
        });
    }
}
