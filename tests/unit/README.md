# Модульные тесты

Это Nx-проект `training-tests` с Jest и Angular preset. Здесь проверяются алгоритмы и взаимодействия пакетов; сами
алгоритмические проверки не обязаны создавать TestBed. Основные package imports загружаются как Angular API, без скрытых
aliases на альтернативную реализацию.

- `npm run test:unit` — алгоритмический набор в этом каталоге.
- `npm test` — все Jest-проекты, включая Angular lifecycle и adapter-rule suites в demo.
- `npx nx test training-tests --testFile=state-recorder.test.js` — один файл.
- В тестах используются `test`, `expect` и lifecycle-функции из `@jest/globals`.
- Jest использует общие aliases из `tsconfig.json`; Angular preset преобразует TypeScript и Angular ESM.

JS-файлы содержат тестовые данные и проверки. Production-код остаётся на строгом TypeScript. `node:test`, `node:assert`
и собственный загрузчик TypeScript не используются.

Дополнительные проверки `procedure-player`, его компонентов и Taiga-значений находятся в
`projects/demo/src/app/shared/adapter-rules/*.spec.js`. Они импортируют основные точки входа feature-библиотек и
выполняются в Angular Jest-проекте demo. TestBed-тесты жизненного цикла, DI и виджета расположены рядом в `shared`.
