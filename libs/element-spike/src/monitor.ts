import {included} from './dom';
import {type ElementDescriptor, type ObservationOptions, type Resolution} from './model';
import {type ElementResolver} from './resolver';

/** Invalidates observations, never treats a DOM mutation as a semantic action. */
export class DomMonitor {
    private observer?: MutationObserver;
    private readonly listeners = new Set<() => void>();

    public revision = 0;
    public mutationCount = 0;

    constructor(
        private readonly root: Document | Element,
        private readonly options: ObservationOptions = {},
    ) {}

    public start(): void {
        if (this.observer) {
            return;
        }

        this.observer = new MutationObserver((records) => {
            const relevant = records.filter((record) => {
                const target =
                    record.target.nodeType === 1
                        ? (record.target as Element)
                        : record.target.parentElement;

                return target && included(target, this.options);
            });

            if (!relevant.length) {
                return;
            }

            this.revision++;
            this.mutationCount += relevant.length;
            this.listeners.forEach((listener) => listener());
        });
        this.observer.observe(this.root, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public stop(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.listeners.clear();
    }
}

/** Re-resolves every check: a detached node is never kept as the training target. */
export async function waitForResolution(
    resolver: ElementResolver,
    descriptor: ElementDescriptor,
    root: Document | Element,
    options: {
        timeoutMs?: number;
        stableMs?: number;
        signal?: AbortSignal;
        excludedRoots?: readonly Element[];
    } = {},
): Promise<Resolution> {
    const monitor = new DomMonitor(root, options);

    monitor.start();

    return new Promise((resolve) => {
        const start = performance.now();
        let stableSince = start;
        let previous: Element | undefined;
        let timer: ReturnType<typeof setTimeout>;
        let finished = false;
        const done = (result: Resolution): void => {
            if (finished) {
                return;
            }

            finished = true;
            clearTimeout(timer);
            monitor.stop();
            options.signal?.removeEventListener('abort', abort);
            resolve(result);
        };

        function abort(): void {
            done({
                status: 'broken',
                reason: 'Resolution cancelled',
                candidates: [],
                attempts: [],
            });
        }

        const check = (): void => {
            if (finished) {
                return;
            }

            const result = resolver.resolve(descriptor, root);
            const now = performance.now();

            if (!result.element || result.element !== previous) {
                stableSince = now;
            }

            previous = result.element;

            if (
                result.status === 'resolved' &&
                now - stableSince >= (options.stableMs ?? 80)
            ) {
                return done(result);
            }

            if (now - start >= (options.timeoutMs ?? 1500)) {
                return done(
                    result.status === 'resolved'
                        ? {
                              ...result,
                              status: 'broken',
                              element: undefined,
                              reason: 'Target did not stabilize before timeout',
                          }
                        : result,
                );
            }

            timer = setTimeout(check, 30); // Also sees property/CSS changes with no DOM mutation.
        };

        monitor.subscribe(() => {
            stableSince = performance.now();
        });
        options.signal?.addEventListener('abort', abort, {once: true});

        if (options.signal?.aborted) {
            abort();
        } else {
            check();
        }
    });
}

export interface ObservableState {
    connected: boolean;
    value?: string;
    checked?: boolean;
    selected?: string[];
    expanded?: string;
    selectedAria?: string;
}

/** State belongs to a completion predicate, not to the element fingerprint. */
export function readState(element: Element, captureValues = false): ObservableState {
    const state: ObservableState = {connected: element.isConnected};
    const sensitive = element.matches(
        'input[type="password"],input[type="file"],[autocomplete="current-password"],[autocomplete="new-password"]',
    );

    if (captureValues && !sensitive) {
        if ('value' in element) {
            state.value = (element as HTMLInputElement).value;
        }

        if (element.matches('[contenteditable="true"]')) {
            state.value = element.textContent ?? '';
        }

        if ('checked' in element) {
            state.checked = (element as HTMLInputElement).checked;
        }

        if (element.matches('select')) {
            state.selected = [...(element as HTMLSelectElement).selectedOptions].map(
                (option) => option.value,
            );
        }
    }

    if (element.hasAttribute('aria-expanded')) {
        state.expanded = element.getAttribute('aria-expanded')!;
    }

    if (element.hasAttribute('aria-selected')) {
        state.selectedAria = element.getAttribute('aria-selected')!;
    }

    return state;
}
