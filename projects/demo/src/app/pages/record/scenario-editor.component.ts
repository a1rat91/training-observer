/** Редактор получает ожидания из завершённого журнала или импортированной публикации.
 * Хранит независимый от снимков черновик, применяет правки карточек и явно публикует результат.
 * Пропуски наблюдения блокируют компиляцию; импорт не требует местного журнала.
 */
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {
    type FieldExpectation,
    type StateRecording,
    type TrainingScenario,
} from '@training-observer/contracts';
import {compileScenario} from '@training-observer/recording';

import {ScenarioStore} from '../../shared/scenarios/scenario-store';
import {ExpectationCardComponent} from './expectation-card.component';
import {ScenarioTransferComponent} from './scenario-transfer.component';

@Component({
    selector: 'app-scenario-editor',
    imports: [
        ExpectationCardComponent,
        FormsModule,
        RouterLink,
        ScenarioTransferComponent,
        TuiButton,
        TuiTextfield,
    ],
    templateUrl: './scenario-editor.component.html',
    styleUrl: './scenario-editor.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioEditorComponent {
    private readonly source = signal('');
    private readonly fieldEdits = new Map<string, Partial<FieldExpectation>>();
    private readonly stepEdits = new Map<
        number,
        {task?: string; transitionMessage?: string}
    >();

    private sourceVisits: number[] = [];

    protected readonly store = inject(ScenarioStore);
    protected readonly draft = signal<TrainingScenario | null>(null);
    protected readonly error = signal('');
    protected readonly published = signal(false);
    protected readonly fromSaved = signal(false);

    protected readonly sourceChanged = computed(
        () => !!this.source() && this.source() !== JSON.stringify(this.recording()),
    );

    public readonly recording = input<StateRecording | null>(null);

    constructor() {
        afterNextRender(() => {
            this.store.load();
            this.loadPublication();
        });
    }

    protected loadPublication(): void {
        this.fieldEdits.clear();
        this.stepEdits.clear();
        this.sourceVisits = [];
        this.draft.set(this.store.saved());
        this.fromSaved.set(!!this.store.saved());
        // Импорт не связан с локальным журналом, но допускает независимое редактирование.
        this.source.set(this.store.savedSource());
        this.error.set('');
        this.published.set(false);
    }

    protected compile(): void {
        try {
            const recording = this.recording();

            if (!recording) {
                return;
            }

            const compiled = compileScenario(recording);

            // У загруженной публикации не доказана связь с текущим журналом.
            if (this.fromSaved()) {
                this.fieldEdits.clear();
                this.stepEdits.clear();
            }

            this.sourceVisits = recording.events
                .filter((event) => event.kind === 'screen')
                .map((event) => event.visit);
            this.draft.set({
                ...compiled,
                steps: compiled.steps.map((step, index) => ({
                    ...step,
                    ...this.stepEdits.get(this.sourceVisits[index] ?? -1),
                    fields: step.fields.map((field) => ({
                        ...field,
                        ...this.fieldEdits.get(this.fieldKey(index, field)),
                    })),
                })),
            });
            this.source.set(JSON.stringify(recording));
            this.fromSaved.set(false);
            this.error.set('');
            this.published.set(false);
        } catch (e) {
            this.error.set(
                e instanceof Error ? e.message : 'Не удалось создать сценарий.',
            );
            this.published.set(false);
        }
    }

    protected editStep(
        index: number,
        key: 'task' | 'transitionMessage',
        value: string,
    ): void {
        if (this.sourceChanged() || this.error()) {
            return;
        }

        const visit = this.sourceVisits[index];

        if (!this.fromSaved() && visit !== undefined) {
            this.stepEdits.set(visit, {
                ...this.stepEdits.get(visit),
                [key]: value,
            });
        }

        this.draft.update(
            (s) =>
                s && {
                    ...s,
                    steps: s.steps.map((step, i) =>
                        i === index ? {...step, [key]: value} : step,
                    ),
                },
        );
        this.published.set(false);
    }

    protected edit(si: number, fi: number, patch: Partial<FieldExpectation>): void {
        if (this.sourceChanged() || this.error()) {
            return;
        }

        const field = this.draft()?.steps[si]?.fields[fi];

        if (field && !this.fromSaved()) {
            const key = this.fieldKey(si, field);

            this.fieldEdits.set(key, {...this.fieldEdits.get(key), ...patch});
        }

        this.draft.update(
            (s) =>
                s && {
                    ...s,
                    steps: s.steps.map((step, i) =>
                        i === si
                            ? {
                                  ...step,
                                  fields: step.fields.map((f, j) =>
                                      j === fi ? {...f, ...patch} : f,
                                  ),
                              }
                            : step,
                    ),
                },
        );
        this.published.set(false);
    }

    protected publish(): void {
        const draft = this.draft();

        if (draft && !this.sourceChanged() && !this.error()) {
            this.store.save(draft, this.source());
            this.published.set(!this.store.error());
        }
    }

    private fieldKey(index: number, field: FieldExpectation): string {
        return JSON.stringify([this.sourceVisits[index], field.descriptor]);
    }
}
