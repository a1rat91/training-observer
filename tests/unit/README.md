# Модульные тесты

Это отдельный Nx-проект `training-tests` с Jest. Здесь проверяются взаимодействия пакетов, поэтому тесты не размещены в
core и не создают обратных зависимостей core → recording/runtime.

- `npm run test:unit` — весь модульный набор.
- `npx nx test training-tests --testFile=state-recorder.test.js` — один файл.
- В тестах используются `test`, `expect` и lifecycle-функции из `@jest/globals`.
- `jest.preset.js` преобразует TypeScript исходников через ts-jest и разрешает aliases из `tsconfig.json`.
- По умолчанию среда Node; проверки DOM явно выбирают `@jest-environment jsdom`.

JS-файлы содержат тестовые данные и проверки. Production-код остаётся на строгом TypeScript. `node:test`, `node:assert`
и собственный загрузчик TypeScript больше не используются.
