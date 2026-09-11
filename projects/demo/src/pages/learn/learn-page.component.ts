import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    NgZone,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiTextarea} from '@taiga-ui/kit';

import {parseScenario} from '../../../../../libs/element-spike/src/contracts';
import {
    type RuntimeSnapshot,
    ScenarioRuntime,
} from '../../../../../libs/element-spike/src/runtime';
import ProcedurePageComponent from '../procedure/procedure-page.component';
import {SCENARIO_STORAGE_KEY} from '../scenario-storage';

@Component({
    standalone: true,
    selector: 'learn-page',
    imports: [FormsModule, ProcedurePageComponent, TuiButton, TuiTextarea, TuiTextfield],
    templateUrl: './learn-page.component.html',
    styleUrl: '../record/record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LearnPageComponent {
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    private runtime?: ScenarioRuntime;

    public readonly current = signal<RuntimeSnapshot | null>(null);
    public readonly error = signal('');
    public readonly hintVisible = signal(false);
    public source = '';
    public readonly labels = {
        waiting: 'Ожидаем поле',
        ready: 'Выполните задание',
        confirming: 'Ожидаем подтверждение',
        ambiguous: 'Неоднозначность',
        broken: 'Не удалось проверить цель',
        timedOut: 'Время ожидания истекло',
        finalizing: 'Ожидаем результат процедуры',
        completed: 'Обучение завершено',
        stopped: 'Обучение остановлено',
    };

    constructor() {
        try {
            this.source = localStorage.getItem(SCENARIO_STORAGE_KEY) ?? '';
        } catch {
            this.error.set('Хранилище недоступно. Вставьте JSON сценария.');
        }

        this.destroyRef.onDestroy(() => this.runtime?.stop());
    }

    public start(root: HTMLElement): void {
        this.runtime?.stop();
        this.current.set(null);
        this.error.set('');
        this.hintVisible.set(false);

        try {
            const scenario = parseScenario(this.source);

            this.zone.runOutsideAngular(() => {
                this.runtime = new ScenarioRuntime(root, scenario, {
                    routePairs: [{recorded: '/spike/record', current: '/spike/learn'}],
                    onUpdate: (snapshot) =>
                        this.zone.run(() => {
                            if (snapshot.stepId !== this.current()?.stepId) {
                                this.hintVisible.set(false);
                            }

                            this.current.set(snapshot);
                        }),
                });
                this.runtime.start();
            });
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось запустить сценарий',
            );
        }
    }

    public stop(): void {
        this.runtime?.stop();
    }

    public retry(): void {
        this.runtime?.retry();
    }

    public skip(): void {
        this.runtime?.skip();
    }

    public json(value: unknown): string {
        return JSON.stringify(value, null, 2);
    }
}
