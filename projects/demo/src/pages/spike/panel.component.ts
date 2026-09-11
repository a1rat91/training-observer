import {DOCUMENT, JsonPipe} from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    inject,
    NgZone,
    type OnDestroy,
    type OnInit,
} from '@angular/core';
import {FormsModule} from '@angular/forms';

import {
    DomMonitor,
    type ElementDescriptor,
    ElementRecorder,
    ElementResolver,
    type SemanticAction,
    waitForResolution,
} from '../../../../../libs/element-spike/src';
import {fixtureTargets, mutateFixture} from './fixtures';

@Component({
    standalone: true,
    selector: 'spike-panel',
    imports: [FormsModule, JsonPipe],
    template: `
        <header>
            <span class="eyebrow">TRAINING LAB / SPIKE</span>
            <h2>Наблюдение и поиск</h2>
            <p>Детерминированное сопоставление в живом DOM</p>
        </header>
        <div class="toolbar">
            <button
                [disabled]="recording"
                (click)="startRecording()"
            >
                Начать запись
            </button>
            <button
                [disabled]="!recording"
                (click)="stopRecording()"
            >
                Остановить
            </button>
            <button
                [disabled]="!actions.length && !descriptors.length"
                (click)="exportRecording()"
            >
                Экспорт JSON
            </button>
        </div>
        <p role="status">{{ message }}</p>
        <p class="mutations">
            DOM revision {{ monitor?.revision ?? 0 }} · mutations
            {{ monitor?.mutationCount ?? 0 }}
        </p>
        <details>
            <summary>Эксперимент с 28 контролами</summary>
            <div class="toolbar">
                <button (click)="captureFixture()">Снять 28 дескрипторов</button>
                <button
                    [disabled]="!descriptors.length"
                    (click)="mutate()"
                >
                    Изменить DOM
                </button>
                <button
                    [disabled]="!descriptors.length"
                    (click)="resolveAll()"
                >
                    Проверить поиск
                </button>
            </div>
            <p>
                Добавляет wrappers, меняет порядок, классы, вложенность, содержимое кнопок
                и контейнеры. Для нового эксперимента обновите страницу.
            </p>
        </details>
        @if (actions.length) {
            <h3>Записанные действия · {{ actions.length }}</h3>
            <ol>
                @for (action of actions; track $index) {
                    <li>
                        <button
                            class="entry"
                            (click)="selectAction(action)"
                        >
                            {{ action.kind }} · {{ actionName(action) }}
                        </button>
                    </li>
                }
            </ol>
            <button (click)="startRehearsal()">
                Проверять записанную последовательность
            </button>
            <p>
                Шаг {{ rehearsalIndex + 1 }} / {{ actions.length }}. Для повторения
                процедуры нажмите «Новая процедура» в плеере.
            </p>
        }
        @if (selected) {
            <h3>Проверка выбранного шага</h3>
            <label>
                Текст задания
                <input [(ngModel)]="instruction" />
            </label>
            <label>
                Заранее заданная подсказка
                <input [(ngModel)]="hint" />
            </label>
            <button (click)="findSelected()">Найти и подсветить</button>
            <p>{{ hint }}</p>
            <details>
                <summary>ElementDescriptor JSON</summary>
                <pre>{{ selected | json }}</pre>
            </details>
        }
        @if (results.length) {
            <ul class="results">
                @for (row of results; track $index) {
                    <li>{{ row }}</li>
                }
            </ul>
        }
    `,
    styles: `
        :host {
            display: block;
            padding: 24px;
            background: #10243b;
            color: #eaf2fb;
            border-radius: 16px;
            position: sticky;
            top: 24px;
            max-height: calc(100vh - 48px);
            overflow: auto;
        }
        header h2 {
            margin: 8px 0;
            font-size: 23px;
            color: white;
        }
        p {
            line-height: 1.5;
        }
        .eyebrow {
            font-size: 11px;
            letter-spacing: 2px;
            color: #89c4ff;
        }
        .toolbar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin: 16px 0;
        }
        button {
            border: 1px solid #5d7898;
            border-radius: 6px;
            background: #1c3857;
            color: white;
            padding: 8px 11px;
            cursor: pointer;
        }
        button:disabled {
            opacity: 0.4;
        }
        label {
            display: block;
            margin: 10px 0;
        }
        input {
            display: block;
            width: 100%;
            color: #10243b;
            margin-top: 6px;
            padding: 7px;
            box-sizing: border-box;
        }
        pre {
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 11px;
            max-height: 400px;
            overflow: auto;
        }
        details {
            margin: 16px 0;
        }
        summary {
            cursor: pointer;
        }
        ol {
            padding-left: 20px;
            max-height: 240px;
            overflow: auto;
        }
        .entry {
            border: 0;
            padding: 4px;
            text-align: left;
            background: transparent;
        }
        .mutations {
            font-size: 12px;
            color: #89accf;
        }
        .results {
            font-size: 12px;
            padding-left: 14px;
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpikePanelComponent implements OnInit, OnDestroy {
    private readonly doc = inject(DOCUMENT);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly zone = inject(NgZone);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly resolver = new ElementResolver({excludedRoots: [this.host]});
    private recorder?: ElementRecorder;
    private oracle: Element[] = [];
    private overlay?: HTMLElement;
    private abort?: AbortController;
    private rehearsing = false;

    public monitor?: DomMonitor;
    public recording = false;
    public descriptors: ElementDescriptor[] = [];
    public actions: SemanticAction[] = [];
    public results: string[] = [];
    public selected?: ElementDescriptor;
    public instruction = 'Выполните действие в приложении';
    public hint = 'Найдите соответствующее поле или кнопку в форме.';
    public message = 'Включите запись и выполните workflow в приложении слева.';
    public rehearsalIndex = 0;

    public ngOnInit(): void {
        this.zone.runOutsideAngular(() => {
            this.monitor = new DomMonitor(this.doc, {excludedRoots: [this.host]});
            this.monitor.start();
        });
    }

    public ngOnDestroy(): void {
        this.recorder?.stop();
        this.monitor?.stop();
        this.abort?.abort();
        this.overlay?.remove();
    }

    public startRecording(): void {
        this.recorder?.stop();
        this.actions = [];
        this.recording = true;
        this.rehearsing = false;
        this.startObserver();
        this.message =
            'Запись включена. Значения тестовой формы сохраняются, пароли скрываются.';
    }

    public stopRecording(): void {
        this.recorder?.stop();
        this.recording = false;
        this.message = `Записано действий: ${this.actions.length}`;
    }

    public startRehearsal(): void {
        this.stopRecording();
        this.rehearsalIndex = 0;
        this.rehearsing = true;
        this.startObserver();
        this.message =
            'Наблюдаю последовательность. Следующий шаг должен совпасть по цели, виду действия и значению.';
    }

    public actionName(action: SemanticAction): string {
        return action.kind === 'navigation'
            ? action.url
            : action.descriptor.accessibleName ||
                  action.descriptor.placeholder ||
                  action.descriptor.tag;
    }

    public selectAction(action: SemanticAction): void {
        if (action.kind !== 'navigation') {
            this.selected = action.descriptor;
        }
    }

    public captureFixture(): void {
        const root = this.doc.querySelector('spike-target');

        if (!root) {
            this.message = 'Матрица доступна на странице «28 контролов».';

            return;
        }

        this.oracle = fixtureTargets(root);
        const recorder = new ElementRecorder(this.doc, () => {}, {
            excludedRoots: [this.host],
        });

        this.descriptors = this.oracle.map((element) => recorder.capture(element));
        this.selected = this.descriptors[0];
        this.message = `Сохранено ${this.descriptors.length} JSON-дескрипторов. DOM не изменялся при записи.`;
    }

    public mutate(): void {
        const root = this.doc.querySelector('spike-target');

        if (root) {
            mutateFixture(root, this.oracle, 'combined');
        }

        this.message = 'Применены 6 мутаций. Можно проверить поиск.';
    }

    public resolveAll(): void {
        this.results = this.descriptors.map((descriptor, index) => {
            const result = this.resolver.resolve(
                JSON.parse(JSON.stringify(descriptor)),
                this.doc,
            );

            const unmatched = result.element ? '✗ WRONG' : '— abstained';

            return `${index + 1}. ${descriptor.accessibleName || descriptor.placeholder}: ${result.status} ${result.element === this.oracle[index] ? '✓ correct' : unmatched} (${result.strategy ?? result.reason})`;
        });
    }

    public async findSelected(): Promise<void> {
        if (!this.selected) {
            return;
        }

        this.abort?.abort();
        this.abort = new AbortController();
        this.message = 'Ожидаю появления и стабилизации цели…';
        const result = await waitForResolution(this.resolver, this.selected, this.doc, {
            signal: this.abort.signal,
            excludedRoots: [this.host],
        });

        this.overlay?.remove();
        this.message = `${result.status}: ${result.reason}`;

        if (result.element) {
            result.element.scrollIntoView({block: 'center'});
            const rect = result.element.getBoundingClientRect();

            this.overlay = this.doc.createElement('div');
            this.overlay.style.cssText = `position:fixed;pointer-events:none;z-index:99999;border:3px solid #ff9f1a;border-radius:8px;left:${rect.left - 4}px;top:${rect.top - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px;box-sizing:border-box;`;
            // Own overlay; no attributes or styles are written to the target.
            this.host.append(this.overlay);
        }

        this.cdr.markForCheck();
    }

    public exportRecording(): void {
        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        version: 1,
                        instruction: this.instruction,
                        hint: this.hint,
                        actions: this.actions,
                        descriptors: this.descriptors,
                    },
                    null,
                    2,
                ),
            ],
            {type: 'application/json'},
        );

        const url = URL.createObjectURL(blob);
        const anchor = this.doc.createElement('a');

        anchor.href = url;
        anchor.download = 'training-spike.json';
        anchor.click();
        URL.revokeObjectURL(url);
    }

    private startObserver(): void {
        this.zone.runOutsideAngular(() => {
            this.recorder = new ElementRecorder(
                this.doc,
                (action) =>
                    this.zone.run(() => {
                        if (this.recording) {
                            this.actions = [...this.actions, action];
                        }

                        if (this.rehearsing) {
                            this.consume(action);
                        }

                        this.cdr.markForCheck();
                    }),
                {excludedRoots: [this.host], captureValues: true},
            );
            this.recorder.start();
        });
    }

    private consume(actual: SemanticAction): void {
        const expected = this.actions[this.rehearsalIndex];

        if (actual.kind !== expected?.kind) {
            return;
        }

        if (expected.kind === 'navigation' || actual.kind === 'navigation') {
            if (
                expected.kind !== 'navigation' ||
                actual.kind !== 'navigation' ||
                expected.url !== actual.url
            ) {
                return;
            }
        } else {
            const wanted = this.resolver.resolve(expected.descriptor, this.doc);
            const observed = this.resolver.resolve(actual.descriptor, this.doc);

            if (
                wanted.status !== 'resolved' ||
                observed.status !== 'resolved' ||
                wanted.element !== observed.element ||
                (!expected.redacted &&
                    JSON.stringify(expected.value) !== JSON.stringify(actual.value))
            ) {
                return;
            }
        }

        this.rehearsalIndex++;
        this.message =
            this.rehearsalIndex === this.actions.length
                ? 'Последовательность действий совпала. Бизнес-результат требует отдельного completion condition.'
                : `Совпадение. Ожидается шаг ${this.rehearsalIndex + 1}.`;

        if (this.rehearsalIndex === this.actions.length) {
            this.rehearsing = false;
        }
    }
}
