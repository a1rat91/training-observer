# Demo: Angular-интеграция

Приложение показывает три независимые зоны: запись `/record`, диагностику `/controls`, прохождение `/learn`. Оно
использует Angular 19.2 и Taiga UI 4.98. К бизнес-алгоритмам библиотек относится только передача снимков и обработка
результатов; формы, HTTP и localStorage остаются здесь.

## Структура

- `src/app/pages/record` — RecordPageComponent, ScenarioEditorComponent, RecordingStore.
- `src/app/pages/learn` — автоматический запуск ScenarioRuntime и отображение Taiga Alerts.
- `src/app/pages/controls` — карточки наблюдения и выбор диагностических fixtures.
- `src/app/shared/demo-form` — тестовая форма, независимая от библиотек обучения.
- `src/app/shared/scenarios` — общее хранилище публикации и её связи с исходной записью.
- `src/app/fixtures` — нагрузочный и multi-MF примеры.
- `src/assets/procedure/screens.json` — тестовые HTTP-данные, не часть core или контрактов обучения.

## Алгоритм

RecordPageComponent наблюдает document.body, исключает собственный UI и передаёт ScreenState/ confirmedControls в
StateRecorder только при включённой записи. После Stop редактор создаёт ожидания, даёт их изменить и явно публикует в
ScenarioStore. LearnComponent читает публикацию, создаёт новый runtime и observer для новой попытки, передаёт обновления
и отображает только новые сообщения feedback с оформлением по kind. Сама форма не знает, записывает ли администратор или
проходит ученик.

Компоненты standalone/OnPush. DOM запускается через afterNextRender, значения выводятся signals, сервисы хранения
публикуют readonly signals. Шаблоны и стили вынесены в соседние файлы. Подписки/наблюдатели освобождаются по DestroyRef.
При изменении маршрута попытка не переносится в новую страницу.

## Запуск и тесты

Из корня: `npm start`, затем http://localhost:4200/record. Пользовательская инструкция —
[docs/demo-guide.md](../../docs/demo-guide.md). `npx nx build demo` собирает приложение с зависимостями.
`npm run test:pw` запускает browser-regression. Сохранение сценариев локальное, обмен между разными браузерами и
серверная публикация не реализованы.

## Обновление из main

Оболочка TuiDocMain содержит те же три раздела: запись, контролы, тренировка. `/controls?fixture=selectors` открывает
перенесённый инспектор областей по селекторам; старый адрес `/controls-example` перенаправляет на этот пример. Формы
используют API Taiga UI 4: TuiTextfield из core, TuiCheckbox/TuiRadio из kit, уведомления — TuiAlertService.
Select/ComboBox используют `*tuiTextfieldDropdown` и `<tui-data-list-wrapper new>`: это API новых контролов внутри v4.
Справка: [Taiga UI v4](https://taiga-ui.dev/v4/getting-started). Повторы providers из исходной конфигурации устранены.

Сборка использует custom-webpack, `main.browser.ts`, настройки SSR и окружения из main. `npm test` — Jest,
`npm run test:pw` — браузерные сценарии. Полные проверки описаны в
[руководстве разработчика](../../docs/developer-guide.md).

Карточка `pages/record/expectation-card.component.ts` получает одно ожидание и выдаёт изменения через Angular output.
Она показывает тип и контекст, редактирует ожидаемое значение, тексты ошибки/успеха и локальный предпросмотр.
`ScenarioEditorComponent` объединяет изменения в черновик и явно публикует его. Карточка не читает наблюдаемый DOM. На
странице ученика `FeedbackKind` определяет positive/negative оформление Taiga Alerts.

`pages/record/scenario-transfer.component.ts` переносит публикацию через файл: читает JSON, проверяет публичным
`parseScenario`, показывает сводку и сохраняет только по явному действию. Output `imported` просит редактор загрузить
новую публикацию. Незавершённое чтение игнорируется после выбора следующего файла или уничтожения компонента. Экспорт
использует `ScenarioStore.saved`, поэтому не захватывает несохранённый черновик. Редактор принимает необязательный
журнал: импортированный сценарий редактируется независимо от него. Связь с исходной записью сохраняется только для
сценариев, скомпилированных в этом браузере.

Все наблюдатели demo подключены через `provideDomObservation()` в локальных providers компонента. Angular DI и жизненный
цикл проверяются в `src/app/shared/observation-providers.spec.ts`. В Angular fakeAsync-тестах используются глобальные
test/beforeEach/afterEach, обёрнутые zone-testing; чистый Jest-набор в tests/unit по-прежнему использует импорт из
@jest/globals.
