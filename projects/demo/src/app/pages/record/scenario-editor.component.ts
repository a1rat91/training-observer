/** Редактор явно компилирует завершённый журнал, хранит независимый от снимков черновик и публикует ожидания/сообщения ученику. Пропуски наблюдения блокируют компиляцию. */
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TuiButton, TuiCheckbox, TuiInput } from '@taiga-ui/core';
import { compileScenario } from '@training-observer/recording';
import {
    type StateRecording,
    type TrainingScenario,
    type FieldExpectation,
} from '@training-observer/contracts';
import { ScenarioStore } from '../../shared/scenarios/scenario-store';
@Component({
    selector: 'app-scenario-editor',
    imports: [FormsModule, RouterLink, TuiButton, TuiInput, TuiCheckbox],
    templateUrl: './scenario-editor.component.html',
    styleUrl: './scenario-editor.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioEditorComponent {
    readonly recording = input.required<StateRecording>();
    protected readonly store = inject(ScenarioStore);
    protected readonly draft = signal<TrainingScenario | null>(null);
    protected readonly error = signal('');
    protected readonly published = signal(false);
    protected readonly fromSaved = signal(false);
    private readonly source = signal('');
    protected readonly sourceChanged = computed(
        () => !!this.source() && this.source() !== JSON.stringify(this.recording()),
    );
    private readonly fieldEdits = new Map<string, Partial<FieldExpectation>>();
    private readonly stepEdits = new Map<number, { task?: string; transitionMessage?: string }>();
    private sourceVisits: number[] = [];
    constructor() {
        afterNextRender(() => {
            this.store.load();
            this.draft.set(this.store.saved());
            this.fromSaved.set(!!this.store.saved());
            this.source.set(this.store.saved() ? this.store.savedSource() || 'unlinked' : '');
        });
    }
    protected compile(): void {
        try {
            const recording = this.recording();
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
                    ...this.stepEdits.get(this.sourceVisits[index]),
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
            this.error.set(e instanceof Error ? e.message : 'Не удалось создать сценарий.');
            this.published.set(false);
        }
    }
    private fieldKey(index: number, field: FieldExpectation): string {
        return JSON.stringify([this.sourceVisits[index], field.descriptor]);
    }
    protected editStep(index: number, key: 'task' | 'transitionMessage', value: string): void {
        if (this.sourceChanged() || this.error()) return;
        if (!this.fromSaved())
            this.stepEdits.set(this.sourceVisits[index], {
                ...this.stepEdits.get(this.sourceVisits[index]),
                [key]: value,
            });
        this.draft.update(
            (s) =>
                s && {
                    ...s,
                    steps: s.steps.map((step, i) => (i === index ? { ...step, [key]: value } : step)),
                },
        );
        this.published.set(false);
    }
    protected edit(si: number, fi: number, patch: Partial<FieldExpectation>): void {
        if (this.sourceChanged() || this.error()) return;
        const field = this.draft()?.steps[si]?.fields[fi];
        if (field && !this.fromSaved()) {
            const key = this.fieldKey(si, field);
            this.fieldEdits.set(key, { ...this.fieldEdits.get(key), ...patch });
        }
        this.draft.update(
            (s) =>
                s && {
                    ...s,
                    steps: s.steps.map((step, i) =>
                        i === si
                            ? {
                                  ...step,
                                  fields: step.fields.map((f, j) => (j === fi ? { ...f, ...patch } : f)),
                              }
                            : step,
                    ),
                },
        );
        this.published.set(false);
    }
    protected isBoolean(f: FieldExpectation): boolean {
        return typeof f.expected === 'boolean';
    }
    protected isArray(f: FieldExpectation): boolean {
        return f.descriptor.kind !== 'combobox' && Array.isArray(f.expected);
    }
    protected textValue(f: FieldExpectation): string {
        return Array.isArray(f.expected) ? f.expected.join('; ') : String(f.expected);
    }
    protected setValue(si: number, fi: number, field: FieldExpectation, value: string): void {
        this.edit(si, fi, {
            expected:
                field.descriptor.kind === 'combobox'
                    ? value
                        ? [value]
                        : []
                    : Array.isArray(field.expected)
                      ? value
                          ? value.split(';').map((v) => v.trim())
                          : []
                      : value,
        });
    }
    protected publish(): void {
        const draft = this.draft();
        if (draft && !this.sourceChanged() && !this.error()) {
            this.store.save(draft, this.source());
            this.published.set(!this.store.error());
        }
    }
}
