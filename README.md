# Training Observer

Nx workspace на Angular 19. Структура `projects/` организована по примеру ng-draw-flow.

## Проекты

| Проект | Назначение |
| --- | --- |
| `projects/training-observer` | Angular-библиотека `@training-observer/core`: ручной снимок DOM и native-состояния контролов. |
| `projects/parser` | Стенд парсера: форма, таблица контролов, полный снимок JSON. |
| `projects/demo` | Каркас приложения для будущего каталога примеров. |

Angular 19.2.25, CLI 19.2.27, Nx 20.8.4, Taiga UI 5.15.0, TypeScript 5.8.3.
Приложения используют standalone-компоненты, Angular Router и Less.

## Запуск

Требуется Node.js 22 (версия в `.nvmrc`).

```sh
nvm use
npm ci
npm run start:parser
```

Парсер: [http://127.0.0.1:4201](http://127.0.0.1:4201).
Измените форму и нажмите «Снять снимок». Обход читает выбранную область DOM;
инспектор не входит в область. Изменения появятся после следующего ручного снимка.

Demo: `npm start`, [http://127.0.0.1:4200](http://127.0.0.1:4200).
Одновременный запуск: `npm run start:all`.

## API библиотеки

В Angular injection context:

```ts
import {inject} from '@angular/core';
import {TrainingObserver} from '@training-observer/core';

const observer = inject(TrainingObserver);

// Вызвать в браузере, когда нужный DOM уже отрисован.
const snapshot = observer.capture(); // document.body по умолчанию
// observer.capture(element, {maxNodes: 5000}); — ограниченная область
// observer.snapshot() — последний снимок
// observer.controls() — потенциальные контролы, в том числе disabled/hidden
// observer.clear() — освободить последний снимок
```

Параметры по умолчанию задаются через `DOM_SNAPSHOT_OPTIONS`.
Собственный интерфейс наблюдателя можно исключить селектором
`[data-training-observer-ignore]`. На чужих контролах атрибуты не требуются.

Снимок: `nodes` по ID, `rootId`, `interactiveIds`, время обхода и статистика лимитов.
ID стабилен только для того же живого DOM-узла в рамках экземпляра сервиса.
`path` — структурный путь для диагностики, не локатор между сессиями.

Текущие ограничения: light DOM одного документа, ручной запуск, приблизительные
подписи/интерактивность/видимость. iframe и открытые shadow roots отмечаются как
необойдённые границы. Составные контролы Taiga UI ещё не нормализуются в один контрол.
Наблюдение, запись действий, подсветка и проверка ученика — следующие этапы.

[Полный разбор buildDomTree.js и схема переноса](docs/build-dom-tree-analysis.md).

## Проверки

```sh
npm run build
npm test
```

Сборка: `dist/demo/browser`, `dist/parser/browser`, `dist/training-observer`.
Отдельная сборка библиотеки: `npx nx build training-observer`.
Граф проектов: `npm run graph`.

Браузерные тесты Playwright используют установленный **Google Chrome** (`channel: chrome`)
и автоматически запускают parser на порту 4301. Проверяют граф снимка, текущие значения,
disabled/hidden/inert, перекрытия, динамическую замену узлов, редактирование пароля,
границы обхода и лимиты. При отсутствии Chrome установите его перед запуском тестов.
