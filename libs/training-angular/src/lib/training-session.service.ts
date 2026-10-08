import {computed, DestroyRef, inject, Injectable, signal} from '@angular/core';
import {type TrainingScenario} from '@training-observer/contracts';
import {type ObservationUpdate, readScreenState} from '@training-observer/core';
import {
    ScenarioRuntime,
    type TrainingFeedback,
    type TrainingProgress,
} from '@training-observer/runtime';
import {Subject} from 'rxjs';

import {ObservationConnection} from './observation-connection';
import {TRAINING_SESSION_OPTIONS} from './training-integration-options';

/** Владелец попытки. UI вызывает бизнес-действия и получает readonly signals/feedback$. */
@Injectable()
export class TrainingSession {
    private readonly options = inject(TRAINING_SESSION_OPTIONS);
    private readonly currentScreen = signal(
        readScreenState(null, [], this.options.screen),
    );

    private readonly currentProgress = signal<TrainingProgress | null>(null);
    private readonly feedback = new Subject<TrainingFeedback>();
    private runtime: ScenarioRuntime | null = null;
    private generation = 0;
    private active = false;
    private readonly connection = new ObservationConnection(this.options, (update) =>
        this.accept(update),
    );

    public readonly screen = this.currentScreen.asReadonly();
    public readonly progress = this.currentProgress.asReadonly();
    public readonly feedback$ = this.feedback.asObservable();
    public readonly error = computed(
        () => this.connection.error() ?? this.connection.observer.error(),
    );

    constructor() {
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

            this.connection.resume();
            this.active = true;
            this.connection.capture();
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
        const screen = readScreenState(
            update.snapshot,
            update.controls,
            this.options.screen,
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
