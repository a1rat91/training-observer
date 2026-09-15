/** Интеграция ученика загружает валидный сценарий и запускает наблюдение после рендера формы. Runtime проверяет поля/экран, только этот Angular-слой вызывает Taiga Alerts. DestroyRef освобождает подписки при уходе. */
import {DOCUMENT} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {RouterLink} from '@angular/router';
import {TuiAlertService} from '@taiga-ui/core';
import {readScreenState, TrainingObserver} from '@training-observer/core';
import {ScenarioRuntime, type TrainingProgress} from '@training-observer/runtime';

import {ProcedureFormComponent} from '../../shared/demo-form/procedure-form.component';
import {ScenarioStore} from '../../shared/scenarios/scenario-store';

@Component({
    selector: 'app-learn',
    imports: [ProcedureFormComponent, RouterLink],
    templateUrl: './learn.component.html',
    styleUrl: './learn.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [TrainingObserver],
})
export class LearnComponent {
    private readonly observer = inject(TrainingObserver);
    private readonly document = inject(DOCUMENT);
    private readonly alerts = inject(TuiAlertService);
    private readonly destroy = inject(DestroyRef);
    private runtime: ScenarioRuntime | null = null;
    private readonly screen = computed(() =>
        readScreenState(this.observer.snapshot(), this.observer.logicalControls(), {
            root: {
                tagName: 'section',
                attribute: {name: 'aria-label', value: 'Экран процедуры'},
            },
            identity: {kind: 'attribute', name: 'id'},
            loading: {name: 'aria-busy', value: 'true'},
        }),
    );

    protected readonly store = inject(ScenarioStore);
    protected readonly progress = signal<TrainingProgress | null>(null);

    constructor() {
        afterNextRender(() => {
            this.store.load();
            const scenario = this.store.saved();

            if (scenario) {
                this.runtime = new ScenarioRuntime(scenario);
                this.observer.start(this.document.body);
            }
        });
        effect(() => {
            const screen = this.screen();
            const confirmed = this.observer.confirmedControls();

            if (this.runtime) {
                untracked(() => {
                    const progress = this.runtime!.update(screen, confirmed);

                    this.progress.set(progress);

                    for (const message of progress.feedback) {
                        this.alerts
                            .open(message, {
                                appearance: 'negative',
                                label: 'Проверьте действие',
                                autoClose: 5000,
                            })
                            .pipe(takeUntilDestroyed(this.destroy))
                            .subscribe();
                    }
                });
            }
        });
    }
}
