# Taiga UI: DOM-адаптер контролов

`@training-observer/taiga-ui` — Angular-библиотека для регистрации и распознавания контролов Taiga UI 4.98. Основная
точка входа экспортирует `provideTaigaUiAdapter()` и `taigaUiAdapter`. Angular и RxJS — обязательные peer dependencies.
Сами пакеты Taiga UI не являются runtime-зависимостью адаптера: распознавание опирается на сохранённые DOM-признаки, без
экземпляров и private-полей компонентов.

## Проекция сохранённого снимка

```ts
import {projectControls} from '@training-observer/core/adapters';
import {taigaUiAdapter} from '@training-observer/taiga-ui';

const controls = projectControls(snapshot, [taigaUiAdapter]);
```

Core отвечает за native-контролы. Адаптер добавляет Taiga-host, floating label и правила Input/Number/Select/ComboBox, а
также Taiga-кнопок, checkbox, radio и switch. Известные cleaner-кнопки объединяются только с поддержанным полем;
независимые кнопки остаются контролами. Filler, редакторы select-like, неподдержанные multi-поля и поддеревья
`tui-scroll-controls` исключаются по прежним DOM-правилам. Произвольный dropdown у Input/Number сохраняет семантику поля
ввода и признак popup, а не превращает его в Select/ComboBox.

Для date/time-полей читается видимая строка `.t-ghost`: она остаётся значением textbox, без преобразования в дату или
диапазон. Поддержаны `tui-input-date`, `tui-input-date-range`, `tui-input-date-time`, `tui-input-month`,
`tui-input-month-range`, `tui-input-time` и `tui-input-time-range`. Поддеревья `tui-calendar` исключаются из capture.

Выбранные теги `tui-multi-select` сохраняются как `string[]`, включая `[]` после очистки. Поисковый input и посторонние
`.t-text` не считаются выбором. Значение берётся из DOM-тегов, а не из скрытых Angular-объектов. Ручной текст обычного
textbox и строки дат сохраняются без изменения.

Приоритет адаптера — `100`. Бизнес-адаптер с большим приоритетом может уточнять распознанный Taiga-контрол через
`baseCandidate`: исходный host, popup и floating label сохраняются, пока он не задаёт собственные значения. Cleaner
остаётся исключённым и после такого уточнения. `resolveValue` внутреннего Taiga-слоя также сохраняется, если внешний
адаптер не возвращает собственное значение.

## Регистрация в Angular

```ts
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui';

export const appConfig = {
  providers: [provideTaigaUiAdapter()],
};
```

Провайдер вызывает `provideControlAdapters(taigaUiAdapter)` из core. Регистрация действует в соответствующем injector
scope. Регистрация и правила распознавания находятся в одном Angular API библиотеки.

## Как читать реализацию

`taiga-ui-dom.ts` содержит внутренние enum DOM-признаков Taiga и общие проверки host/attribute/class.
`taiga-ui-control-rules.ts` задаёт порядок распознавания: явные Select/ComboBox/Number, обычный dropdown, legacy-host и
native-маркеры. `taiga-ui-adapter.ts` связывает эти правила с исключениями, метками и чтением значений. Эти enum и
функции остаются внутренними деталями; публичный API адаптера не меняется.

## Проверка

`npx nx build training-taiga-ui` собирает Angular-библиотеку. Проекции date/time и multi-select проверяются в Angular
Jest и на реальных компонентах Taiga UI в Playwright. Проверка опубликованных пакетов использует основной импорт
библиотеки в независимом Angular consumer.
