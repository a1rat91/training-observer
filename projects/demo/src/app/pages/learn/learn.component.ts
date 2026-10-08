/** Интеграция ученика загружает валидный сценарий и запускает наблюдение после рендера формы. Runtime проверяет поля/экран, только этот Angular-слой вызывает Taiga Alerts. DestroyRef освобождает подписки при уходе. */
import {afterNextRender, ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {RouterLink} from '@angular/router';
import {TuiAlertService} from '@taiga-ui/core';
import {
    FeedbackKind,
    provideTrainingSession,
    TrainingSession,
} from '@training-observer/angular';
import {mergeMap} from 'rxjs';

import {ProcedureFormComponent} from '../../shared/demo-form/procedure-form.component';
import {PROCEDURE_SCREEN} from '../../shared/demo-form/procedure-screen';
import {ScenarioStore} from '../../shared/scenarios/scenario-store';

@Component({
    selector: 'app-learn',
    imports: [ProcedureFormComponent, RouterLink],
    templateUrl: './learn.component.html',
    styleUrl: './learn.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideTrainingSession({screen: PROCEDURE_SCREEN})],
})
export class LearnComponent {
    private readonly session = inject(TrainingSession);
    private readonly alerts = inject(TuiAlertService);

    protected readonly store = inject(ScenarioStore);
    protected readonly progress = this.session.progress;

    constructor() {
        this.session.feedback$
            .pipe(
                mergeMap((feedback) =>
                    this.alerts.open(feedback.message, {
                        appearance:
                            feedback.kind === FeedbackKind.Success
                                ? 'positive'
                                : 'negative',
                        label:
                            feedback.kind === FeedbackKind.Success
                                ? 'Верно'
                                : 'Проверьте действие',
                        autoClose: 5000,
                    }),
                ),
                takeUntilDestroyed(),
            )
            .subscribe();
        afterNextRender(() => {
            this.store.load();
            const scenario = this.store.saved();

            if (scenario) {
                this.session.start(scenario);
            }
        });
    }
}
