# Procedure Player

`@training-observer/procedure-player` содержит правила распознавания `player-procedure`, его текущего блока и
наблюдаемых переходов. Основная точка входа читает сохранённые снимки и не импортирует Angular, RxJS или Taiga UI.
Angular-регистрация и наблюдатель находятся в `/angular`.

## DOM-контракт

```html
<player-procedure>
  <section
    block-id="application-profile"
    aria-busy="false"
  >
    <!-- Контролы текущего блока -->
  </section>
</player-procedure>
```

Поддерживается также прежнее имя корневого тега `procedure-player`. `procedurePlayerScreenAdapter` определяет текущий
блок, а `procedurePlayerAdapter` распознаёт компоненты внутри него; это независимые адаптеры с общей регистрацией.

`block-id` может находиться на самом плеере или на его единственном видимом блоке. Значение должно быть непустым
стабильным ключом. Контролы ограничиваются поддеревом этого блока; соседние микрофронты и области в `microfrontend > *`
не включаются. Два видимых блока или несколько плееров в одном снимке дают `ambiguous`, а отсутствие блока или ID —
`unavailable`. Скрытые блоки не участвуют. `aria-busy="true"` на плеере или текущем блоке означает `loading`.

## Подключение записи и тренировки

```ts
import {provideProcedurePlayerAdapter} from '@training-observer/procedure-player/angular';

// Один раз в ApplicationConfig.providers:
provideProcedurePlayerAdapter();

// В providers компонента записи или тренировки:
provideRecordingSession();
provideTrainingSession();
```

Конфиг `PROCEDURE_SCREEN` не нужен. Адаптер переводит `block-id` в `ScreenState.key`. Смена готового блока использует
существующее событие записи `kind: 'screen'` с `screenKey` и номером посещения: JSON v1 и сохранённые сценарии
совместимы. А → Б → А создаёт три посещения, remount с прежним ID — одно. Подтверждение уходящего поля после blur
остаётся перед переходом. Явный `screen` в параметрах сеанса по-прежнему можно использовать для другого приложения.

Один сеанс записи или тренировки имеет один текущий блок. При нескольких плеерах предоставьте каждому владельцу
отдельный сеанс с `root`, например `provideRecordingSession({root: '#main-procedure'})`.

## События нескольких микрофронтов

```ts
import {inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ProcedurePlayerObserver} from '@training-observer/procedure-player/angular';

const observer = inject(ProcedurePlayerObserver);
observer.blockChanges$.pipe(takeUntilDestroyed()).subscribe((event) => {
  // {
  //   kind: 'block-change', source: 'procedure-player',
  //   microfrontendId: 'mf1', previousBlockId: 'profile', blockId: 'details'
  // }
});
// observer.players() — состояние каждого обнаруженного плеера.
```

Наблюдение начинается после рендера при создании сервиса и не требует запуска записи. Плееры, появившиеся позже,
обнаруживаются автоматически; каждый экземпляр имеет свой `microfrontendId`. Первое готовое состояние задаёт точку
отсчёта. Изменение контролов, loading и повтор прежнего ID не создают `block-change`. Удаление области освобождает её
историю; уничтожение владельца освобождает наблюдение и завершает поток событий.

Событие отражает переход между наблюдёнными снимками. Изменения A → Б → В внутри одного окна batching могут дать
наблюдаемый переход A → В. Это не журнал каждой низкоуровневой DOM-мутации.

## Адаптеры компонентов

`provideProcedurePlayerAdapter(...componentAdapters)` регистрирует встроенный `procedurePlayerAdapter` и дополнительные
`ControlAdapter` компонентов процедуры. Они работают в общей цепочке с native/ARIA и Taiga UI и могут дополнять её с
большим `priority`. Правила компонентов размещаются внутри этого пакета. Taiga UI подключается отдельно через
`provideTaigaUiAdapter()`.

### Таблица `<procedure-player-table>`

`procedurePlayerAdapter` имеет приоритет `200`, выше Taiga UI (`100`). Radio строки данных становится логическим
radio-контролом: `checked` хранит выбор, host — строка `tr`, метка — нормализованный текст всей строки. Поиск, фильтры,
сортировка, пагинация и остальные служебные контролы таблицы исключаются. Вне таблицы адаптер оставляет native/Taiga
распознавание без изменений.

Ветки для новых компонентов добавляются в `match`/`resolveLabel`; публичная регистрация остаётся общей. Чистое
использование без Angular:

```ts
import {projectControls} from '@training-observer/core/adapters';
import {procedurePlayerAdapter} from '@training-observer/procedure-player';

const controls = projectControls(snapshot, [procedurePlayerAdapter]);
```
