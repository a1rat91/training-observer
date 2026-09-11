import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    NgZone,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';

import {
    type Recording,
    type Resolution,
    type SemanticAction,
} from '../../../../../libs/element-spike/src/contracts';
import {ElementRecorder} from '../../../../../libs/element-spike/src/recording';
import {ElementResolver} from '../../../../../libs/element-spike/src/resolution';
import ProcedurePageComponent from '../procedure/procedure-page.component';
import {ScenarioEditorComponent} from './scenario-editor.component';

@Component({
    standalone: true,
    selector: 'record-page',
    imports: [
        FormsModule,
        ProcedurePageComponent,
        ScenarioEditorComponent,
        TuiButton,
        TuiCheckbox,
    ],
    templateUrl: './record-page.component.html',
    styleUrl: './record-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RecordPageComponent {
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    private recorder?: ElementRecorder;

    public readonly recording = signal<Recording | null>(null);
    public readonly running = signal(false);
    public readonly resolutions = signal<Array<{name: string; report: Resolution}>>([]);
    public readonly error = signal('');
    public captureValues = true;

    constructor() {
        this.destroyRef.onDestroy(() => this.recorder?.stop());
    }

    public start(root: HTMLElement): void {
        this.recorder?.stop();
        this.error.set('');
        this.resolutions.set([]);
        this.zone.runOutsideAngular(() => {
            this.recorder = new ElementRecorder(root, {
                valuePolicy: {
                    mode: this.captureValues ? 'capture' : 'omit',
                    sensitive: 'redact',
                    normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
                },
                onUpdate: () => this.zone.run(() => this.refresh()),
            });
            this.recorder.start();
        });
        this.refresh();
    }

    public stop(): void {
        this.recorder?.stop();
        this.refresh();
    }

    public check(root: HTMLElement): void {
        const recording = this.recording();

        if (!recording || this.running()) {
            return;
        }

        const targetIds = new Set(
            recording.actions.flatMap((action) =>
                'targetId' in action ? [action.targetId] : [],
            ),
        );

        const resolver = new ElementResolver();

        this.resolutions.set(
            recording.descriptors
                .filter((descriptor) => targetIds.has(descriptor.id))
                .map((descriptor) => ({
                    name:
                        descriptor.fingerprint.features.accessibleName ||
                        descriptor.fingerprint.features.label ||
                        descriptor.id,
                    report: resolver.resolve(descriptor, root).report,
                })),
        );
    }

    public download(): void {
        try {
            const json = this.recorder?.export();

            if (!json) {
                return;
            }

            const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
            const anchor = document.createElement('a');

            anchor.href = url;
            anchor.download = 'training-recording-v2.json';
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

    private refresh(): void {
        this.recording.set(this.recorder?.snapshot() ?? null);
        this.running.set(this.recorder?.running ?? false);
    }
}
