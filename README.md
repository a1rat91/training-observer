# Training Observer

Обучение по наблюдаемому состоянию интерфейса. Администратор записывает пример, редактирует ожидания, ученик
воспроизводит итоговые значения и переходы. DOM основного приложения не размечается учебными локаторами; LLM и платные
DAP не используются.

## С чего начать

1. [Архитектура и алгоритмы](ARCHITECTURE.md) — границы пакетов, поток данных, правила значений и переходов.
2. [Руководство разработчика](docs/developer-guide.md) — запуск, подключение, расширение, проверка и диагностика.
3. [Пользование demo](docs/demo-guide.md) — запись, редактирование, публикация, прохождение.
4. [Оставшийся MVP](docs/roadmap.md) — незавершённые возможности. [Указатель документации](docs/README.md) отделяет
   справочник и архив.

## Пакеты

| Пакет                                 | Ответственность                                                    | Входная точка                                                         |
| ------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `@training-observer/core`             | Angular-наблюдение DOM и областей, blur, диагностическая подсветка | [src/index.ts](libs/training-observer/src/index.ts)                   |
| `@training-observer/core/models`      | Сериализуемые модели DOM и enum                                    | [models/src/index.ts](libs/training-observer/models/src/index.ts)     |
| `@training-observer/core/adapters`    | Чистый SDK адаптеров и проекция сохранённого снимка                | [adapters/src/index.ts](libs/training-observer/adapters/src/index.ts) |
| `@training-observer/contracts`        | JSON-форматы, валидация и общие правила учебного значения          | [src/index.ts](libs/training-contracts/src/index.ts)                  |
| `@training-observer/recording`        | Angular-сеанс записи, журнал администратора и компиляция сценария  | [src/index.ts](libs/training-recording/src/index.ts)                  |
| `@training-observer/runtime`          | Angular-сеанс тренировки, сопоставление, переходы и обратная связь | [src/index.ts](libs/training-runtime/src/index.ts)                    |
| `@training-observer/taiga-ui`         | Angular provider и правила распознавания Taiga UI 4                | [src/index.ts](libs/training-taiga-ui/src/index.ts)                   |
| `@training-observer/procedure-player` | Angular-наблюдение плееров, переходы блоков и адаптеры компонентов | [Руководство](libs/training-procedure-player/README.md)               |

`provideRecordingSession()` и `RecordingSession` находятся в [recording](libs/training-recording/README.md),
`provideTrainingSession()` и `TrainingSession` — в [runtime](libs/training-runtime/README.md). Они автоматически
управляют наблюдением, доставкой состояний и очисткой ресурсов. Общий `ObservationConnection` принадлежит core;
feature-библиотеки используют его без дополнительного интеграционного пакета.

Для `procedure-player` зарегистрируйте `provideProcedurePlayerAdapter()` из `@training-observer/procedure-player`.
Только этот адаптер читает `block-id` приложения и переводит его в `ScreenState.key`; recording/runtime работают с общим
состоянием экрана и не знают имён DOM-атрибутов. `ProcedurePlayerObserver.blockChanges$` сообщает об изменениях блоков
независимо для каждого экземпляра микрофронта и не требует запуска записи.

Core знает границы `<microfrontend>` и имена областей из `localName` их непосредственных дочерних компонентов.
`block-id` не нужен всем микрофронтам: это правило адаптера процедур, а не условие общего обнаружения контролов.

Core не импортирует и не экспортирует запись, сценарии или проверку ответов. Recording и runtime не зависят друг от
друга. Core по умолчанию распознаёт native/ARIA-контролы. Для Taiga UI явно подключите `provideTaigaUiAdapter()` из
`@training-observer/taiga-ui` в `ApplicationConfig.providers` один раз. Локальные регистрации через
`provideControlAdapters()` дополняют унаследованные адаптеры. Повторная регистрация того же экземпляра безопасна; разные
адаптеры с одним ID вызывают ошибку. Сам адаптер Taiga не импортирует компоненты Taiga UI. localStorage и тестовый HTTP
backend принадлежат demo.

Основные точки входа `core`, `recording`, `runtime`, `taiga-ui` и `procedure-player` предоставляют Angular API. Правила
проекции, записи и проверки остаются обычными функциями и классами внутри своих feature-библиотек.

Для диагностики нескольких микрофронтов `providePageObservation()` предоставляет локальный `PageObservation`: после
рендера он автоматически обнаруживает `boundarySelector` из настроек (по умолчанию `microfrontend > *`), публикует
`areas()` и освобождает ресурсы вместе с владельцем DI. Виджет demo `<tc-controls-widget />` сам предоставляет этот
контекст; `RecordingSession`, кнопка записи и `PROCEDURE_SCREEN` ему не нужны. Он группирует текущие значения и
blur-подтверждения по микрофронтам и показывает ошибки областей.

## Запуск

Требуется Node **22.19+ в ветке 22**, npm и Google Chrome для browser tests. Версии проекта: Angular **19.2**, Taiga UI
**4.98**. Конфигурации инструментов и версия Taiga UI перенесены из `main`.

```sh
npm ci
npm start
```

Открыть `http://localhost:4200/record`. Пять разделов: `/record`, `/controls`, `/microfrontends`, `/learn`,
`/input-inspector`. Корневой путь перенаправляется на запись.

```sh
npm run check                 # границы + формат + все Jest-проекты + production build
npm run test:pw               # полный browser-набор, локальный сервер 4301
node scripts/verify-packages.mjs # после build: независимый Angular consumer собранных пакетов
npm run format                # применить единое оформление
npm run test:load              # отдельные измерения, production сервер 4302
```

Каждая библиотека собирается отдельно. `npm run build` собирает все библиотеки и demo в `dist/`. `npx nx graph`
открывает граф Nx-проектов — это средство разработки, не часть обучения.

## Главные правила

- Запись Input/Number/Select/ComboBox — после выхода фокуса из логического поля.
- Начальные checkbox/radio записываются сразу, включая false; последнее значение остаётся в сценарии.
- У ученика уже заполненные ответы учитываются при входе. Последующие правки текстовых полей — после blur.
- Внутри экрана поля независимы по порядку; экраны идут по сохранённой последовательности.
- ComboBox сравнивается по видимому тексту. Ручной ввод того же текста равнозначен выбору, если сам контрол его
  сохранил.
- Unknown, redacted и ambiguous не выдаются за ошибку ученика или за правильный ответ.
- Наблюдение состояния не доказывает клик, происхождение изменения или скрытый backend ID.

## Изменение импортов после разделения

JSON v1 и ключи localStorage не изменены. Исходные импорты учебной логики из core нужно заменить:

```ts
import {provideDomObservation, TrainingObserver, readScreenState} from '@training-observer/core';

// В компоненте-владельце: providers: [provideDomObservation()]
import {ControlType, ScreenStatus} from '@training-observer/core/models';
import {parseScenario, type TrainingScenario} from '@training-observer/contracts';
import {StateRecorder, compileScenario} from '@training-observer/recording';
import {ScenarioRuntime} from '@training-observer/runtime';
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui';

// Один раз в ApplicationConfig.providers: [provideTaigaUiAdapter()]
```

Полный пример и правила жизненного цикла — в руководстве разработчика.
