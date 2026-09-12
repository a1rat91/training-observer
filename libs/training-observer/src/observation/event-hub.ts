/**
 * Общий capture-dispatch для document. Первый подписчик устанавливает listeners, последний снимает.
 * Передаёт исходный Event синхронно, сохраняя порядок intent/commit; фильтрация областей выполняется
 * подписчиком до чтения controls. WeakMap разделяется потребителями одного экземпляра библиотеки.
 */
const EVENT_TYPES = [
    'click',
    'keydown',
    'input',
    'change',
    'blur',
    'compositionstart',
    'compositionend',
] as const;

const hubs = new WeakMap<Document, DocumentEventHub>();

export class DocumentEventHub {
    private readonly subscribers = new Set<(event: Event) => void>();

    private constructor(private readonly document: Document) {}

    public static forDocument(document: Document): DocumentEventHub {
        let hub = hubs.get(document);

        if (!hub) {
            hub = new DocumentEventHub(document);
            hubs.set(document, hub);
        }

        return hub;
    }

    public subscribe(listener: (event: Event) => void): () => void {
        if (!this.subscribers.size) {
            for (const type of EVENT_TYPES) {
                this.document.addEventListener(type, this.dispatch, true);
            }
        }

        this.subscribers.add(listener);

        let active = true;

        return () => {
            if (!active) {
                return;
            }

            active = false;
            this.subscribers.delete(listener);

            if (!this.subscribers.size) {
                for (const type of EVENT_TYPES) {
                    this.document.removeEventListener(type, this.dispatch, true);
                }
            }
        };
    }

    private readonly dispatch = (event: Event): void => {
        const listeners = Array.from(this.subscribers);

        for (const listener of listeners) {
            if (this.subscribers.has(listener)) {
                try {
                    listener(event);
                } catch (error) {
                    queueMicrotask(() => {
                        throw error;
                    });
                }
            }
        }
    };
}
