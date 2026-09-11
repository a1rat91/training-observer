import {describeElement} from './descriptor';
import {actionTarget} from './dom';
import {
    type ElementDescriptor,
    type ObservationOptions,
    type SemanticAction,
} from './model';

export class ElementRecorder {
    private readonly cleanup: Array<() => void> = [];
    private pending?: {element: Element; action: SemanticAction};
    private timer?: ReturnType<typeof setTimeout>;
    private lastUrl = '';

    constructor(
        private readonly root: Document | Element,
        private readonly emit: (action: SemanticAction) => void,
        private readonly options: ObservationOptions & {
            captureValues?: boolean;
            inputDebounceMs?: number;
        } = {},
    ) {}

    public capture(element: Element): ElementDescriptor {
        return describeElement(element, this.root, this.options);
    }

    public start(): void {
        if (this.cleanup.length) {
            return;
        }

        const listen = (
            target: EventTarget,
            type: string,
            listener: EventListener,
        ): void => {
            target.addEventListener(type, listener, true);
            this.cleanup.push(() => target.removeEventListener(type, listener, true));
        };

        for (const type of ['click', 'input', 'change', 'compositionend']) {
            listen(this.root, type, (event) => this.record(event));
        }

        const doc =
            this.root.nodeType === 9 ? (this.root as Document) : this.root.ownerDocument!;

        const win = doc.defaultView!;

        this.lastUrl = this.url(win);

        const navigation = (): void => {
            const url = this.url(win);

            if (url === this.lastUrl) {
                return;
            }

            this.flush();
            this.lastUrl = url;
            this.emit({kind: 'navigation', url, timestamp: Date.now()});
        };

        listen(win, 'popstate', navigation);
        listen(win, 'hashchange', navigation);
        // Read-only fallback for pushState/replaceState: no monkey patching of host methods.
        const interval = setInterval(navigation, 100);

        this.cleanup.push(() => clearInterval(interval));
    }

    public stop(): void {
        this.flush();
        this.cleanup.splice(0).forEach((dispose) => dispose());
    }

    private url(win: Window): string {
        return `${win.location.pathname}${win.location.hash}`;
    }

    private flush(): void {
        clearTimeout(this.timer);
        const pending = this.pending;

        this.pending = undefined;

        if (pending) {
            this.emit(pending.action);
        }
    }

    private record(event: Event): void {
        if (event instanceof InputEvent && event.isComposing) {
            return;
        }

        const element = actionTarget(event, this.root, this.options);

        if (!element) {
            return;
        }

        const selection = element.matches(
            'select,input[type="checkbox"],input[type="radio"]',
        );

        const editable = element.matches('input,textarea,[contenteditable="true"]');

        if (
            (event.type === 'click' && (selection || editable)) ||
            (event.type === 'input' && selection)
        ) {
            return;
        } // Native change supplies committed state.

        if (event.type !== 'click' && !selection && !editable) {
            return;
        }

        let kind: 'click' | 'input' | 'select';

        if (event.type === 'click') {
            kind = element.matches('[role="option"]') ? 'select' : 'click';
        } else {
            kind = selection ? 'select' : 'input';
        }

        const sensitive = element.matches(
            'input[type="password"],input[type="file"],[autocomplete="current-password"],[autocomplete="new-password"]',
        );

        let value: string[] | boolean | string | undefined;

        if (kind !== 'click' && this.options.captureValues && !sensitive) {
            if (element.matches('input[type="checkbox"],input[type="radio"]')) {
                value = (element as HTMLInputElement).checked;
            } else if (element.matches('select')) {
                value = [...(element as HTMLSelectElement).selectedOptions].map(
                    (option) => option.value,
                );
            } else if ('value' in element) {
                value = (element as HTMLInputElement).value;
            } else {
                value = element.textContent ?? '';
            }
        }

        const action: SemanticAction = {
            kind,
            descriptor: this.capture(element),
            value,
            redacted: kind !== 'click' && (!this.options.captureValues || sensitive),
            timestamp: Date.now(),
        };

        if (kind === 'input') {
            if (this.pending && this.pending.element !== element) {
                this.flush();
            }

            // input + change/compositionend in the same editing burst produce one action.
            this.pending = {element, action};
            clearTimeout(this.timer);
            this.timer = setTimeout(
                () => this.flush(),
                this.options.inputDebounceMs ?? 250,
            );
        } else {
            this.flush();
            this.emit(action);
        }
    }
}
