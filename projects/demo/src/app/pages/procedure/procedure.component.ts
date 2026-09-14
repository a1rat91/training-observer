/**
 * Админка записи состояний: запускает наблюдение document.body и показывает экран/карточки только из публичных снимков.
 * Не читает состояние demo-формы через Angular. UI инспектора исключён; посещения и подсветка живут до DestroyRef.
 */
import {DOCUMENT, JsonPipe} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, computed, effect, inject, Injector, signal, untracked} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {type ControlSnapshot, DomHighlighter, readScreenState, ScreenVisitTracker, TrainingObserver, StateRecorder, type StateRecording, type RecordedEvent} from '@training-observer/core';
import {ScenarioEditorComponent} from '../../shared/recording/scenario-editor.component';
import {RecordingStore} from '../../shared/recording/recording-store';

import {ProcedureFormComponent} from './procedure-form.component';

@Component({
    selector: 'app-procedure',
    imports: [ProcedureFormComponent, JsonPipe, TuiButton, ScenarioEditorComponent],
    providers: [TrainingObserver, DomHighlighter],
    template: `
        <main>
            <header data-training-observer-ignore>
                <h1>Запись тренировки</h1>
                <p>Начните запись, заполните поля и перейдите по нужным экранам. Input, Select и ComboBox записываются после выхода из поля.</p>
                <p>Завершите запись, чтобы сохранить её в браузере. Затем создайте ожидания из записи и сохраните сценарий для ученика.</p>
                <button tuiButton size="s" type="button" [disabled]="recording() || screen().status !== 'ready'" (click)="startRecording()">Начать запись</button>
                <button tuiButton size="s" type="button" [disabled]="!recording() || stopping()" (click)="stopRecording()">Завершить запись</button>
                <p aria-live="polite">{{ stopping() ? 'Завершаем запись…' : recording() ? 'Идёт запись' : draft() ? 'Запись завершена' : 'Запись не начата' }}</p>
                @if (store.error()) { <p role="alert">{{ store.error() }}</p> }
                @if (draft(); as saved) {
                    <section aria-label="Журнал записи">
                        <h2>Записано: {{ saved.events.length }}</h2>
                        @if (!saved.complete) { <p>В записи есть пропуски наблюдения. Её потребуется уточнить перед тренировкой.</p> }
                        <ol>@for (event of saved.events; track event.sequence) {
                            <li>{{ eventText(event) }}</li>
                        }</ol>
                        <details><summary>JSON записи</summary><textarea aria-label="JSON записи" readonly [value]="draft() | json" rows="10"></textarea></details>
                    </section>
                    @if (!recording()) { <details><summary>Настроить тренировку</summary><app-scenario-editor [recording]="saved" /></details> }
                }
            </header>
            <div class="workspace">
                <app-procedure-form />
                <aside data-training-observer-ignore aria-label="Распознанный экран">
                    <h2>Что видит библиотека</h2>
                    <p role="status">{{ statuses[screen().status] }} · {{ screen().key ?? 'ID не определён' }}</p>
                    @if (screen().status !== 'ready') { <p>Причина: {{ screen().reason }}</p> }
                    @if (visit(); as current) { <p>Последнее готовое посещение: {{ current.number }} · {{ current.key }}</p> }
                    <p>Источник: снимок всей страницы. Контролов экрана: {{ screen().controls.length }}.</p>
                    @if (observer.error()) { <p role="alert">{{ observer.error() }}</p> }
                    @for (control of screen().controls; track control.id) {
                        <article [attr.aria-label]="typeNames[control.kind] + ' · ' + control.label">
                            <h3>{{ typeNames[control.kind] }} · {{ control.label || 'Без подписи' }}</h3>
                            @if (groupName(control)) { <p class="muted">Группа: {{ groupName(control) }}</p> }
                            <p>{{ needsBlur(control) ? 'Подтверждено после blur' : 'Сейчас в форме' }}:
                                <strong>{{ confirmedValue(control) }}</strong></p>
                            <p class="muted">{{ control.visible ? 'Виден' : 'Скрыт' }} · {{ control.state.disabled ? 'Заблокирован' : 'Доступен' }}
                                @if (control.state.readOnly) { · Только чтение }
                            </p>
                            <button tuiButton size="s" appearance="flat" type="button" (click)="selected.set(selected() === control.targetNodeId ? null : control.targetNodeId)">
                                {{ selected() === control.targetNodeId ? 'Убрать подсветку' : 'Показать в форме' }}
                            </button>
                        </article>
                    } @empty { <p>Пока нет распознанных контролов этого экрана.</p> }
                    <details><summary>Диагностика снимка</summary>
                        <p>Пересчётов: {{ observer.scanCount() }}. Публикаций: {{ observer.revision() }}.</p>
                        <pre>{{ screen() | json }}</pre>
                    </details>
                </aside>
            </div>
        </main>
    `,
    styles: 'main {max-width:1500px; margin:auto; padding:1.5rem;} .workspace {display:grid; grid-template-columns:minmax(0,1.3fr) minmax(20rem,1fr); gap:2rem; align-items:start;} aside {border:1px solid var(--tui-border-normal); padding:1rem; border-radius:1rem;} article {border-top:1px solid var(--tui-border-normal); padding-block:.75rem;} h3 {font-size:1rem;} p {line-height:1.5;} textarea {box-sizing:border-box; width:100%;} section[aria-label="Журнал записи"] {margin-block:1rem;} section[aria-label="Журнал записи"] ol {max-height:14rem; overflow:auto;} header button {margin-right:.75rem;} pre {white-space:pre-wrap; overflow-wrap:anywhere; max-height:30rem; overflow:auto;} .muted {color:var(--tui-text-secondary);} @media(max-width:950px) {.workspace {grid-template-columns:1fr;}}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureComponent {
    protected readonly store = inject(RecordingStore);
    private readonly recorder = new StateRecorder();
    private readonly injector = inject(Injector);
    protected readonly recording = signal(false);
    protected readonly stopping = signal(false);
    protected readonly draft = signal<StateRecording | null>(null);
    protected readonly observer = inject(TrainingObserver);
    private readonly document = inject(DOCUMENT);
    private readonly highlighter = inject(DomHighlighter);
    private readonly visits = new ScreenVisitTracker();
    protected readonly visit = signal<ReturnType<ScreenVisitTracker['update']>>(null);
    protected readonly selected = signal<string | null>(null);
    protected readonly screen = computed(() => readScreenState(this.observer.snapshot(), this.observer.logicalControls(), {
        root: {tagName: 'section', attribute: {name: 'aria-label', value: 'Экран процедуры'}},
        identity: {kind: 'attribute', name: 'id'}, loading: {name: 'aria-busy', value: 'true'},
    }));
    protected readonly statuses = {ready: 'Экран распознан', loading: 'Загрузка', unavailable: 'Экран недоступен', ambiguous: 'Найдено несколько экранов'};
    protected readonly typeNames = {textbox: 'Input', number: 'Number', button: 'Кнопка', select: 'Select', combobox: 'ComboBox', radio: 'Radio', checkbox: 'Checkbox', switch: 'Switch'};

    constructor() {
        afterNextRender(() => {
            this.store.load();
            this.draft.set(this.store.saved());
            this.observer.start(this.document.body);
        });
        effect(() => {
            const screen = this.screen();
            const confirmed = this.observer.confirmedControls();
            if (this.recording()) untracked(() => {
                this.recorder.observe(screen, confirmed);
                this.draft.set(this.recorder.snapshot());
            });
        });
        effect(() => this.visit.set(this.visits.update(this.screen())));
        effect(() => {
            const snapshot = this.observer.snapshot();
            const selected = this.selected();
            if (snapshot && selected && this.screen().controls.some((control) => control.targetNodeId === selected)) {
                this.highlighter.show(snapshot, this.screen().controls.map((control) => control.targetNodeId), selected);
            } else {
                this.highlighter.clear();
            }
        });
    }

    protected startRecording(): void {
        this.observer.flush();
        this.recorder.start(this.screen(), this.observer.confirmedControls());
        this.draft.set(this.recorder.snapshot());
        this.recording.set(true);
    }

    protected stopRecording(): void {
        this.stopping.set(true);
        afterNextRender(() => {
            this.observer.flush();
            this.recorder.observe(this.screen(), this.observer.confirmedControls());
            const recording = this.recorder.stop();
            this.recording.set(false);
            this.stopping.set(false);
            this.draft.set(recording);
            this.store.save(recording);
        }, {injector: this.injector});
    }

    protected eventText(event: RecordedEvent): string {
        const prefix = `Экран ${event.screenKey}, посещение ${event.visit}: `;
        if (event.kind === 'screen') return prefix + 'экран открыт';
        if (event.kind === 'unavailable') return prefix + (event.field ? event.field.label + ' — ' : '') + 'не удалось прочитать: ' + event.reason;
        const value = Array.isArray(event.value) ? event.value.join(', ') : typeof event.value === 'boolean'
            ? event.value ? 'Включён' : 'Выключен' : event.value || 'Пусто';
        return prefix + event.field?.label + ' — ' + value;
    }

    protected groupName(control: ControlSnapshot): string {
        return control.locatorHints.context.map((context) => context.label).filter(Boolean).join(' / ');
    }

    protected needsBlur(control: ControlSnapshot): boolean {
        return ['textbox', 'number', 'select', 'combobox'].includes(control.kind);
    }

    protected confirmedValue(control: ControlSnapshot): string {
        if (!this.needsBlur(control)) return this.value(control);
        const confirmed = this.observer.confirmedControls()[control.id];
        return confirmed ? this.value(confirmed) : 'Ожидает выхода из поля';
    }

    protected value(control: ControlSnapshot): string {
        if (control.state.redacted) return 'Значение скрыто';
        if (control.kind === 'button') return '—';
        if (control.choice) {
            return control.choice.selection.status === 'observed' ? control.choice.selection.labels.join(', ') || 'Не выбран'
                : `Выбор не подтверждён${control.choice.displayValue ? ': ' + control.choice.displayValue : ''}`;
        }
        if (control.state.indeterminate) return 'Смешанное состояние';
        if (typeof control.state.checked === 'boolean') return control.state.checked ? 'Включён' : 'Выключен';
        if (control.state.value === undefined) return 'Недоступно';
        return String(control.state.value) || 'Пусто';
    }
}
