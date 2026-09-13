import {HttpClient} from '@angular/common/http';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    NgZone,
    signal,
    type TemplateRef,
    viewChild,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {TuiAlertService, TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiTextarea} from '@taiga-ui/kit';
import {
    parseRecording,
    parseScenario,
    type Recording,
    type RuntimeSnapshot,
    ScenarioRuntime,
} from '@training-observer/core';
import {AreaRegistryService} from '@training-observer/core/angular';
import {catchError, of, Subscription, switchMap, tap} from 'rxjs';

import {RECORDING_IMPORT_KEY, SCENARIO_STORAGE_KEY} from '../scenario-storage';
import {DEMO_AREAS} from '../workspace/area-definitions';
import {ProcedureShellComponent} from '../workspace/procedure-shell.component';

@Component({
    standalone: true,
    selector: 'learn-page',
    imports: [
        FormsModule,
        ProcedureShellComponent,
        RouterLink,
        TuiButton,
        TuiTextarea,
        TuiTextfield,
    ],
    templateUrl: './learn-page.component.html',
    styleUrl: '../record/record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [AreaRegistryService],
})
export default class LearnPageComponent {
    private readonly feedbackText =
        viewChild.required<TemplateRef<{data: string}>>('feedbackText');

    private readonly alerts = inject(TuiAlertService);
    private feedbackSubscriptions = new Subscription();
    private readonly route = inject(ActivatedRoute);
    private readonly http = inject(HttpClient);
    private readonly workspace = viewChild.required(ProcedureShellComponent);
    private readonly areas = inject(AreaRegistryService);
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    private runtime?: ScenarioRuntime;
    private readonly router = inject(Router);

    public readonly loading = signal(false);
    public readonly example = signal(false);
    public readonly importedRecording = signal<Recording | null>(null);
    public readonly current = signal<RuntimeSnapshot | null>(null);
    public readonly error = signal('');
    public readonly hintVisible = signal(false);
    public source = '';
    public readonly expectationLabels = {
        inactive: 'Не требуется в этом состоянии',
        waiting: 'Ожидаем цель',
        ready: 'Доступно',
        editing: 'Завершите ввод',
        confirming: 'Ожидаем результат',
        satisfied: 'Выполнено',
        mismatch: 'Значение не совпадает',
        ambiguous: 'Неоднозначность',
        blocked: 'Ожидаем зависимости',
        skipped: 'Пропущено',
    };

    public readonly labels = {
        waiting: 'Ожидаем поле',
        ready: 'Выполните задание',
        confirming: 'Ожидаем подтверждение',
        ambiguous: 'Неоднозначность',
        broken: 'Не удалось проверить цель',
        timedOut: 'Время ожидания истекло',
        finalizing: 'Ожидаем итоговый результат',
        completed: 'Обучение завершено',
        stopped: 'Обучение остановлено',
    };

    constructor() {
        try {
            this.source = localStorage.getItem(SCENARIO_STORAGE_KEY) ?? '';
        } catch {
            this.error.set('Хранилище недоступно. Вставьте JSON сценария.');
        }

        this.destroyRef.onDestroy(() => {
            this.runtime?.stop();
            this.feedbackSubscriptions.unsubscribe();
        });
        afterNextRender(() => {
            const savedSource = this.source;

            this.route.queryParamMap
                .pipe(
                    tap((params) => {
                        this.stop();
                        this.current.set(null);
                        this.error.set('');
                        this.example.set(params.has('example'));
                        this.loading.set(true);
                        this.workspace().reset();
                    }),
                    switchMap((params) =>
                        params.has('example')
                            ? this.http
                                  .get('assets/example-scenario.json', {
                                      responseType: 'text',
                                  })
                                  .pipe(
                                      catchError(() => {
                                          this.error.set(
                                              'Не удалось загрузить готовый пример. Обновите страницу.',
                                          );

                                          return of('');
                                      }),
                                  )
                            : of(savedSource),
                    ),
                    takeUntilDestroyed(this.destroyRef),
                )
                .subscribe((source) => {
                    this.source = source;
                    this.loading.set(false);

                    if (source) {
                        this.start(this.workspace().surface().nativeElement);
                    }
                });
        });
    }

    public start(root: HTMLElement): void {
        this.runtime?.stop();
        this.feedbackSubscriptions.unsubscribe();
        this.feedbackSubscriptions = new Subscription();
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

            if (scenario.version === 2) {
                throw new Error(
                    'Сценарий v2 требует явной привязки целей к микрофронтам. Используйте bindScenarioAreas или создайте новую запись.',
                );
            }

            const required = new Set(
                scenario.areas.targets.map((entry) => entry.areaKey),
            );

            const registry = this.areas.connect(
                root,
                DEMO_AREAS.map((definition) => ({
                    ...definition,
                    observe: required.has(definition.key),
                })),
            );

            this.zone.runOutsideAngular(() => {
                this.runtime = new ScenarioRuntime(root, scenario, {
                    areas: registry,
                    routePairs: [
                        {recorded: '/record', current: '/learn'},
                        {recorded: '/spike/record', current: '/learn'},
                    ],
                    onFeedback: (event) =>
                        this.zone.run(() => {
                            // Template interpolation preserves author text; Taiga's string fallback uses innerHTML.
                            this.feedbackSubscriptions.add(
                                this.alerts
                                    .open(this.feedbackText(), {
                                        data: event.message,
                                        label: {
                                            success: 'Верно',
                                            error: 'Попробуйте иначе',
                                            allowed: 'Допустимое действие',
                                        }[event.outcome],
                                        appearance: {
                                            success: 'positive',
                                            error: 'negative',
                                            allowed: 'info',
                                        }[event.outcome],
                                    })
                                    .subscribe(),
                            );
                        }),
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
            void this.router.navigateByUrl('/record');
        } catch (error: unknown) {
            this.importedRecording.set(null);
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось передать запись',
            );
        }
    }

    public stop(): void {
        this.feedbackSubscriptions.unsubscribe();
        this.runtime?.stop();
    }

    public retry(): void {
        this.runtime?.retry();
    }

    public skip(id?: string): void {
        this.runtime?.skip(id);
    }

    public json(value: unknown): string {
        return JSON.stringify(value, null, 2);
    }
}
