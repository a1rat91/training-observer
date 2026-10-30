# Procedure Player

`@training-observer/procedure-player` — Angular-библиотека для распознавания текущего блока процедур внутри области
микрофронта и наблюдаемых переходов. Основная точка входа экспортирует провайдер, `ProcedurePlayerObserver` и функции
проекции сохранённых снимков. Angular и RxJS — обязательные peer dependencies. Правила проекции и трекер переходов
остаются обычными функциями и классами без чтения Angular-компонентов.

## DOM-контракт

```html
<microfrontend>
  <some-application>
    <section
      block-id="application-profile"
      aria-busy="false"
    >
      <!-- Контролы текущего блока -->
    </section>
  </some-application>
</microfrontend>
```

Известна обёртка `<microfrontend>`; имя вложенного корневого компонента заранее неизвестно. `some-application` в примере
— условное имя приложения, а не специальный тег библиотеки. Его `localName` становится именем микрофронта. По умолчанию
область обнаруживается селектором `microfrontend > *`. `procedurePlayerScreenAdapter` ищет текущий `block-id` внутри
переданного снимка этой области, а `procedurePlayerAdapter` распознаёт известные компоненты внутри неё; это независимые
адаптеры с общей регистрацией.

`block-id` — правило приложения процедур. Core знает только границы областей и имя компонента; другие микрофронты не
обязаны иметь этот атрибут. Этот адаптер переводит его в общий `ScreenState.key`, а recording/runtime используют только
состояние экрана, не обращаясь к DOM-атрибутам.

`block-id` может находиться на корне области или на её единственном видимом блоке. Значение должно быть непустым
стабильным ключом. Контролы ограничиваются поддеревом этого блока; соседние и вложенные микрофронты не включаются. Два
видимых блока дают `ambiguous`. Без атрибута `block-id` адаптер не распознаёт экран процедуры; пустое значение ключа
даёт `unavailable`. Скрытые блоки не участвуют. `aria-busy="true"` на текущем блоке означает `loading`. Корневой
компонент без собственного прямоугольника, например с `display: contents`, не мешает распознать видимый блок.

## Подключение записи и тренировки

```ts
import {provideProcedurePlayerAdapter} from '@training-observer/procedure-player';
import {provideRecordingSession} from '@training-observer/recording';
import {provideTrainingSession} from '@training-observer/runtime';

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
import {ProcedurePlayerObserver} from '@training-observer/procedure-player';

const observer = inject(ProcedurePlayerObserver);
observer.blockChanges$.pipe(takeUntilDestroyed()).subscribe((event) => {
  // {
  //   kind: 'block-change', source: 'procedure-player',
  //   microfrontendId: 'mf1', previousBlockId: 'profile', blockId: 'details'
  // }
});
// observer.players() — состояние каждого обнаруженного плеера.
```

Провайдер регистрирует локальный `PageObservation` из core. Он обнаруживает области по настроенному `boundarySelector`,
по умолчанию `microfrontend > *`; имена корневых компонентов не перечисляются в коде адаптера. Наблюдение начинается
после рендера при инъекции этого владельца или `ProcedurePlayerObserver` и не требует запуска записи. Области,
появившиеся позже, обнаруживаются автоматически; каждый экземпляр имеет свой `microfrontendId`. Первое готовое состояние
задаёт точку отсчёта. Изменение контролов, loading и повтор прежнего ID не создают `block-change`. Удаление области
освобождает её историю; уничтожение владельца освобождает наблюдение и завершает поток событий. `players()` подходит для
отображения, а `blockChanges$` синхронно обрабатывает каждый опубликованный кадр страницы: A → Б → A до следующего
Angular change detection даёт оба перехода.

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

Ветки для новых компонентов добавляются в `match`/`resolveLabel`; публичная регистрация остаётся общей. Проекция уже
сохранённого снимка:

```ts
import {projectControls} from '@training-observer/core/adapters';
import {procedurePlayerAdapter} from '@training-observer/procedure-player';

const controls = projectControls(snapshot, [procedurePlayerAdapter]);
```
