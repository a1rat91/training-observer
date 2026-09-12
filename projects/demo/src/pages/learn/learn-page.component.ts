import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    NgZone,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiTextarea} from '@taiga-ui/kit';
import {
    parseRecording,
    parseScenario,
    type Recording,
    type RuntimeSnapshot,
    ScenarioRuntime,
} from '@training-observer/core';

import {RECORDING_IMPORT_KEY, SCENARIO_STORAGE_KEY} from '../scenario-storage';
import {ProcedureShellComponent} from '../workspace/procedure-shell.component';

@Component({
    standalone: true,
    selector: 'learn-page',
    imports: [FormsModule, ProcedureShellComponent, TuiButton, TuiTextarea, TuiTextfield],
    templateUrl: './learn-page.component.html',
    styleUrl: '../record/record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LearnPageComponent {
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    private runtime?: ScenarioRuntime;
    private readonly router = inject(Router);

    public readonly importedRecording = signal<Recording | null>(null);
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
        this.importedRecording.set(null);

        try {
            const document: unknown = JSON.parse(this.source);

            if (
                document &&
                typeof document === 'object' &&
                'kind' in document &&
                document.kind === 'training-recording'
            ) {
                this.importedRecording.set(parseRecording(this.source));
                this.error.set(
                    'Это запись действий, а не учебный сценарий. Подготовьте из неё сценарий: выберите признак завершения и проверьте задания.',
                );

                return;
            }

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

    public prepareRecording(): void {
        try {
            const recording = parseRecording(this.source);

            sessionStorage.setItem(RECORDING_IMPORT_KEY, JSON.stringify(recording));
            void this.router.navigateByUrl('/spike/record');
        } catch (error: unknown) {
            this.importedRecording.set(null);
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось передать запись',
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
