import {ChangeDetectionStrategy, Component, model} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {
    type Condition,
    type Expectation,
    type GroupedScenario,
    type GroupExpectedAction,
    type ValueCondition,
} from '@training-observer/core';

/** Редактор авторского сценария. Изменения формируют новый документ; целевое приложение не затрагивается. */
@Component({
    selector: 'scenario-review',
    imports: [FormsModule, TuiCheckbox, TuiTextfield],
    template: `
        <h3>4. Проверьте задания</h3>
        <p>
            Поля внутри каждой карточки можно выполнять в любом порядке. Измените текст,
            подсказку или ожидаемое значение. Переходы завершают группу.
        </p>
        <p>
            «Подсказка» помогает выполнить задание. Тексты реакции на правильный или
            ошибочный ответ здесь пока не настраиваются.
        </p>
        @for (group of scenario().groups; track group.id) {
            <section
                class="group"
                [attr.aria-label]="'Редактор ' + group.title"
            >
                <tui-textfield>
                    <label tuiLabel>Название группы</label>
                    <input
                        tuiTextfield
                        [ngModel]="group.title"
                        (ngModelChange)="title(group.id, $event)"
                    />
                </tui-textfield>
                <h4>Задания в любом порядке</h4>
                <p>Проверяются только задания этой группы с доступными целями.</p>
                @for (job of group.expectations; track job.id; let number = $index) {
                    <div class="job">
                        <p>
                            <strong>Действие:</strong>
                            {{ actionName(job.action) }}
                        </p>
                        <tui-textfield>
                            <label tuiLabel>Текст задания {{ number + 1 }}</label>
                            <input
                                tuiTextfield
                                [ngModel]="job.instruction"
                                (ngModelChange)="
                                    edit(group.id, job.id, {instruction: $event})
                                "
                            />
                        </tui-textfield>
                        <tui-textfield>
                            <label tuiLabel>Подсказка {{ number + 1 }}</label>
                            <input
                                tuiTextfield
                                [ngModel]="job.hint"
                                (ngModelChange)="
                                    edit(group.id, job.id, {hint: $event || null})
                                "
                            />
                        </tui-textfield>
                        @if (value(job); as expected) {
                            @if (isBoolean(expected)) {
                                <label>
                                    <input
                                        tuiCheckbox
                                        type="checkbox"
                                        [ngModel]="raw(expected)"
                                        (ngModelChange)="
                                            changeValue(group.id, job, $event)
                                        "
                                    />
                                    Ожидается включённое состояние
                                </label>
                            } @else {
                                <tui-textfield>
                                    <label tuiLabel>
                                        Ожидаемое значение {{ number + 1 }}
                                    </label>
                                    <input
                                        tuiTextfield
                                        [ngModel]="raw(expected)"
                                        (ngModelChange)="
                                            changeValue(group.id, job, $event)
                                        "
                                    />
                                </tui-textfield>
                            }
                        }
                        <label>
                            <input
                                tuiCheckbox
                                type="checkbox"
                                [ngModel]="job.optional"
                                (ngModelChange)="
                                    edit(group.id, job.id, {optional: $event})
                                "
                            />
                            Необязательное задание
                        </label>
                        <details>
                            <summary>Выполнить после другого задания</summary>
                            <p>
                                Отмечайте только необходимые зависимости. Без них порядок
                                свободный.
                            </p>
                            @for (other of group.expectations; track other.id) {
                                @if (other.id !== job.id) {
                                    <label>
                                        <input
                                            tuiCheckbox
                                            type="checkbox"
                                            [ngModel]="job.requires.includes(other.id)"
                                            (ngModelChange)="
                                                dependency(
                                                    group.id,
                                                    job,
                                                    other.id,
                                                    $event
                                                )
                                            "
                                        />
                                        {{ other.instruction }}
                                    </label>
                                }
                            }
                        </details>
                    </div>
                } @empty {
                    <p>В этой группе нужно только выполнить переход ниже.</p>
                }
                @for (transition of group.transitions; track transition.id) {
                    <p class="transition">
                        <strong>Действие перехода:</strong>
                        {{ actionName(transition.action) }}
                        <br />
                        <strong>Результат:</strong>
                        {{ conditionName(transition.completion) }}
                        <br />
                        После обязательных заданий → {{ nextTitle(transition.toGroupId) }}
                    </p>
                }
                @if (!group.transitions.length) {
                    <p class="transition">
                        После обязательных заданий проверяется итоговый результат:
                        {{ conditionName(scenario().completion) }}
                    </p>
                }
            </section>
        }
    `,
    styles: ':host {display:block;} .group {border:1px solid var(--tui-border-normal); border-radius:1rem; padding:1rem; margin:1rem 0;} .job {display:grid; gap:.65rem; margin:1rem 0; padding-block:1rem; border-bottom:1px solid var(--tui-border-normal);} label {display:flex; align-items:center; gap:.5rem;} .transition {padding:.75rem; background:var(--tui-background-neutral-1); border-radius:.5rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioReviewComponent {
    public readonly scenario = model.required<GroupedScenario>();

    public title(groupId: string, title: string): void {
        this.scenario.update((document) => ({
            ...document,
            groups: document.groups.map((group) =>
                group.id === groupId ? {...group, title} : group,
            ),
        }));
    }

    public edit(groupId: string, id: string, patch: Partial<Expectation>): void {
        this.scenario.update((document) => ({
            ...document,
            groups: document.groups.map((group) =>
                group.id === groupId
                    ? {
                          ...group,
                          expectations: group.expectations.map((job) =>
                              job.id === id ? {...job, ...patch} : job,
                          ),
                      }
                    : group,
            ),
        }));
    }

    public value(job: Expectation): ValueCondition | null {
        return 'value' in job.action ? job.action.value : null;
    }

    public isBoolean(condition: ValueCondition): boolean {
        return condition.kind === 'raw-equals' && typeof condition.value === 'boolean';
    }

    public raw(condition: ValueCondition): boolean | number | string | null {
        if (condition.kind === 'normalized-equals') {
            return condition.normalized.value;
        }

        return Array.isArray(condition.value)
            ? condition.value.join(', ')
            : condition.value;
    }

    public changeValue(group: string, job: Expectation, value: boolean | string): void {
        const action = job.action;

        if (!('value' in action)) {
            return;
        }

        const previous = action.value;
        const expected: ValueCondition =
            previous.kind === 'normalized-equals'
                ? {
                      kind: 'normalized-equals',
                      normalized:
                          previous.normalized.rule === 'decimal-comma-v1'
                              ? {rule: 'decimal-comma-v1', value: Number(value)}
                              : {rule: 'date-dmy-v1', value: String(value)},
                  }
                : {
                      kind: 'raw-equals',
                      value: Array.isArray(previous.value)
                          ? String(value)
                                .split(',')
                                .map((entry) => entry.trim())
                          : value,
                  };

        const replace = (condition: Condition): Condition => {
            if ('conditions' in condition) {
                return {...condition, conditions: condition.conditions.map(replace)};
            }

            return condition.kind === 'value' && condition.targetId === action.targetId
                ? {...condition, condition: expected}
                : condition;
        };

        this.edit(group, job.id, {
            action: {...action, value: expected},
            completion: replace(job.completion),
        });
    }

    public dependency(
        group: string,
        job: Expectation,
        id: string,
        enabled: boolean,
    ): void {
        this.edit(group, job.id, {
            requires: enabled
                ? [...new Set([...job.requires, id])]
                : job.requires.filter((entry) => entry !== id),
        });
    }

    public actionName(action: GroupExpectedAction): string {
        if (action.kind === 'navigation') {
            return `Перейти на ${action.pathname}`;
        }

        const verb = {click: 'Нажать', input: 'Заполнить', select: 'Выбрать'}[
            action.kind
        ];

        return `${verb} «${this.targetName(action.targetId)}»`;
    }

    public conditionName(condition: Condition): string {
        switch (condition.kind) {
            case 'all':
            case 'any':
                return condition.conditions
                    .map((entry) => `(${this.conditionName(entry)})`)
                    .join(condition.kind === 'all' ? ' и ' : ' или ');
            case 'pathname':
                return `Открыт маршрут ${condition.value}`;
            case 'value':
                return `«${this.targetName(condition.targetId)}» = ${this.raw(
                    condition.condition,
                )}`;
            case 'visible':
                return `«${this.targetName(condition.targetId)}» ${condition.expected ? 'виден' : 'скрыт'}`;
        }
    }

    public nextTitle(id: string | null): string {
        return id === null
            ? 'Завершение тренировки'
            : this.scenario().groups.find((group) => group.id === id)!.title;
    }

    private targetName(id: string): string {
        const target = this.scenario().descriptors.find((entry) => entry.id === id);
        const features = target?.fingerprint.features;

        return features?.accessibleName || features?.label || features?.text || id;
    }
}
