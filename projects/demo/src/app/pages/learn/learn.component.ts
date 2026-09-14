/** Learner integration loads a validated scenario and starts observation after rendering the form.
 * Headless runtime evaluates screen/field state; only this Angular layer opens Taiga alerts.
 * DestroyRef disposes observation and alert subscriptions on navigation.
 */
import {DOCUMENT} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {RouterLink} from '@angular/router';
import {TuiNotificationService} from '@taiga-ui/core';
import {readScreenState, ScenarioRuntime, TrainingObserver, type TrainingProgress} from '@training-observer/core';
import {ScenarioStore} from '../../shared/recording/scenario-store';
import {ProcedureFormComponent} from '../procedure/procedure-form.component';
@Component({
    selector: 'app-learn', imports: [RouterLink, ProcedureFormComponent], providers: [TrainingObserver],
    template: `
        <main>
            <header data-training-observer-ignore>
                <h1>Тренировка</h1>
                @if (store.error()) { <p role="alert">{{ store.error() }}</p> }
                @if (store.saved(); as scenario) {
                    @if (progress(); as state) {
                        <p>{{ scenario.steps[state.step - 1].task }}</p>
                        <p aria-live="polite">Экран {{ state.step }} из {{ state.total }}. Выполнено полей: {{ state.completedFields }} из {{ state.requiredFields }}.</p>
                        @if (state.status === 'complete') { <p role="status">Тренировка завершена</p> }
                        @if (state.issue) { <p>{{ state.issue }}</p> }
                    }
                } @else { <p>Сначала создайте и сохраните сценарий в админке.</p><a routerLink="/record">Открыть запись</a> }
            </header>
            @if (store.saved()) { <app-procedure-form /> }
        </main>
    `,
    styles: 'main {max-width:65rem;margin:auto;padding:2rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnComponent {
    protected readonly store = inject(ScenarioStore);
    protected readonly progress = signal<TrainingProgress | null>(null);
    private readonly observer = inject(TrainingObserver);
    private readonly document = inject(DOCUMENT);
    private readonly alerts = inject(TuiNotificationService);
    private readonly destroy = inject(DestroyRef);
    private runtime: ScenarioRuntime | null = null;
    private readonly screen = computed(() => readScreenState(this.observer.snapshot(), this.observer.logicalControls(), {
        root: {tagName: 'section', attribute: {name: 'aria-label', value: 'Экран процедуры'}},
        identity: {kind: 'attribute', name: 'id'}, loading: {name: 'aria-busy', value: 'true'},
    }));
    constructor() {
        afterNextRender(() => {
            this.store.load();
            const scenario = this.store.saved();
            if (scenario) { this.runtime = new ScenarioRuntime(scenario); this.observer.start(this.document.body); }
        });
        effect(() => {
            const screen = this.screen();
            const confirmed = this.observer.confirmedControls();
            if (this.runtime) untracked(() => {
                const progress = this.runtime!.update(screen, confirmed);
                this.progress.set(progress);
                for (const message of progress.feedback) this.alerts.open(message, {
                    appearance: 'negative', label: 'Проверьте действие', autoClose: 5000,
                }).pipe(takeUntilDestroyed(this.destroy)).subscribe();
            });
        });
    }
}
