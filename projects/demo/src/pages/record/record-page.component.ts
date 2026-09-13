import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {
    parseRecording,
    type Recording,
    removeRecordedAction,
    type Resolution,
    type SemanticAction,
    serializeRecording,
    TargetResolver,
} from '@training-observer/core';
import {
    AreaRegistryService,
    RecordingSessionService,
} from '@training-observer/core/angular';

import {ElementGroupPickerComponent} from '../../authoring/element-group-picker.component';
import {RECORDING_IMPORT_KEY} from '../scenario-storage';
import {DEMO_AREAS} from '../workspace/area-definitions';
import {ProcedureShellComponent} from '../workspace/procedure-shell.component';
import {ScenarioEditorComponent} from './scenario-editor.component';

/** Панель записи: сохраняет исходный журнал, редактирует копии после stop и отменяет удаления стеком версий. */
@Component({
    standalone: true,
    selector: 'record-page',
    imports: [
        ElementGroupPickerComponent,
        FormsModule,
        ProcedureShellComponent,
        ScenarioEditorComponent,
        TuiButton,
        TuiCheckbox,
    ],
    templateUrl: './record-page.component.html',
    styleUrl: './record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [AreaRegistryService, RecordingSessionService],
})
export default class RecordPageComponent {
    private readonly session = inject(RecordingSessionService);
    private readonly importedRecording = signal<Recording | null>(null);
    private readonly edits = signal<Recording[]>([]);
    private readonly workspace = viewChild.required(ProcedureShellComponent);

    public readonly areaRegistry = inject(AreaRegistryService);
    public readonly recording = computed(
        () =>
            this.edits()[this.edits().length - 1] ??
            this.session.recording() ??
            this.importedRecording(),
    );

    public readonly canUndo = computed(() => this.edits().length > 0);
    public readonly running = this.session.running;
    public readonly paused = this.session.paused;
    public readonly resolutions = signal<Array<{name: string; report: Resolution}>>([]);
    public readonly error = signal('');
    public captureValues = true;
    public readonly imported = signal(false);

    constructor() {
        afterNextRender(() => {
            this.areaRegistry.connect(
                this.workspace().surface().nativeElement,
                DEMO_AREAS,
            );
        });

        try {
            const source = sessionStorage.getItem(RECORDING_IMPORT_KEY);

            if (source) {
                const recording = parseRecording(source);

                sessionStorage.removeItem(RECORDING_IMPORT_KEY);
                this.importedRecording.set(recording);
                this.imported.set(true);
            }
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error
                    ? error.message
                    : 'Не удалось импортировать запись',
            );
        }
    }

    public start(root: HTMLElement): void {
        this.error.set('');
        this.edits.set([]);
        this.imported.set(false);
        this.importedRecording.set(null);
        this.resolutions.set([]);
        this.session.start(root, {
            mode: this.captureValues ? 'capture' : 'omit',
            sensitive: 'redact',
            normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
        });
    }

    public pauseForSelection(): void {
        this.session.pause();
    }

    public resumeAfterSelection(): void {
        this.session.resume();
    }

    public stop(): void {
        this.session.stop();
    }

    public remove(action: SemanticAction): void {
        const recording = this.recording();

        if (!recording || this.running()) {
            return;
        }

        try {
            const next = removeRecordedAction(recording, action.id);

            this.edits.update((versions) => [...versions, next]);
            this.resolutions.set([]);
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось удалить действие',
            );
        }
    }

    public undo(): void {
        if (this.running()) {
            return;
        }

        this.edits.update((versions) => versions.slice(0, -1));
        this.resolutions.set([]);
        this.error.set('');
    }

    public check(): void {
        const recording = this.recording();

        if (!recording || this.running()) {
            return;
        }

        try {
            const resolver = new TargetResolver(
                recording,
                this.workspace().surface().nativeElement,
                {},
                this.areaRegistry.boundary(),
            );

            const targetIds = new Set(
                recording.actions.flatMap((action) =>
                    'targetId' in action ? [action.targetId] : [],
                ),
            );

            this.resolutions.set(
                recording.descriptors
                    .filter((descriptor) => targetIds.has(descriptor.id))
                    .map((descriptor) => ({
                        name:
                            descriptor.fingerprint.features.accessibleName ||
                            descriptor.fingerprint.features.label ||
                            descriptor.id,
                        report: resolver.resolve(descriptor).report,
                    })),
            );
            this.error.set('');
        } catch (error: unknown) {
            this.resolutions.set([]);
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось проверить запись',
            );
        }
    }

    public download(): void {
        try {
            const recording = this.recording();
            const json = recording ? serializeRecording(recording) : null;

            if (!json) {
                return;
            }

            const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
            const anchor = document.createElement('a');

            anchor.href = url;
            anchor.download = `training-recording-v${recording!.version}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error
                    ? error.message
                    : 'Не удалось экспортировать запись',
            );
        }
    }

    public actionLabel(action: SemanticAction): string {
        return {click: 'Нажатие', input: 'Ввод', select: 'Выбор', navigation: 'Переход'}[
            action.kind
        ];
    }

    public name(action: SemanticAction): string {
        if (action.kind === 'navigation') {
            return action.pathname;
        }

        const features = this.recording()?.descriptors.find(
            (entry) => entry.id === action.targetId,
        )?.fingerprint.features;

        return (
            features?.accessibleName ||
            features?.label ||
            features?.placeholder ||
            features?.tag ||
            action.targetId
        );
    }

    public value(action: SemanticAction): string {
        if (!('value' in action)) {
            return '';
        }

        const value = action.value;

        return value.status === 'captured'
            ? `${JSON.stringify(value.raw)}${value.normalized ? ` → ${JSON.stringify(value.normalized.value)}` : ''}`
            : {
                  omitted: 'Значение не сохраняется',
                  redacted: 'Секрет скрыт',
                  unavailable: 'Значение недоступно',
              }[value.status];
    }

    public json(value: unknown): string {
        return JSON.stringify(value, null, 2);
    }
}
