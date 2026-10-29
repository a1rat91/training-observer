# Procedure Player: DOM-адаптер компонентов плеера

`@training-observer/procedure-player` экспортирует `procedurePlayerAdapter` — один адаптер, который обслуживает
**несколько** компонентов процедурного плеера. Ветки для новых компонентов добавляются в `match`/`resolveLabel` по мере
распознавания.

Распознавание опирается на сохранённые DOM-признаки, без экземпляров Angular и private-полей компонентов. Основная точка
входа использует только чистые `core/adapters` и `core/models`: её можно импортировать без Angular и RxJS.

## Что обрабатывает адаптер

### Таблица `<procedure-player-table>`

- Каждая строка таблицы (`<tr>` с radio `tuiradio`) становится контролом-radio: выбор несёт `checked`, а меткой служит
  весь текст строки.
- Остальной chrome таблицы (поиск, фильтры, сортировка, переключатель фильтров, пагинация) не проецируется как контролы
  данных.

Приоритет адаптера — `200`, выше `taiga-ui` (`100`), поэтому для radio-строк он уточняет распознанный Taiga-контрол.

## Добавление нового компонента

Новый компонент плеера — отдельная ветка в `match` (и при необходимости в `resolveLabel`), с собственным host-селектором
и правилами. Адаптер остаётся единственным; регистрация не меняется.

## Использование без Angular

```ts
import {projectControls} from '@training-observer/core/adapters';
import {procedurePlayerAdapter} from '@training-observer/procedure-player';

const controls = projectControls(snapshot, [procedurePlayerAdapter]);
```

## Регистрация в Angular

```ts
import {provideProcedurePlayerAdapter} from '@training-observer/procedure-player/angular';

export const appConfig = {
  providers: [provideProcedurePlayerAdapter()],
};
```

Вторичная точка входа `/angular` вызывает `provideControlAdapters(procedurePlayerAdapter)` из core.
