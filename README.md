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

| Пакет                            | Ответственность                                                  | Входная точка                                                     |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@training-observer/core`        | DOM capture, распознавание, наблюдение, blur, optional highlight | [src/index.ts](libs/training-observer/src/index.ts)               |
| `@training-observer/core/models` | Только сериализуемые модели DOM и enum, без Angular              | [models/src/index.ts](libs/training-observer/models/src/index.ts) |
| `@training-observer/contracts`   | JSON-форматы, валидация и общие правила учебного значения        | [src/index.ts](libs/training-contracts/src/index.ts)              |
| `@training-observer/recording`   | Запись администратора, удаление строк, компиляция сценария       | [src/index.ts](libs/training-recording/src/index.ts)              |
| `@training-observer/runtime`     | Сопоставление ожиданий, переходы, прогресс и сообщения           | [src/index.ts](libs/training-runtime/src/index.ts)                |

Core не импортирует и не экспортирует запись, сценарии или проверку ответов. Recording и runtime не зависят друг от
друга. Taiga UI, localStorage и тестовый HTTP backend принадлежат demo.

## Запуск

Требуется Node **22.19+ в ветке 22**, npm и Google Chrome для browser tests. Версии проекта: Angular **19.2**, Taiga UI
**4.98**. Конфигурации инструментов и версия Taiga UI перенесены из `main`.

```sh
npm ci
npm start
```

Открыть `http://localhost:4200/record`. Три раздела: `/record`, `/controls`, `/learn`. Корневой путь перенаправляется на
запись.

```sh
npm run check                 # границы + формат + unit + production build
npm run test:pw               # полный browser-набор, локальный сервер 4301
npm run format                # применить единое оформление
npm run test:load              # отдельные измерения, production сервер 4302
```

Каждая библиотека собирается отдельно. `npm run build` собирает все четыре библиотеки и demo в `dist/`. `npm run graph`
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
import {TrainingObserver, readScreenState} from '@training-observer/core';
import {ControlType, ScreenStatus} from '@training-observer/core/models';
import {parseScenario, type TrainingScenario} from '@training-observer/contracts';
import {StateRecorder, compileScenario} from '@training-observer/recording';
import {ScenarioRuntime} from '@training-observer/runtime';
```

Полный пример и правила жизненного цикла — в руководстве разработчика.
