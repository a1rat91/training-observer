import {DOCUMENT} from '@angular/common';
import {
    afterNextRender,
    type AfterRenderRef,
    DestroyRef,
    type EnvironmentInjector,
    inject,
    Injector,
    NgZone,
    signal,
} from '@angular/core';
import {
    DomHighlighter,
    type ObservationUpdate,
    provideDomObservation,
    TrainingObserver,
} from '@training-observer/core';

import {type TrainingIntegrationOptions} from './training-integration-options';

/** У записи и прохождения отдельные DI-сеансы даже в одном компоненте. */
export class ObservationConnection {
    private readonly document = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private readonly zone = inject(NgZone);
    // Angular 19 types this overload as Injector; its R3Injector owns destroy().
    private readonly child = Injector.create({
        providers: provideDomObservation(),
        parent: this.injector,
    }) as Injector & Pick<EnvironmentInjector, 'destroy'>;

    private readonly pending = new Map<AfterRenderRef, () => void>();
    private readonly failure = signal<string | null>(null);
    private watcher: MutationObserver | null = null;
    private root: Element | null = null;
    private enabled = false;
    private paused = false;
    private continuing = false;
    private destroyed = false;

    public readonly observer = this.child.get(TrainingObserver);
    public readonly highlighter = this.child.get(DomHighlighter);
    public readonly error = this.failure.asReadonly();

    constructor(
        private readonly options: TrainingIntegrationOptions,
        update: (value: ObservationUpdate) => void,
    ) {
        const subscription = this.observer.updates$.subscribe(update);

        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
            this.watcher?.disconnect();
            subscription.unsubscribe();

            for (const [ref, cancel] of this.pending) {
                ref.destroy();
                cancel();
            }

            this.pending.clear();
            this.child.destroy();
        });
        this.schedule(() => {
            if (!this.paused) {
                this.resume();
            }
        });
    }

    public assertAlive(): void {
        if (this.destroyed) {
            throw new Error('Training session has been destroyed.');
        }
    }

    public resume(): void {
        this.assertAlive();
        const view = this.document.defaultView;

        if (!view || !this.document.body) {
            return;
        }

        this.enabled = true;
        this.paused = false;
        this.zone.runOutsideAngular(() => {
            this.watcher ??= new view.MutationObserver(() =>
                // MutationObserver может быть поставлен в очередь раньше focusout microtask.
                queueMicrotask(() => {
                    try {
                        this.reconcile();
                    } catch (error: unknown) {
                        this.fail(error);
                    }
                }),
            );
            this.watcher.observe(this.document.body, {
                childList: true,
                subtree: true,
                attributes: typeof this.options.root === 'string',
            });
        });
        this.reconcile();
    }

    public pause(): void {
        this.paused = true;
        this.enabled = false;
        this.watcher?.disconnect();
        this.root = null;
        this.continuing = false;
        this.observer.stop();
        this.highlighter.clear();
    }

    public flush(): void {
        this.assertAlive();
        this.reconcile();
        this.observer.flush();
    }

    /** Новая попытка должна получить начальное состояние даже при том же DOM. */
    public capture(): void {
        this.flush();

        if (this.root) {
            this.observer.capture(this.root);
        } else {
            this.observer.clear();
        }
    }

    public schedule(action: () => void): void {
        void this.afterRender(action).catch((error: unknown) => {
            if (!this.destroyed) {
                this.fail(error);
            }
        });
    }

    public async afterRender<T>(action: () => Promise<T> | T): Promise<T> {
        this.assertAlive();

        return new Promise<T>((resolve, reject) => {
            const ref = afterNextRender(
                () => {
                    this.pending.delete(ref);

                    try {
                        this.assertAlive();
                        resolve(action());
                    } catch (error: unknown) {
                        reject(error instanceof Error ? error : new Error(String(error)));
                    }
                },
                {injector: this.injector},
            );

            this.pending.set(ref, () =>
                reject(new Error('Training session has been destroyed.')),
            );
        });
    }

    private reconcile(): void {
        if (!this.enabled || this.destroyed) {
            return;
        }

        const configured = this.options.root;
        const root =
            typeof configured === 'string'
                ? this.document.querySelector(configured)
                : (configured ?? this.document.body);

        const connected = root?.isConnected ? root : null;

        if (connected === this.root) {
            return;
        }

        if (this.continuing) {
            this.observer.reconnect(connected, this.options.observation);
        } else if (connected) {
            this.observer.start(connected, this.options.observation);
            this.continuing = true;
        } else {
            this.observer.clear();
        }

        this.root = connected;
        this.failure.set(null);
    }

    private fail(error: unknown): void {
        this.zone.run(() =>
            this.failure.set(error instanceof Error ? error.message : String(error)),
        );
    }
}
