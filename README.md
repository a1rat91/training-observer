# Training Observer

Каркас Nx workspace на Angular 19. Структура `projects/` организована по примеру ng-draw-flow.

## Проекты

| Проект | Назначение |
| --- | --- |
| `projects/training-observer` | Собираемая Angular-библиотека `@training-observer/core`. Пока содержит только пустой сервис `TrainingObserver`. |
| `projects/parser` | Приложение будущего парсера страницы. |
| `projects/demo` | Приложение для будущих демонстрационных примеров. |

Оба приложения используют standalone-компоненты, Angular Router, Less и Taiga UI.
Версии: Angular 19.2.25, Angular CLI 19.2.27, Nx 20.8.4, Taiga UI 5.15.0, TypeScript 5.8.3.

## Запуск

Требуется Node.js 22 (версия зафиксирована в `.nvmrc`).

```sh
nvm use
npm ci
npm start
```

Demo: [http://127.0.0.1:4200](http://127.0.0.1:4200).

```sh
npm run start:parser
```

Parser: [http://127.0.0.1:4201](http://127.0.0.1:4201).

Одновременный запуск двух приложений:

```sh
npm run start:all
```

## Сборка

```sh
npm run build
```

Результаты: `dist/demo/browser`, `dist/parser/browser`, `dist/training-observer`.

Отдельная сборка библиотеки: `npx nx build training-observer`.
Граф проектов: `npm run graph`.

## Граница первого этапа

Сейчас реализован только каркас проектов с начальными страницами. Наблюдение за DOM,
парсинг контролов, запись действий, проверка ученика и подключение микрофронтенда
будут добавляться отдельными шагами. Приложения пока не связаны между собой.

Следующий шаг после коммита — согласовать минимальную модель состояния страницы
и реализовать первый снимок DOM. Разбор `buildDomTree.js` относится к этому шагу.
