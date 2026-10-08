/**
 * Админка записи состояний: запускает наблюдение document.body и показывает экран/карточки только из публичных снимков.
 * UI владеет редактированием и хранением документа; Angular-пакет — наблюдением, записью и подсветкой.
 */
import {JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {provideRecordingSession, RecordingSession} from '@training-observer/angular';
import {
    type RecordedEvent,
    requiresBlur,
    type StateRecording,
} from '@training-observer/contracts';
import {type ControlSnapshot} from '@training-observer/core/models';
import {recordingProblem, removeRecordedEvent} from '@training-observer/recording';

import {ProcedureFormComponent} from '../../shared/demo-form/procedure-form.component';
import {PROCEDURE_SCREEN} from '../../shared/demo-form/procedure-screen';
import {RecordingStore} from './recording-store';
import {ScenarioEditorComponent} from './scenario-editor.component';

@Component({
    selector: 'app-procedure',
    imports: [JsonPipe, ProcedureFormComponent, ScenarioEditorComponent, TuiButton],
    templateUrl: './record-page.component.html',
    styleUrl: './record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideRecordingSession({screen: PROCEDURE_SCREEN})],
})
export class RecordPageComponent {
    private readonly session = inject(RecordingSession);
    private readonly editedDraft = signal<StateRecording | null>(null);

    protected readonly store = inject(RecordingStore);
    protected readonly recording = this.session.recording;
    protected readonly stopping = this.session.stopping;
    protected readonly draft = computed(() =>
        this.recording() ? this.session.draft() : this.editedDraft(),
    );

    protected readonly undoHistory = signal<readonly StateRecording[]>([]);
    protected readonly editProblem = computed(() => {
        const draft = this.draft();

        return draft ? recordingProblem(draft) : '';
    });

    protected readonly observer = this.session;
    protected readonly visit = this.session.visit;
    protected readonly selected = signal<string | null>(null);
    protected readonly screen = this.session.screen;

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
            this.editedDraft.set(this.store.saved());
        });
    }

    protected toggleHighlight(nodeId: string): void {
        const selected = this.selected() === nodeId ? null : nodeId;

        this.selected.set(selected);
        this.session.highlight(selected);
    }

    protected startRecording(): void {
        this.undoHistory.set([]);
        this.session.start();
    }

    protected deleteEvent(sequence: number): void {
        const recording = this.draft();

        if (!recording || this.recording()) {
            return;
        }

        const edited = removeRecordedEvent(recording, sequence);

        this.undoHistory.update((history) => [...history, recording]);
        this.editedDraft.set(edited);
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
        this.editedDraft.set(previous);
        this.store.save(previous);
    }

    protected async stopRecording(): Promise<void> {
        const recording = await this.session.stop();

        this.editedDraft.set(recording);
        this.store.save(recording);
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
        return requiresBlur(control);
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
