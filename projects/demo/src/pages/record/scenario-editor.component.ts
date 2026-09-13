import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox, TuiDataListWrapper, TuiSelect, TuiTextarea} from '@taiga-ui/kit';
import {
    describeElement,
    draftScenario,
    type ElementDescriptor,
    type GroupedScenario,
    isObservableElement,
    parseScenario,
    type Recording,
    type SemanticAction,
    serializeScenario,
} from '@training-observer/core';
import {AreaRegistryService} from '@training-observer/core/angular';

import {SCENARIO_STORAGE_KEY} from '../scenario-storage';
import {ScenarioReviewComponent} from './scenario-review.component';

/** Готовит сценарий из журнала: автор выбирает конец записи, границы групп и результаты переходов, затем редактирует задания. */
@Component({
    standalone: true,
    selector: 'scenario-editor',
    imports: [
        FormsModule,
        ScenarioReviewComponent,
        TuiButton,
        TuiCheckbox,
        TuiDataListWrapper,
        TuiSelect,
        TuiTextarea,
        TuiTextfield,
    ],
    template: `
        <h3>Подготовка сценария</h3>
        <h4>1. Выберите последнее действие сценария</h4>
        <p>
            «Остановить запись» выключает сбор событий в админке. Выберите ниже действие в
            приложении, до которого должен дойти ученик. По умолчанию выбрано последнее
            записанное.
        </p>
        <tui-textfield [stringify]="actionTitle">
            <label tuiLabel>Последнее действие сценария</label>
            <input
                tuiSelect
                [ngModel]="targetAction()"
                (ngModelChange)="chooseAction($event)"
            />
            <tui-data-list-wrapper
                *tuiTextfieldDropdown
                new
                [items]="recording().actions"
            />
        </tui-textfield>
        <p>
            В сценарий войдут действия с 1 по {{ targetAction()?.sequence }}. Всё после
            выбранного действия останется только в исходной записи.
        </p>
        <h4>2. Укажите успешный результат этого действия</h4>
        <p>
            Нажатие кнопки отправки может закончиться ошибкой. Чтобы отличить успех от
            ошибки, выберите результат в приложении — например, заголовок «Заявка
            принята». Это условие для ученика, а не повторная остановка записи.
        </p>
        <button
            size="s"
            tuiButton
            type="button"
            [disabled]="disabled() || !recording().actions.length"
            (click)="pick()"
        >
            Выбрать результат в приложении
        </button>
        @if (picking()) {
            <p role="status">
                Теперь нажмите на успешный результат в приложении слева. Например, на
                заголовок «Заявка принята».
            </p>
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
            <details open>
                <summary>Группы и переходы</summary>
                <p>
                    3. Отметьте действия, после которых начинается новая группа заданий. В
                    учебном примере это выбор процедуры в поиске и каждое «Продолжить».
                    Если записывали «Новая процедура», отметьте и её. Для каждого перехода
                    выберите поле или результат, который должен появиться после него.
                    Внутри группы задания выполняются в любом порядке. Клик по справке
                    оставьте обычным заданием, если он не переключает группу. Последний
                    клик сценария уже отмечен как завершающий переход.
                </p>
                @for (action of actions(); track action.id) {
                    @if (action.kind !== 'input') {
                        <label>
                            <input
                                tuiCheckbox
                                type="checkbox"
                                [attr.aria-label]="'Переход ' + action.id"
                                [disabled]="
                                    action.id === targetAction()?.id &&
                                    action.kind === 'click'
                                "
                                [ngModel]="
                                    (action.id === targetAction()?.id &&
                                        action.kind === 'click') ||
                                    !!boundaries()[action.id]
                                "
                                (ngModelChange)="toggleBoundary(action, $event)"
                            />
                            После действия {{ action.sequence }}:
                            {{ actionName(action) }} —
                            {{
                                action.id === targetAction()?.id
                                    ? 'завершение сценария'
                                    : 'новая группа'
                            }}
                        </label>
                        @if (boundaries()[action.id]) {
                            <tui-textfield [stringify]="resultTitle">
                                <label tuiLabel>
                                    Результат действия {{ action.sequence }}
                                </label>
                                <input
                                    tuiSelect
                                    [ngModel]="boundaryTarget(action.id)"
                                    (ngModelChange)="setBoundary(action.id, $event)"
                                />
                                <tui-data-list-wrapper
                                    *tuiTextfieldDropdown
                                    new
                                    [items]="recording().descriptors.concat(descriptor)"
                                />
                            </tui-textfield>
                        }
                    }
                }
            </details>
            <p>
                Успешный результат:
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
            @if (draft(); as document) {
                <scenario-review
                    [scenario]="document"
                    (scenarioChange)="review($event)"
                />
            }
            <p>
                5. Сохраните сценарий — откроется новое приложение для проверки. Начните
                workflow заново; наблюдение включится автоматически.
            </p>
            <details>
                <summary>Дополнительно: JSON и сложные условия</summary>
                <p>
                    Здесь редактируются instruction, hint, optional, when, requires,
                    transitions, completion и ожидаемые значения.
                </p>
                <tui-textfield>
                    <label tuiLabel>JSON сценария</label>
                    <textarea
                        tuiTextarea
                        [ngModel]="source"
                        (ngModelChange)="editSource($event)"
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
    private readonly areas = inject(AreaRegistryService);
    private finishAreaKey?: string;
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);
    private cleanup?: () => void;
    private recordingId = '';
    private readonly targetId = signal('');

    public readonly recording = input.required<Recording>();
    public readonly root = input.required<HTMLElement>();
    public readonly disabled = input(false);
    public readonly finish = signal<ElementDescriptor | null>(null);
    public readonly error = signal('');
    public readonly picking = signal(false);
    public source = '';
    public readonly draft = signal<GroupedScenario | null>(null);
    public readonly boundaries = signal<Record<string, string>>({});

    public readonly targetAction = computed(
        () =>
            this.recording().actions.find((action) => action.id === this.targetId()) ??
            this.recording().actions[this.recording().actions.length - 1],
    );

    public readonly actions = computed(() =>
        this.recording().actions.slice(
            0,
            this.recording().actions.findIndex(
                (action) => action.id === this.targetAction()?.id,
            ) + 1,
        ),
    );

    constructor() {
        this.destroyRef.onDestroy(() => this.cancelPick());
        effect(() => {
            const id = this.recording().id;

            if (id !== this.recordingId) {
                this.recordingId = id;
                this.cancelPick();
                this.finish.set(null);
                this.finishAreaKey = undefined;
                this.source = '';
                this.boundaries.set({});
                this.targetId.set('');
                this.error.set('');
            }
        });
    }

    public readonly targetName = (target: ElementDescriptor): string =>
        target.fingerprint.features.accessibleName ||
        target.fingerprint.features.label ||
        target.fingerprint.features.text ||
        target.id;

    public readonly actionTitle = (action: SemanticAction): string =>
        action
            ? `№${action.sequence} · ${
                  {
                      click: 'Нажать',
                      input: 'Заполнить',
                      select: 'Выбрать',
                      navigation: 'Перейти',
                  }[action.kind]
              } · ${this.actionName(action)}`
            : '';

    public readonly resultTitle = (target: ElementDescriptor): string => {
        const name = this.targetName(target);
        const duplicates = this.recording()
            .descriptors.concat(this.finish() ?? [])
            .filter((entry) => this.targetName(entry) === name);

        if (duplicates.length < 2) {
            return name;
        }

        if (target.id === this.finish()?.id) {
            return `${name} · итоговый результат`;
        }

        const actions = this.recording()
            .actions.filter(
                (action) => 'targetId' in action && action.targetId === target.id,
            )
            .map((action) => action.sequence);

        return actions.length
            ? `${name} · действия №${actions.join(', ')}`
            : `${name} · снимок ${duplicates.findIndex((entry) => entry.id === target.id) + 1}`;
    };

    public chooseAction(action: SemanticAction | null): void {
        if (!action) {
            return;
        }

        this.targetId.set(action.id);
        this.source = '';
        this.boundaries.set({});
    }

    public actionName(action: SemanticAction): string {
        return action.kind === 'navigation'
            ? action.pathname
            : this.targetName(
                  this.recording().descriptors.find(
                      (target) => target.id === action.targetId,
                  )!,
              );
    }

    public boundaryTarget(id: string): ElementDescriptor | null {
        return (
            [...this.recording().descriptors, this.finish()!].find(
                (target) => target.id === this.boundaries()[id],
            ) ?? null
        );
    }

    public setBoundary(id: string, target: ElementDescriptor | null): void {
        if (target) {
            this.source = '';
            this.boundaries.update((entries) => ({...entries, [id]: target.id}));
        }
    }

    public toggleBoundary(action: SemanticAction, enabled: boolean): void {
        this.source = '';
        const entries = {...this.boundaries()};
        const next = this.actions()[this.actions().indexOf(action) + 1];

        if (enabled) {
            entries[action.id] =
                next && 'targetId' in next ? next.targetId : this.finish()!.id;
        } else {
            this.boundaries.set(
                Object.fromEntries(
                    Object.entries(entries).filter(([id]) => id !== action.id),
                ),
            );

            return;
        }

        this.boundaries.set(entries);
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
                        node instanceof Element && isObservableElement(node, root),
                );

            if (!element) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                const registry = this.areas.boundary();
                const owner = registry.owner(element);

                if (owner.status !== 'owned') {
                    throw new Error('Выберите признак в наблюдаемом MF.');
                }

                const areaRoot = registry.root(owner.area.key)!;

                this.finishAreaKey = owner.area.key;
                this.source = '';
                this.finish.set(
                    describeElement(element, areaRoot, `finish-${Date.now()}`, {
                        includeStatic: true,
                        accepts: (target) => registry.accepts(owner.area.key, target),
                    }),
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
                draftScenario(
                    {...this.recording(), actions: this.actions()},
                    this.finish()!,
                    this.finishAreaKey,
                    [
                        ...Object.entries(this.boundaries())
                            .filter(([actionId]) => actionId !== this.targetAction()?.id)
                            .map(([actionId, nextTargetId]) => ({
                                actionId,
                                nextTargetId,
                            })),
                        ...(this.targetAction()?.kind === 'click'
                            ? [
                                  {
                                      actionId: this.targetAction()!.id,
                                      nextTargetId: this.finish()!.id,
                                  },
                              ]
                            : []),
                    ],
                ),
                null,
                2,
            );
            const document = parseScenario(this.source);

            this.draft.set(document.version === 4 ? document : null);
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось создать сценарий',
            );
        }
    }

    public review(document: GroupedScenario): void {
        this.draft.set(document);
        this.source = JSON.stringify(document, null, 2);

        try {
            parseScenario(this.source);
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(error instanceof Error ? error.message : 'Проверьте задания');
        }
    }

    public editSource(source: string): void {
        this.source = source;

        try {
            const document = parseScenario(source);

            this.draft.set(document.version === 4 ? document : null);
            this.error.set('');
        } catch (error: unknown) {
            this.draft.set(null);
            this.error.set(error instanceof Error ? error.message : 'Проверьте JSON');
        }
    }

    public download(): void {
        try {
            const json = serializeScenario(parseScenario(this.source));
            const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
            const anchor = document.createElement('a');

            anchor.href = url;
            anchor.download = `training-scenario-v${parseScenario(this.source).version}.json`;
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
            void this.router.navigateByUrl('/learn');
        } catch (error: unknown) {
            this.error.set(
                error instanceof Error ? error.message : 'Не удалось сохранить сценарий',
            );
        }
    }
}
