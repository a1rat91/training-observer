import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiTextarea} from '@taiga-ui/kit';

import {
    type ElementDescriptor,
    parseScenario,
    type Recording,
    serializeScenario,
} from '../../../../../libs/element-spike/src/contracts';
import {OBSERVABLES} from '../../../../../libs/element-spike/src/dom/identity';
import {describe} from '../../../../../libs/element-spike/src/recording/dom';
import {draftScenario} from '../../../../../libs/element-spike/src/runtime';
import {SCENARIO_STORAGE_KEY} from '../scenario-storage';

@Component({
    standalone: true,
    selector: 'scenario-editor',
    imports: [FormsModule, TuiButton, TuiTextarea, TuiTextfield],
    template: `
        <h3>Подготовка сценария</h3>
        <p>
            После успешного завершения процедуры выберите заголовок или область, которая
            появляется только при успехе.
        </p>
        <button
            size="s"
            tuiButton
            type="button"
            [disabled]="disabled() || !recording().actions.length"
            (click)="pick()"
        >
            Выбрать признак завершения
        </button>
        @if (picking()) {
            <p role="status">Нажмите на признак успешного результата в плеере.</p>
            <button
                size="s"
                tuiButton
                type="button"
                (click)="cancelPick()"
            >
                Отменить выбор
            </button>
        }
        @if (finish(); as descriptor) {
            <p>
                Признак:
                {{
                    descriptor.fingerprint.features.accessibleName ||
                        descriptor.fingerprint.features.text
                }}
            </p>
            <button
                size="s"
                tuiButton
                type="button"
                [disabled]="disabled()"
                (click)="build()"
            >
                Создать черновик сценария
            </button>
        }
        @if (source) {
            <p>
                Проверьте задания, значения и completion каждого клика. Черновик
                предполагает, что клик должен сделать доступной цель следующего действия.
            </p>
            <details>
                <summary>Редактор JSON сценария</summary>
                <p>
                    Здесь редактируются instruction, hint, optional, branches, completion
                    и ожидаемые значения.
                </p>
                <tui-textfield>
                    <label tuiLabel>JSON сценария</label>
                    <textarea
                        tuiTextarea
                        [(ngModel)]="source"
                    ></textarea>
                </tui-textfield>
            </details>
            <button
                size="s"
                tuiButton
                type="button"
                [disabled]="disabled()"
                (click)="save()"
            >
                Сохранить и открыть прохождение
            </button>
            <button
                size="s"
                tuiButton
                type="button"
                [disabled]="disabled()"
                (click)="download()"
            >
                Скачать сценарий
            </button>
        }
        @if (error()) {
            <p role="alert">{{ error() }}</p>
        }
    `,
    styles: ':host {display:block; margin-top:1rem;} button {margin:.25rem 0;} textarea {font-family:monospace;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioEditorComponent {
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);
    private cleanup?: () => void;
    private recordingId = '';

    public readonly recording = input.required<Recording>();
    public readonly root = input.required<HTMLElement>();
    public readonly disabled = input(false);
    public readonly finish = signal<ElementDescriptor | null>(null);
    public readonly error = signal('');
    public readonly picking = signal(false);
    public source = '';

    constructor() {
        this.destroyRef.onDestroy(() => this.cancelPick());
        effect(() => {
            const id = this.recording().id;

            if (id !== this.recordingId) {
                this.recordingId = id;
                this.cancelPick();
                this.finish.set(null);
                this.source = '';
                this.error.set('');
            }
        });
    }

    public cancelPick(): void {
        this.cleanup?.();
        this.cleanup = undefined;
        this.picking.set(false);
    }

    public pick(): void {
        this.cancelPick();
        this.error.set('');
        this.picking.set(true);
        const root = this.root();
        const listener = (event: MouseEvent): void => {
            const element = event
                .composedPath()
                .find(
                    (node): node is Element =>
                        node instanceof Element &&
                        root.contains(node) &&
                        node.matches(OBSERVABLES),
                );

            if (!element) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                this.finish.set(
                    describe(element, root, `finish-${Date.now()}`, OBSERVABLES),
                );
            } catch {
                this.error.set(
                    'Не удалось описать признак. Выберите доступный заголовок или область.',
                );
            }

            this.cancelPick();
        };

        root.ownerDocument.addEventListener('click', listener, true);
        this.cleanup = () =>
            root.ownerDocument.removeEventListener('click', listener, true);
    }

    public build(): void {
        try {
            this.source = JSON.stringify(
                draftScenario(this.recording(), this.finish()!),
                null,
                2,
            );
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось создать сценарий',
            );
        }
    }

    public download(): void {
        try {
            const json = serializeScenario(parseScenario(this.source));
            const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
            const anchor = document.createElement('a');

            anchor.href = url;
            anchor.download = 'training-scenario-v2.json';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось скачать сценарий',
            );
        }
    }

    public save(): void {
        try {
            const json = serializeScenario(parseScenario(this.source));

            localStorage.setItem(SCENARIO_STORAGE_KEY, json);
            void this.router.navigateByUrl('/spike/learn');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось сохранить сценарий',
            );
        }
    }
}
