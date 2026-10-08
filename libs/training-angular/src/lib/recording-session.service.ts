import {computed, inject, Injectable, signal} from '@angular/core';
import {type StateRecording} from '@training-observer/contracts';
import {
    type ObservationUpdate,
    readScreenState,
    ScreenVisitTracker,
} from '@training-observer/core';
import {type ScreenVisit} from '@training-observer/core/models';
import {StateRecorder} from '@training-observer/recording';

import {ObservationConnection} from './observation-connection';
import {RECORDING_SESSION_OPTIONS} from './training-integration-options';

/** Одна запись на владельца DI. Наблюдение готовится после рендера и живёт до DestroyRef. */
@Injectable()
export class RecordingSession {
    private readonly options = inject(RECORDING_SESSION_OPTIONS);
    private readonly recorder = new StateRecorder();
    private readonly visits = new ScreenVisitTracker();
    private readonly currentScreen = signal(
        readScreenState(null, [], this.options.screen),
    );

    private readonly currentVisit = signal<ScreenVisit | null>(null);
    private readonly document = signal<StateRecording | null>(null);
    private readonly running = signal(false);
    private readonly finishing = signal(false);
    private selected: string | null = null;
    private pendingStop: Promise<StateRecording> | null = null;
    private readonly connection = new ObservationConnection(this.options, (update) =>
        this.accept(update),
    );

    public readonly screen = this.currentScreen.asReadonly();
    public readonly visit = this.currentVisit.asReadonly();
    public readonly draft = this.document.asReadonly();
    public readonly recording = this.running.asReadonly();
    public readonly stopping = this.finishing.asReadonly();
    public readonly error = computed(
        () => this.connection.error() ?? this.connection.observer.error(),
    );

    public readonly snapshot = this.connection.observer.snapshot;
    public readonly controls = this.connection.observer.logicalControls;
    public readonly confirmedControls = this.connection.observer.confirmedControls;
    public readonly scanCount = this.connection.observer.scanCount;
    public readonly revision = this.connection.observer.revision;

    public start(): void {
        this.connection.assertAlive();

        if (this.finishing()) {
            throw new Error('Дождитесь завершения записи.');
        }

        this.connection.flush();
        this.recorder.start(this.screen(), this.confirmedControls());
        this.document.set(this.recorder.snapshot());
        this.running.set(true);
    }

    /** Дожидается focusout и следующего рендера. Само stop не подтверждает активное поле. */
    public async stop(): Promise<StateRecording> {
        this.connection.assertAlive();

        if (this.pendingStop) {
            return this.pendingStop;
        }

        if (!this.running()) {
            return Promise.resolve(this.recorder.snapshot());
        }

        this.finishing.set(true);
        this.pendingStop = this.connection
            .afterRender(async () => {
                // Рендер может завершиться в том же turn, что и focusout перед Stop.
                await Promise.resolve();
                this.connection.flush();
                this.recorder.observe(this.screen(), this.confirmedControls());
                const result = this.recorder.stop();

                this.running.set(false);
                this.document.set(result);

                return result;
            })
            .finally(() => {
                this.finishing.set(false);
                this.pendingStop = null;
            });

        return this.pendingStop;
    }

    /** Подсветка для редактора без доступа к внутреннему observer. */
    public highlight(nodeId: string | null): void {
        this.connection.assertAlive();
        this.selected = nodeId;
        this.refreshHighlight();
    }

    private accept(update: ObservationUpdate): void {
        const screen = readScreenState(
            update.snapshot,
            update.controls,
            this.options.screen,
        );

        this.currentScreen.set(screen);
        this.currentVisit.set(this.visits.update(screen));

        if (this.running()) {
            this.recorder.observe(screen, update.confirmedControls);
            this.document.set(this.recorder.snapshot());
        }

        // Начальное null приходит синхронно, ещё до присваивания connection.
        if (this.connection) {
            this.refreshHighlight();
        }
    }

    private refreshHighlight(): void {
        const snapshot = this.snapshot();
        const targets = this.screen().controls.map((control) => control.targetNodeId);

        if (snapshot && this.selected && targets.includes(this.selected)) {
            this.connection.highlighter.show(snapshot, targets, this.selected);
        } else {
            this.connection.highlighter.clear();
        }
    }
}
