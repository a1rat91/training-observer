# Contracts: формат обучения и общие правила значений

`@training-observer/contracts` — общий язык записи и прохождения. Не запускает наблюдение, не ведёт журнал,
не переключает шаги, не использует Angular/UI/storage. Зависит только от чистой точки входа core/models.

## Публичный API и файлы

| Модуль | Содержимое |
| --- | --- |
| `src/lib/recording.models.ts` | StateRecording, RecordedEvent, RecordedValue |
| `src/lib/scenario.models.ts` | TrainingScenario, ScenarioStep, FieldExpectation |
| `src/lib/training-enums.ts` | RecordingEventKind, TrainingStatus, MatchStatus |
| `src/lib/control-value.ts` | чтение учебного значения, blur/initial правила, точный fingerprint |
| `src/lib/recording-codec.ts` | parseStateRecording |
| `src/lib/scenario-codec.ts` | parseScenario |
| `src/lib/validation.ts` | внутренние guards unknown → descriptor/value/object |

Начните с моделей, затем control-value и codecs. `src/index.ts` определяет публичную границу.
Общие типы расположены здесь, чтобы recording и runtime не зависели друг от друга.

## Форматы

Запись: `{kind: 'training-state-recording', version: 1, complete, events}`.
Сценарий: `{kind: 'training-state-scenario', version: 1, steps}`.
Событие содержит sequence, visit, screenKey и kind; value-событие дополнительно descriptor и значение.
Шаг содержит ключ экрана, задание, сообщение перехода и список ожиданий. Ожидание содержит descriptor,
expected, message, optional. Поле optional исключает проверку; false является обычным обязательным expected.

## Алгоритм валидации

Парсер сначала проверяет размер/JSON-объект, kind/version и разрешённые ключи, затем каждый вложенный объект.
Descriptor и value проверяются общими guards. Сценарий не создаёт фиктивную запись для её повторного парсинга.
Запись ограничена 1 млн символов и 10 тыс. событий; сценарий — 1 млн символов и 500 шагами.
Неизвестные версии, лишние поля, неправильная последовательность номеров и complete с unavailable отклоняются.
Семантику посещений проверяет компилятор recording: успешный parse ещё не означает пригодность к обучению.

## Правила значений

Input/Number — точная строка; Select — массив подписей; ComboBox — отображаемый текст в массиве или [].
Checkbox/radio/switch — boolean. Redacted, indeterminate и неизвестный Select возвращают undefined.
`requiresBlur` отделяет границу записи от чтения значения. `recordsInitialState` включает checkbox/radio.
`valueFingerprint` сохраняет точное значение, в том числе порядок массива и формат числа.

Изменение этих правил влияет одновременно на запись и runtime. Core эти функции не вызывает.
При изменении JSON меняйте версию/миграцию явно; enum member можно переименовать без изменения его строки.

## Проверка

`npx nx build training-contracts`; unit tests `tests/unit/state-recorder.test.mjs`, `scenario.test.mjs`.
Дополнительно `npm run lint` запрещает импорт recording/runtime/core-фасада.
Документы JSON v1 совместимы с состоянием проекта до разделения пакетов; action-формат ветки new не поддерживается.
