/**
 * Редактор реакции одного задания/перехода: выдаёт immutable patch родителю, не меняя целевое приложение.
 * Ожидаемое действие уже взято из записи. Автор привязывает состав, затем явно отмечает ошибки и их сообщения.
 * Кнопки/поля здесь принадлежат админке; runtime получает только проверенный документ сценария.
 */
import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {
    type ActionReactions,
    type ActionVariant,
    type ElementDescriptor,
    type Expectation,
    type GroupTransition,
} from '@training-observer/core';

import {type ElementGroup} from './element-groups';

@Component({
    selector: 'action-reactions',
    imports: [FormsModule, TuiButton, TuiCheckbox, TuiTextfield],
    templateUrl: './action-reactions.component.html',
    styles: ':host {display:block; margin-block:1rem;} .variant {padding:.75rem; border:1px solid var(--tui-border-normal); margin-block:.5rem;} label {display:flex; align-items:center; gap:.5rem;} button {margin-block:.5rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionReactionsComponent {
    public readonly job = input.required<Expectation | GroupTransition>();
    public readonly groups = input<readonly ElementGroup[]>([]);
    public readonly descriptors = input.required<readonly ElementDescriptor[]>();
    public readonly changed = output<ActionReactions>();
    public readonly attach = output<ElementGroup>();

    public message(kind: 'mismatch' | 'success', value: string): void {
        this.changed.emit({feedback: {...this.job().feedback, [kind]: value}});
    }

    public variant(groupId: string, id: string, patch: Partial<ActionVariant>): void {
        this.changed.emit({
            choiceGroups: this.job().choiceGroups!.map((group) =>
                group.id === groupId
                    ? {
                          ...group,
                          variants: group.variants.map((entry) =>
                              entry.id === id ? {...entry, ...patch} : entry,
                          ),
                      }
                    : group,
            ),
        });
    }

    public value(groupId: string, variant: ActionVariant, value: boolean | string): void {
        const action = variant.action;

        if ('value' in action) {
            this.variant(groupId, variant.id, {
                action: {...action, value: {kind: 'raw-equals', value}},
            });
        }
    }

    public raw(variant: ActionVariant): boolean | number | string | null {
        if (!('value' in variant.action)) {
            return null;
        }

        const condition = variant.action.value;

        if (condition.kind === 'normalized-equals') {
            return condition.normalized.value;
        }

        return Array.isArray(condition.value)
            ? condition.value.join(', ')
            : condition.value;
    }

    public isBoolean(variant: ActionVariant): boolean {
        return typeof this.raw(variant) === 'boolean';
    }

    public name(variant: ActionVariant): string {
        const target = this.descriptors().find(
            (entry) => entry.id === variant.action.targetId,
        );

        const features = target?.fingerprint.features;

        return (
            features?.accessibleName ||
            features?.label ||
            features?.text ||
            variant.action.targetId
        );
    }

    public remove(groupId: string, variantId?: string): void {
        this.changed.emit({
            choiceGroups: this.job().choiceGroups!.flatMap((group) => {
                if (group.id !== groupId) {
                    return [group];
                }

                const variants = variantId
                    ? group.variants.filter((entry) => entry.id !== variantId)
                    : [];

                return variants.length ? [{...group, variants}] : [];
            }),
        });
    }
}
