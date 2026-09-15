/** Карточка ожидания показывает тип и контекст поля, редактирует значение и сообщения.
 * Получает готовую модель и выдаёт частичные изменения; не наблюдает DOM и не сохраняет сценарий.
 * Преобразует ввод в исходный тип значения, а предпросмотр отображает текст без выполнения HTML.
 */
import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {type FieldExpectation} from '@training-observer/contracts';
import {ControlType} from '@training-observer/core/models';

const TYPE_NAMES: Record<ControlType, string> = {
    [ControlType.Textbox]: 'Input',
    [ControlType.Number]: 'Числовое поле',
    [ControlType.Button]: 'Кнопка',
    [ControlType.Checkbox]: 'Checkbox',
    [ControlType.Radio]: 'Radio button',
    [ControlType.Switch]: 'Переключатель',
    [ControlType.Select]: 'Select',
    [ControlType.ComboBox]: 'ComboBox',
};

@Component({
    selector: 'app-expectation-card',
    imports: [FormsModule, TuiCheckbox, TuiTextfield],
    templateUrl: './expectation-card.component.html',
    styleUrl: './expectation-card.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpectationCardComponent {
    public readonly field = input.required<FieldExpectation>();
    public readonly changed = output<Partial<FieldExpectation>>();

    protected readonly label = computed(
        () => this.field().descriptor.label || 'Без подписи',
    );

    protected readonly typeName = computed(
        () => TYPE_NAMES[this.field().descriptor.kind],
    );

    protected readonly context = computed(() =>
        this.field()
            .descriptor.context.map((item) => item.label)
            .filter(Boolean)
            .join(' → '),
    );

    protected readonly isBoolean = computed(
        () => typeof this.field().expected === 'boolean',
    );

    protected readonly isArray = computed(
        () =>
            this.field().descriptor.kind !== 'combobox' &&
            Array.isArray(this.field().expected),
    );

    protected readonly textValue = computed(() => {
        const value = this.field().expected;

        return Array.isArray(value) ? value.join('; ') : String(value);
    });

    protected setValue(value: string): void {
        let expected: FieldExpectation['expected'] = value;

        if (this.field().descriptor.kind === 'combobox') {
            expected = value ? [value] : [];
        } else if (Array.isArray(this.field().expected)) {
            expected = value ? value.split(';').map((item) => item.trim()) : [];
        }

        this.changed.emit({expected});
    }
}
