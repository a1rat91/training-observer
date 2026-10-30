import {computed, DestroyRef, inject, Injectable, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {type TrainingScenario} from '@training-observer/contracts';
import {
    type ObservationUpdate,
    readSessionScreen,
    SCREEN_ADAPTERS,
} from '@training-observer/core';
import {Subject} from 'rxjs';

import {ScenarioRuntime} from './scenario-runtime';
import {type TrainingFeedback, type TrainingProgress} from './training-progress';
import {TRAINING_CONNECTION, TRAINING_SESSION_OPTIONS} from './training-session-tokens';

/** Владелец попытки. UI вызывает бизнес-действия и получает readonly signals/feedback$. */
@Injectable()
export class TrainingSession {
    private readonly options = inject(TRAINING_SESSION_OPTIONS);
    private readonly screenAdapters = inject(SCREEN_ADAPTERS);
    private readonly currentScreen = signal(
        readSessionScreen(null, [], this.options.screen, this.screenAdapters),
    );

    private readonly currentProgress = signal<TrainingProgress | null>(null);
    private readonly feedback = new Subject<TrainingFeedback>();
    private runtime: ScenarioRuntime | null = null;
    private generation = 0;
    private active = false;
    private readonly connection = inject(TRAINING_CONNECTION);

    public readonly screen = this.currentScreen.asReadonly();
    public readonly progress = this.currentProgress.asReadonly();
    public readonly feedback$ = this.feedback.asObservable();
    public readonly error = computed(
        () => this.connection.error() ?? this.connection.observer.error(),
    );

    constructor() {
        this.connection.updates$
            .pipe(takeUntilDestroyed())
            .subscribe((update) => this.accept(update));
        inject(DestroyRef).onDestroy(() => this.feedback.complete());
    }

    public start(scenario: TrainingScenario): void {
        this.connection.assertAlive();
        this.runtime = new ScenarioRuntime(scenario);
        this.active = false;
        this.connection.pause();
        this.currentProgress.set(null);
        const generation = ++this.generation;

        this.connection.schedule(() => {
            if (generation !== this.generation) {
                return;
            }

            this.active = true;

            try {
                this.connection.resume();
            } catch (error: unknown) {
                this.active = false;
                throw error;
            }
        });
    }

    public stop(): void {
        this.connection.assertAlive();
        this.generation++;
        this.active = false;
        this.runtime = null;
        this.currentProgress.set(null);
        this.connection.pause();
    }

    private accept(update: ObservationUpdate): void {
        const screen = readSessionScreen(
            update.snapshot,
            update.controls,
            this.options.screen,
            this.screenAdapters,
        );

        this.currentScreen.set(screen);

        if (!this.active || !this.runtime) {
            return;
        }

        const progress = this.runtime.update(screen, update.confirmedControls);

        this.currentProgress.set(progress);

        for (const feedback of progress.feedback) {
            this.feedback.next(feedback);
        }
    }
}
