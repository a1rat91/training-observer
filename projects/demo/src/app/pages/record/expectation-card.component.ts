/** Карточка ожидания показывает тип и контекст поля, редактирует значение и сообщения.
 * Получает готовую модель и выдаёт частичные изменения; не наблюдает DOM и не сохраняет сценарий.
 * Преобразует ввод в исходный тип значения, а предпросмотр отображает текст без выполнения HTML.
 */
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    type OnChanges,
    output,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {NonNullableFormBuilder, ReactiveFormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {type FieldExpectation} from '@training-observer/contracts';
import {ControlType} from '@training-observer/core/models';
import {map, merge} from 'rxjs';

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
    imports: [ReactiveFormsModule, TuiButton, TuiCheckbox, TuiTextfield],
    templateUrl: './expectation-card.component.html',
    styleUrl: './expectation-card.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpectationCardComponent implements OnChanges {
    private readonly builder = inject(NonNullableFormBuilder);

    public readonly field = input.required<FieldExpectation>();
    public readonly changed = output<Partial<FieldExpectation>>();

    protected readonly form = this.builder.group({
        expectedBoolean: false,
        expectedText: '',
        expectedItems: this.builder.array<string>([]),
        message: '',
        successMessage: '',
        optional: false,
    });

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

    constructor() {
        const {
            expectedBoolean,
            expectedText,
            expectedItems,
            message,
            successMessage,
            optional,
        } = this.form.controls;

        merge(
            expectedBoolean.valueChanges.pipe(map((expected) => ({expected}))),
            expectedText.valueChanges.pipe(
                map((value) => ({expected: this.expectedValue(value)})),
            ),
            expectedItems.valueChanges.pipe(
                map((expected) => ({expected: [...expected]})),
            ),
            message.valueChanges.pipe(map((message) => ({message}))),
            successMessage.valueChanges.pipe(map((successMessage) => ({successMessage}))),
            optional.valueChanges.pipe(map((optional) => ({optional}))),
        )
            .pipe(takeUntilDestroyed())
            .subscribe((patch) => this.changed.emit(patch));
    }

    public ngOnChanges(): void {
        const field = this.field();
        const expected = field.expected;
        const items = this.isArray() && Array.isArray(expected) ? [...expected] : [];
        const controls = this.form.controls.expectedItems;

        // Сохраняем controls при возврате patch из редактора, чтобы строка не теряла фокус.
        while (controls.length > items.length) {
            controls.removeAt(controls.length - 1, {emitEvent: false});
        }

        while (controls.length < items.length) {
            controls.push(this.builder.control(''), {emitEvent: false});
        }

        this.form.setValue(
            {
                expectedBoolean: expected === true,
                expectedText: Array.isArray(expected)
                    ? (expected[0] ?? '')
                    : String(expected),
                expectedItems: items,
                message: field.message,
                successMessage: field.successMessage ?? '',
                optional: field.optional,
            },
            {emitEvent: false},
        );
    }

    protected addExpected(): void {
        this.form.controls.expectedItems.push(this.builder.control(''));
    }

    protected removeExpected(index: number): void {
        this.form.controls.expectedItems.removeAt(index);
    }

    private expectedValue(value: string): FieldExpectation['expected'] {
        let expected: FieldExpectation['expected'] = value;

        if (this.field().descriptor.kind === 'combobox') {
            expected = value ? [value] : [];
        }

        return expected;
    }
}
