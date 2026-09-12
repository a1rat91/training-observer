# @training-observer/core

Библиотека без UI. Наблюдает существующий DOM, записывает semantic actions, разрешает сохранённые цели и проверяет
действия пользователя по сценарию. Не получает модель целевого Angular-приложения и не добавляет tracking-маркеры.

## Публичные entry points

```ts
import {
  AreaRegistry,
  ElementRecorder,
  ElementResolver,
  ScenarioRuntime,
  describeElement,
  parseRecording,
  parseScenario,
} from '@training-observer/core';

import {AreaRegistryService, RecordingSessionService} from '@training-observer/core/angular';
```

Первый entry point не загружает Angular и может импортироваться без document. Для работы DOM-механизмам нужен
существующий browser root. Второй entry point требует Angular 19.2 и предоставляет сервис без UI. Импорт внутренних
файлов пакета через `src/...` не поддерживается.

## Angular-интеграция

Предоставляйте AreaRegistryService на уровне маршрута или компонента интеграции, а не отдельно в каждом целевом MF.
После готовности DOM вызовите connect(scope, definitions), например из afterNextRender. Сервис публикует readonly signal
areas(). При уничтожении injector ресурсы освобождаются через DestroyRef; для раннего завершения есть disconnect().

Scope принадлежит интеграции. Целевые MF обнаруживаются внутри него по существующим host-тегам и необязательному
контексту предка. Удаление самого scope требует disconnect. Вынесенные portals пока не входят в ownership registry.

Для записи предоставляйте также RecordingSessionService. После connect registry вызовите session.start(scope,
valuePolicy). Readonly recording()/running() отражают сеанс; setObserved(key, boolean) у registry facade действует без
перезапуска. При выключении области pending input/selection отменяется, завершённые действия сохраняются.
session.resolve(descriptor) использует key, сохранённый в документе v3; неизвестный key, missing/ambiguous root или
observe=false дают отказ.

## Ответственность API

- `ElementRecorder` — start/stop, действия и наблюдаемые состояния; ресурсы нужно освобождать при завершении сеанса.
- `describeElement` / `isObservableElement` — выбор и описание цели в админке; includeStatic разрешает заголовки и
  области результата.
- `ElementResolver` — поиск цели с объяснением результата; ambiguous/broken нельзя заменять выбором первого элемента.
- `draftScenario` — подготовка черновика из записи; автор проверяет задания, значения, ветки и completion.
- `ScenarioRuntime` — проверка действий, ожидание условий и snapshots; приложение отвечает за отображение подсказок.
- `AreaRegistry` — найденные, отсутствующие и неоднозначные MF, поколения экземпляров, ownership и observe policy.
- `parse*` / `serialize*` — граница wire-контрактов v2/v3; неизвестные поля и неподдержанные версии отклоняются.

## Границы текущей реализации

Runtime пока последовательный; свободный порядок и blur-only находятся в плане. RecorderOptions.areas ограничивает
чтение и запись выбранными областями. ResolverOptions.accepts фильтрует кандидатов до извлечения identity; Angular-сеанс
задаёт predicate по key цели. EventHub разделяет document listeners между подписчиками одного экземпляра пакета;
независимые копии пакета в разных bundle должны разделять этот экземпляр через интеграцию.

Recording/Scenario v3 сохраняют areas.definitions и areas.targets (targetId → areaKey). Descriptor и диагностические
Resolution остаются v2: их семантика не менялась. Generation и DOM-ссылки не сериализуются. Recorder с registry
экспортирует v3; без registry сохраняется поддержка однокорневого v2.

TargetResolver сверяет определения MF с registry интеграции и ищет каждый descriptor только в его текущем host.
ScenarioRuntime принимает options.areas; action и completion используют одну границу поиска. Отсутствующая область даёт
unknown для условий, включая expected:false. Появление плеера не отменяет выбор в поиске; remount MF самого действия
инвалидирует его intent. Документ не меняет observe интеграции.

При выключении MF ранее записанные цели остаются в журнале. Поэтому экспорт оставляет их definitions.observe=true: это
требование для будущего сеанса, а не последняя позиция переключателя администратора. Черновик сохраняет привязки
использованных целей; третий аргумент draftScenario(recording, finish, finishAreaKey) явно задаёт MF результата.

### Миграция

parseRecording/parseScenario продолжают читать v2 без изменений. Для работы с registry вызовите bindRecordingAreas или
bindScenarioAreas с явно проверенной таблицей всех целей и определениями MF. Пропущенные/повторные цели, неизвестные MF,
неизвестные поля и CSS вместо hostTag отклоняются. Автоматического назначения первого MF нет. Миграция привязок не
пересматривает старые locators/context и не меняет последовательную семантику сценария: результат нужно проверить на
целевом интерфейсе. Demo-прохождение принимает v3; для v2 показывает требование миграции. Сохранение сценариев и UI
приложений не входят в пакет.
