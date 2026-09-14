/** Admin editor compiles the finished journal explicitly, keeps drafts independent from scans,
 * and publishes typed expectations and feedback for the learner. Unknown observations block compilation.
 */
import {afterNextRender, ChangeDetectionStrategy, Component, computed, inject, input, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {TuiButton, TuiCheckbox, TuiInput} from '@taiga-ui/core';
import {compileScenario, type StateRecording, type TrainingScenario, type FieldExpectation} from '@training-observer/core';
import {ScenarioStore} from './scenario-store';
@Component({
    selector: 'app-scenario-editor',
    imports: [FormsModule, RouterLink, TuiButton, TuiInput, TuiCheckbox],
    template: `
        <section aria-label="Редактор сценария">
            <h2>Ожидания и обратная связь</h2>
            <p>Создайте ожидания из записи. Для каждого поля используется последнее подтверждённое значение на этом экране.</p>
            <button tuiButton size="s" type="button" (click)="compile()">Создать ожидания из записи</button>
            @if (sourceChanged()) { <p>Запись изменена или не связана с загруженным сценарием. Пересоздайте ожидания из записи перед сохранением сценария. Настройки текущего черновика сохранятся для оставшихся полей; ранее загруженный сценарий будет заменён.</p> }
            @if (error()) { <p role="alert">{{ error() }}</p> }
            @if (fromSaved()) { <p>Загружен ранее сохранённый сценарий. Кнопка «Создать ожидания из записи» заменит его в редакторе новой записью.</p> }
            @if (draft(); as scenario) {
                @for (step of scenario.steps; track $index; let si = $index) {
                    <fieldset [disabled]="sourceChanged() || !!error()"><legend>Экран {{ si + 1 }} · {{ step.key }}</legend>
                        <tui-textfield><label tuiLabel>Задание экрана {{ si + 1 }}</label>
                            <input tuiInput [attr.aria-label]="'Задание экрана ' + (si + 1)" [ngModel]="step.task" (ngModelChange)="editStep(si, 'task', $event)" /></tui-textfield>
                        <tui-textfield><label tuiLabel>Ошибка перехода {{ si + 1 }}</label>
                            <input tuiInput [attr.aria-label]="'Ошибка перехода ' + (si + 1)" [ngModel]="step.transitionMessage" (ngModelChange)="editStep(si, 'transitionMessage', $event)" /></tui-textfield>
                        @for (field of step.fields; track $index; let fi = $index) {
                            <div class="expectation">
                                <h3>{{ field.descriptor.label }}</h3>
                                @if (isBoolean(field)) {
                                    <label><input tuiCheckbox type="checkbox" [ngModel]="field.expected" (ngModelChange)="edit(si, fi, {expected: $event})" /> Ожидаемая отметка</label>
                                } @else {
                                    <tui-textfield><label tuiLabel>Ожидание: {{ field.descriptor.label }}</label>
                                        <input tuiInput [attr.aria-label]="'Ожидание: ' + field.descriptor.label" [ngModel]="textValue(field)" (ngModelChange)="setValue(si, fi, field, $event)" /></tui-textfield>
                                    @if (isArray(field)) { <small>Названия выбранных вариантов разделяются точкой с запятой.</small> }
                                }
                                <tui-textfield><label tuiLabel>Ошибка: {{ field.descriptor.label }}</label>
                                    <input tuiInput [attr.aria-label]="'Ошибка: ' + field.descriptor.label" [ngModel]="field.message" (ngModelChange)="edit(si, fi, {message: $event})" /></tui-textfield>
                                <label><input tuiCheckbox type="checkbox" [ngModel]="field.optional" (ngModelChange)="edit(si, fi, {optional: $event})" /> Не проверять это поле</label>
                            </div>
                        }
                    </fieldset>
                }
                <button tuiButton size="s" type="button" [disabled]="sourceChanged() || !!error()" (click)="publish()">Сохранить сценарий для ученика</button>
                @if (published() && !sourceChanged() && !error()) { <p>Сценарий сохранён. <a routerLink="/learn">Перейти к тренировке</a></p> }
            }
            @if (store.error()) { <p role="alert">{{ store.error() }}</p> }
        </section>
    `,
    styles: 'fieldset {border:1px solid var(--tui-border-normal);border-radius:.75rem;margin:1rem 0;padding:1rem;} tui-textfield {margin:.75rem 0;} .expectation {padding:.5rem 0;} label {display:flex;align-items:center;gap:.5rem;} small {display:block;}',
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
    protected readonly sourceChanged = computed(() => !!this.source() && this.source() !== JSON.stringify(this.recording()));
    private readonly fieldEdits = new Map<string, Partial<FieldExpectation>>();
    private readonly stepEdits = new Map<number, {task?: string; transitionMessage?: string}>();
    private sourceVisits: number[] = [];
    constructor() { afterNextRender(() => { this.store.load(); this.draft.set(this.store.saved()); this.fromSaved.set(!!this.store.saved()); this.source.set(this.store.saved() ? this.store.savedSource() || 'unlinked' : ''); }); }
    protected compile(): void {
        try {
            const recording = this.recording();
            const compiled = compileScenario(recording);
            // A loaded publication has no proven relationship to the current journal.
            if (this.fromSaved()) { this.fieldEdits.clear(); this.stepEdits.clear(); }
            this.sourceVisits = recording.events.filter(event => event.kind === 'screen').map(event => event.visit);
            this.draft.set({...compiled, steps: compiled.steps.map((step, index) => ({...step,
                ...this.stepEdits.get(this.sourceVisits[index]),
                fields: step.fields.map(field => ({...field, ...this.fieldEdits.get(this.fieldKey(index, field))})),
            }))});
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
        if (!this.fromSaved()) this.stepEdits.set(this.sourceVisits[index], {...this.stepEdits.get(this.sourceVisits[index]), [key]: value});
        this.draft.update(s => s && ({...s, steps: s.steps.map((step, i) => i === index ? {...step, [key]: value} : step)}));
        this.published.set(false);
    }
    protected edit(si: number, fi: number, patch: Partial<FieldExpectation>): void {
        if (this.sourceChanged() || this.error()) return;
        const field = this.draft()?.steps[si]?.fields[fi];
        if (field && !this.fromSaved()) {
            const key = this.fieldKey(si, field);
            this.fieldEdits.set(key, {...this.fieldEdits.get(key), ...patch});
        }
        this.draft.update(s => s && ({...s, steps: s.steps.map((step, i) => i === si ? {...step,
            fields: step.fields.map((f, j) => j === fi ? {...f, ...patch} : f)} : step)}));
        this.published.set(false);
    }
    protected isBoolean(f: FieldExpectation): boolean { return typeof f.expected === 'boolean'; }
    protected isArray(f: FieldExpectation): boolean { return Array.isArray(f.expected); }
    protected textValue(f: FieldExpectation): string { return Array.isArray(f.expected) ? f.expected.join('; ') : String(f.expected); }
    protected setValue(si: number, fi: number, field: FieldExpectation, value: string): void {
        this.edit(si, fi, {expected: Array.isArray(field.expected) ? value ? value.split(';').map(v => v.trim()) : [] : value});
    }
    protected publish(): void {
        const draft = this.draft();
        if (draft && !this.sourceChanged() && !this.error()) { this.store.save(draft, this.source()); this.published.set(!this.store.error()); }
    }
}
