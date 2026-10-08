# Taiga UI: DOM-адаптер контролов

`@training-observer/taiga-ui` экспортирует `taigaUiAdapter` для DOM Taiga UI 4.98. Основная точка входа использует
только чистые `core/adapters` и `core/models`: её можно импортировать без Angular, RxJS и установленных пакетов Taiga
UI. Распознавание опирается на сохранённые DOM-признаки, без экземпляров Angular и private-полей компонентов.

## Использование без Angular

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

Приоритет адаптера — `100`. Бизнес-адаптер с большим приоритетом может уточнять распознанный Taiga-контрол через
`baseCandidate`: исходный host, popup и floating label сохраняются, пока он не задаёт собственные значения. Cleaner
остаётся исключённым и после такого уточнения.

## Регистрация в Angular

```ts
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui/angular';

export const appConfig = {
  providers: [provideTaigaUiAdapter()],
};
```

Вторичная точка входа `/angular` вызывает `provideControlAdapters(taigaUiAdapter)` из core. Регистрация действует в
соответствующем injector scope. Для Angular-интеграции нужны optional peer dependencies `@angular/common`,
`@angular/core` и `rxjs`; Taiga UI не является runtime-зависимостью или peer dependency адаптера.

## Проверка

`npx nx build training-taiga-ui` собирает обе точки входа. Проверки чистых пакетов импортируют primary entry point без
Angular и RxJS; Angular AOT-проверка импортирует provider из `/angular`.
