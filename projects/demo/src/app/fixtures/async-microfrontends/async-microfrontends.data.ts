import {
    type FieldValue,
    type ProcedureField,
} from '../../shared/demo-form/procedure-field.component';

export interface AsyncMicrofrontendDefinition {
    readonly name: string;
    readonly title: string;
    readonly mountDelayMs: number;
    readonly readyDelayMs: number;
    readonly fields: readonly ProcedureField[];
    readonly extraField: ProcedureField;
    readonly initialValues: Readonly<Record<string, FieldValue>>;
}

/** Независимые задержки подключения и получения данных имитируют загрузку трёх приложений. */
export const ASYNC_MICROFRONTENDS: readonly AsyncMicrofrontendDefinition[] = [
    {
        name: 'profile',
        title: 'Сведения о сотруднике',
        mountDelayMs: 200,
        readyDelayMs: 900,
        fields: [
            {id: 'async-profile-name', label: 'Имя сотрудника', kind: 'input'},
            {
                id: 'async-profile-department',
                label: 'Отдел',
                kind: 'select',
                options: ['Разработка', 'Поддержка', 'Продажи'],
            },
        ],
        extraField: {
            id: 'async-profile-details',
            label: 'Дополнительное поле',
            kind: 'input',
        },
        initialValues: {
            'async-profile-name': 'Анна',
            'async-profile-department': 'Разработка',
        },
    },
    {
        name: 'employment',
        title: 'Детали обучения',
        mountDelayMs: 900,
        readyDelayMs: 900,
        fields: [
            {id: 'async-employment-comment', label: 'Комментарий', kind: 'input'},
            {id: 'async-employment-days', label: 'Количество дней', kind: 'number'},
            {id: 'async-employment-practice', label: 'Нужна практика', kind: 'checkbox'},
        ],
        extraField: {
            id: 'async-employment-details',
            label: 'Дополнительное поле',
            kind: 'input',
        },
        initialValues: {
            'async-employment-comment': 'Первичное обучение',
            'async-employment-days': 3,
            'async-employment-practice': false,
        },
    },
    {
        name: 'review',
        title: 'Подтверждение заявки',
        mountDelayMs: 1600,
        readyDelayMs: 900,
        fields: [
            {id: 'async-review-comment', label: 'Комментарий', kind: 'input'},
            {id: 'async-review-approved', label: 'Данные проверены', kind: 'checkbox'},
        ],
        extraField: {
            id: 'async-review-details',
            label: 'Дополнительное поле',
            kind: 'input',
        },
        initialValues: {'async-review-comment': '', 'async-review-approved': false},
    },
];
