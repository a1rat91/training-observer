/**
 * Админка записи состояний: запускает наблюдение document.body и показывает экран/карточки только из публичных снимков.
 * Не читает состояние demo-формы через Angular. UI инспектора исключён; посещения и подсветка живут до DestroyRef.
 */
import {DOCUMENT, JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    Injector,
    signal,
    untracked,
} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {type RecordedEvent, type StateRecording} from '@training-observer/contracts';
import {
    type ControlSnapshot,
    DomHighlighter,
    provideDomObservation,
    readScreenState,
    ScreenVisitTracker,
    TrainingObserver,
} from '@training-observer/core';
import {
    recordingProblem,
    removeRecordedEvent,
    StateRecorder,
} from '@training-observer/recording';

import {ProcedureFormComponent} from '../../shared/demo-form/procedure-form.component';
import {RecordingStore} from './recording-store';
import {ScenarioEditorComponent} from './scenario-editor.component';

@Component({
    selector: 'app-procedure',
    imports: [JsonPipe, ProcedureFormComponent, ScenarioEditorComponent, TuiButton],
    templateUrl: './record-page.component.html',
    styleUrl: './record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideDomObservation(), DomHighlighter],
})
export class RecordPageComponent {
    private readonly recorder = new StateRecorder();
    private readonly injector = inject(Injector);
    private readonly document = inject(DOCUMENT);
    private readonly highlighter = inject(DomHighlighter);
    private readonly visits = new ScreenVisitTracker();

    protected readonly store = inject(RecordingStore);
    protected readonly recording = signal(false);
    protected readonly stopping = signal(false);
    protected readonly draft = signal<StateRecording | null>(null);
    protected readonly undoHistory = signal<readonly StateRecording[]>([]);
    protected readonly editProblem = computed(() => {
        const draft = this.draft();

        return draft ? recordingProblem(draft) : '';
    });

    protected readonly observer = inject(TrainingObserver);
    protected readonly visit = signal<ReturnType<ScreenVisitTracker['update']>>(null);
    protected readonly selected = signal<string | null>(null);
    protected readonly screen = computed(() =>
        readScreenState(this.observer.snapshot(), this.observer.logicalControls(), {
            root: {
                tagName: 'section',
                attribute: {name: 'aria-label', value: 'Экран процедуры'},
            },
            identity: {kind: 'attribute', name: 'id'},
            loading: {name: 'aria-busy', value: 'true'},
        }),
    );

    protected readonly statuses = {
        ready: 'Экран распознан',
        loading: 'Загрузка',
        unavailable: 'Экран недоступен',
        ambiguous: 'Найдено несколько экранов',
    };

    protected readonly typeNames = {
        textbox: 'Input',
        number: 'Number',
        button: 'Кнопка',
        select: 'Select',
        combobox: 'ComboBox',
        radio: 'Radio',
        checkbox: 'Checkbox',
        switch: 'Switch',
    };

    constructor() {
        afterNextRender(() => {
            this.store.load();
            this.draft.set(this.store.saved());
            this.observer.start(this.document.body);
        });
        effect(() => {
            const screen = this.screen();
            const confirmed = this.observer.confirmedControls();

            if (this.recording()) {
                untracked(() => {
                    this.recorder.observe(screen, confirmed);
                    this.draft.set(this.recorder.snapshot());
                });
            }
        });
        effect(() => this.visit.set(this.visits.update(this.screen())));
        effect(() => {
            const snapshot = this.observer.snapshot();
            const selected = this.selected();

            if (
                snapshot &&
                selected &&
                this.screen().controls.some(
                    (control) => control.targetNodeId === selected,
                )
            ) {
                this.highlighter.show(
                    snapshot,
                    this.screen().controls.map((control) => control.targetNodeId),
                    selected,
                );
            } else {
                this.highlighter.clear();
            }
        });
    }

    protected startRecording(): void {
        this.undoHistory.set([]);
        this.observer.flush();
        this.recorder.start(this.screen(), this.observer.confirmedControls());
        this.draft.set(this.recorder.snapshot());
        this.recording.set(true);
    }

    protected deleteEvent(sequence: number): void {
        const recording = this.draft();

        if (!recording || this.recording()) {
            return;
        }

        const edited = removeRecordedEvent(recording, sequence);

        this.undoHistory.update((history) => [...history, recording]);
        this.draft.set(edited);
        this.store.save(edited);
    }

    protected undoDeletion(): void {
        if (this.recording()) {
            return;
        }

        const atCompatValue = this.undoHistory();
        const previous = atCompatValue[atCompatValue.length - 1];

        if (!previous) {
            return;
        }

        this.undoHistory.update((history) => history.slice(0, -1));
        this.draft.set(previous);
        this.store.save(previous);
    }

    protected stopRecording(): void {
        this.stopping.set(true);
        afterNextRender(
            () => {
                this.observer.flush();
                this.recorder.observe(this.screen(), this.observer.confirmedControls());
                const recording = this.recorder.stop();

                this.recording.set(false);
                this.stopping.set(false);
                this.draft.set(recording);
                this.store.save(recording);
            },
            {injector: this.injector},
        );
    }

    protected eventText(event: RecordedEvent): string {
        const prefix = `Экран ${event.screenKey}, посещение ${event.visit}: `;

        if (event.kind === 'screen') {
            return `${prefix}экран открыт`;
        }

        if (event.kind === 'unavailable') {
            return `${prefix}${event.field ? `${event.field.label} — ` : ''}не удалось прочитать: ${event.reason}`;
        }

        let value: string;

        if (Array.isArray(event.value)) {
            value = event.value.join(', ');
        } else if (typeof event.value === 'boolean') {
            value = event.value ? 'Включён' : 'Выключен';
        } else {
            value = String(event.value || 'Пусто');
        }

        return `${prefix + event.field?.label} — ${value}`;
    }

    protected groupName(control: ControlSnapshot): string {
        return control.locatorHints.context
            .map((context) => context.label)
            .filter(Boolean)
            .join(' / ');
    }

    protected needsBlur(control: ControlSnapshot): boolean {
        return ['combobox', 'number', 'select', 'textbox'].includes(control.kind);
    }

    protected confirmedValue(control: ControlSnapshot): string {
        if (!this.needsBlur(control)) {
            return this.value(control);
        }

        const confirmed = this.observer.confirmedControls()[control.id];

        return confirmed ? this.value(confirmed) : 'Ожидает выхода из поля';
    }

    protected value(control: ControlSnapshot): string {
        if (control.state.redacted) {
            return 'Значение скрыто';
        }

        if (control.kind === 'button') {
            return '—';
        }

        if (control.kind === 'combobox' && control.choice) {
            return control.choice.displayValue || 'Пусто';
        }

        if (control.choice) {
            return control.choice.selection.status === 'observed'
                ? control.choice.selection.labels.join(', ') || 'Не выбран'
                : `Выбор не подтверждён${control.choice.displayValue ? `: ${control.choice.displayValue}` : ''}`;
        }

        if (control.state.indeterminate) {
            return 'Смешанное состояние';
        }

        if (typeof control.state.checked === 'boolean') {
            return control.state.checked ? 'Включён' : 'Выключен';
        }

        return control.state.value === undefined
            ? 'Недоступно'
            : String(control.state.value) || 'Пусто';
    }
}
