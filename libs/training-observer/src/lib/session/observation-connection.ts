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
import {asapScheduler, Observable, observeOn, Subject, takeUntil, tap} from 'rxjs';

import {DomHighlighter} from '../highlight/dom-highlighter';
import {
    BLUR_CONFIRMATION_CONTEXT,
    type ConfirmationContextReader,
    screenConfirmationContext,
} from '../observation/confirmation-context';
import {provideDomObservation} from '../provide-dom-observation';
import {SCREEN_ADAPTERS} from '../tokens/screen-adapters';
import {TrainingObserver} from '../training-observer';
import {type ObservationSessionOptions} from './observation-session-options';
import {readSessionScreen} from './read-session-screen';

/** У записи и прохождения отдельные DI-сеансы даже в одном компоненте. */
export class ObservationConnection {
    private readonly document = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private readonly zone = inject(NgZone);
    // Angular 19 types this overload as Injector; its R3Injector owns destroy().
    private readonly child = Injector.create({
        providers: [
            provideDomObservation(),
            {
                provide: BLUR_CONFIRMATION_CONTEXT,
                useFactory: (): ConfirmationContextReader => {
                    const adapters = inject(SCREEN_ADAPTERS);

                    return (snapshot, controls) =>
                        screenConfirmationContext(
                            readSessionScreen(
                                snapshot,
                                controls,
                                this.options.screen,
                                adapters,
                            ),
                        );
                },
            },
        ],
        parent: this.injector,
    }) as Injector & Pick<EnvironmentInjector, 'destroy'>;

    private readonly pending = new Map<AfterRenderRef, () => void>();
    private readonly mutations = new Subject<void>();
    private readonly shutdown = new Subject<void>();
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
    public readonly updates$ = this.observer.updates$.pipe(takeUntil(this.shutdown));

    constructor(private readonly options: ObservationSessionOptions) {
        this.mutations
            .pipe(observeOn(asapScheduler), takeUntil(this.shutdown))
            .subscribe(() => {
                try {
                    this.reconcile();
                } catch (error: unknown) {
                    this.fail(error);
                }
            });

        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;
            // Child teardown clears its snapshot; that is not another business update.
            this.shutdown.next();
            this.shutdown.complete();
            this.watcher?.disconnect();
            this.mutations.complete();

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

    /** Синхронно публикует исходное состояние после pause, включая отсутствующий root. */
    public resume(): void {
        this.assertAlive();
        const view = this.document.defaultView;

        if (!view || !this.document.body) {
            return;
        }

        this.enabled = true;
        this.paused = false;
        this.zone.runOutsideAngular(() => {
            // MutationObserver может быть поставлен в очередь раньше focusout microtask.
            this.watcher ??= new view.MutationObserver(() => this.mutations.next());
            this.watcher.observe(this.document.body, {
                childList: true,
                subtree: true,
                attributes: typeof this.options.root === 'string',
            });
        });
        this.reconcile(true);
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

    public schedule(action: () => void): void {
        this.afterRender()
            .pipe(tap(action))
            .subscribe({
                error: (error: unknown) => {
                    if (!this.destroyed) {
                        this.fail(error);
                    }
                },
            });
    }

    public afterRender(): Observable<void> {
        return new Observable<void>((subscriber) => {
            this.assertAlive();

            const ref = afterNextRender(
                () => {
                    this.pending.delete(ref);

                    try {
                        this.assertAlive();
                        subscriber.next();
                        subscriber.complete();
                    } catch (error: unknown) {
                        subscriber.error(
                            error instanceof Error ? error : new Error(String(error)),
                        );
                    }
                },
                {injector: this.injector},
            );

            this.pending.set(ref, () =>
                subscriber.error(new Error('Training session has been destroyed.')),
            );

            return () => {
                ref.destroy();
                this.pending.delete(ref);
            };
        });
    }

    private reconcile(publishMissing = false): void {
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
            if (publishMissing && !connected) {
                this.observer.clear();
            }

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
