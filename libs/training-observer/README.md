# Core: наблюдение DOM

**Назначение:** превратить существующий DOM и browser-свойства в сериализуемые снимки и логические контролы. Core не
знает о записи администратора, ожидаемых ответах, учебных шагах и уведомлениях об ошибке.

## Точки входа

- `@training-observer/core` — Angular-фасады и сервисы.
- `@training-observer/core/models` — сериализуемые модели и enum; [отдельное описание](models/README.md).
- `@training-observer/core/adapters` — чистый SDK и проекция сохранённого графа; [описание](adapters/README.md).

`src/index.ts` — полный публичный API. Не импортируйте внутренние файлы из приложения. Пакет зависит от Angular
common/core, RxJS и tslib. На contracts/recording/runtime зависимостей нет.

## Структура и маршрут чтения

| Каталог/модуль                      | Роль                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `src/lib/training-observer.ts`      | Facade одного сеанса, readonly signals и lifecycle     |
| `src/lib/microfrontend-observer.ts` | независимые области с общими browser sources           |
| `src/lib/capture/`                  | обход DOM, свойства, подписи, геометрия, связи popup   |
| `src/lib/controls/`                 | Angular-обёртка чистой проекции                        |
| `adapters/src/`                     | native/ARIA проекция и SDK расширений                  |
| `src/lib/observation/`              | invalidation, batching, polling, blur, память выбора   |
| `src/lib/screen/`                   | конфигурируемое чтение ID и учёт посещений             |
| `src/lib/highlight/`                | необязательный overlay, не участвующий в распознавании |
| `src/lib/tokens/`                   | DI-настройки и их значения по умолчанию                |
| `models/src/`                       | JSON-модели DOM и контролов                            |

Читайте provideDomObservation → TrainingObserver → ObservationSessionFactory → DomObservationSession →
DomSnapshotBuilder → control-projection. Затем BlurConfirmation объясняет, почему сырое значение и подтверждённое
значение отличаются.

## Алгоритм

1. `start(root, options)` проверяет параметры и строит исходный снимок до замены старого сеанса.
2. DomCapture обходит light DOM и открытые shadow roots, соблюдая общие ограничения, и добавляет явно связанные popup.
3. Адаптеры объединяют служебные узлы в ControlSnapshot с target, host, value и locator hints.
4. Browser events, MutationObserver и polling native properties запускают объединённый capture.
5. Fingerprint подавляет одинаковые публикации; время capture не считается изменением страницы.
6. Native blur за пределы host/popup сохраняет уходящее поле до focusout-обработчиков приложения; settled capture
   публикует confirmedControls.
7. stop/clear/DestroyRef освобождают browser-ресурсы и отменяют отложенную работу.

Capture выполняется вне Angular zone, публикация signals — внутри. Один локально предоставленный сервис соответствует
lifecycle страницы. `start` на новом root заменяет сеанс, `capture` — ручное чтение, `flush` — завершение ожидающего
capture. `stop` сохраняет результат; `clear` его очищает.

Захваченное при blur значение уточняется после форматирования только в том же контексте экрана. Контекст берётся из
общих `ScreenState.key` и `rootNodeId` через локальный DI-reader; при смене экрана остаётся уходящее значение. Capture
не интерпретирует бизнес-атрибуты приложения: например, `block-id` читает только адаптер процедур. `focusout` также
поддерживается, но не перезаписывает уже ожидающее blur-подтверждение.

`start(root)` создаёт новый сеанс и сбрасывает прежние подтверждения. Для продолжения при замене физической области
используйте `reconnect(root)` после microtasks focusout: он сохраняет подтверждения и захваченные уходящие значения, не
перечитывая удалённый DOM. `reconnect(null)` освобождает ресурсы и публикует отсутствие снимка с сохранёнными
подтверждениями; следующий `reconnect(root)` наследует прежние настройки, если новые не переданы. Новая конфигурация
проверяется до остановки рабочего сеанса. Отдельный `capture(otherRoot)` по-прежнему только возвращает снимок другой
области, не меняя активный root или подтверждения.

## Что читать потребителю

- `snapshot()` — сырой граф, в том числе ограничения обхода.
- `logicalControls()` — текущее состояние логических полей.
- `confirmedControls()` — последнее состояние после выхода фокуса для данного DOM-экземпляра.
- `isObserving()`, `error()`, `scanCount()`, `revision()` — состояние сеанса и диагностика.
- `readScreenState(...)` — идентичность и готовность области, не ожидаемый шаг. `identity.element` выбирает
  единственного видимого потомка с ID; `ready` ждёт точного значения существующего атрибута корня. Пропуски и
  неоднозначность возвращаются явно, без выбора первого совпадения.

Пример интеграции — [руководство разработчика](../../docs/developer-guide.md).

## Ограничения

Taiga-правила находятся в отдельном `@training-observer/taiga-ui` и используют DOM-признаки версии 4.98. Для Angular
подключите `provideTaigaUiAdapter()` из `@training-observer/taiga-ui`. Core по умолчанию использует native/ARIA правила.
Сессионные ID меняются при remount. Подписи — приближённый алгоритм, не полный accessible-name standard. Структурный
path предназначен для диагностики. Core не гарантирует идентичность поля между документами. Password/file скрываются;
произвольная политика конфиденциальных данных ещё требует отдельной настройки. Неизвестные popup, iframe и truncated
явно отражаются в снимке. Закрытый shadow root недоступен через DOM API; его наличие и содержимое библиотека не
определяет.

Открытые shadow roots поддерживают capture, геометрию, события, mutations, polling native-свойств и подтверждение blur.
В графе их потомки связаны с host; path содержит `/shadow-root`, а необязательный `treeScopeId` отделяет области HTML ID
разных экземпляров компонента. Ссылки `aria-labelledby`, `aria-controls` и `label[for]` разрешаются внутри своей
области. Light DOM и slot сохраняются как отдельные DOM-узлы, без дублирования назначенных slot потомков. Это DOM-граф,
не полное flattened/accessibility tree.

Новые shadow roots обнаруживаются после DOM mutations и при polling. Если `attachShadow()` вызван на уже существующем
host без других DOM-изменений и polling отключён, нужен явный `capture()` (или `refresh()` для MicrofrontendObserver).
Остановка сеанса освобождает listeners и MutationObserver всех подключённых shadow roots.

Снимки не доказывают конкретный клик или происхождение изменения. MicrofrontendObserver обнаруживает области по
`observe(selectors)`; по умолчанию `start()` ищет `microfrontend > *`. Имя всегда берётся из DOM-тега корня области. Для
разметки `<microfrontend><employee-search>…</employee-search></microfrontend>` достаточно `start()`: область получит имя
`employee-search`, перечислять микрофронты заранее и добавлять атрибуты не нужно. `TrainingObserver.start(root)`
наблюдает одну переданную область и её явные внешние зависимости.

## Проверка и расширение

`npx nx build training-observer` собирает primary, models и adapters entry points. `npm run lint` запрещает зависимости
core от учебных пакетов. Browser tests в `tests/` проверяют capture, popup, focus, remount, lifecycle и multi-MF.
Меняйте адаптер при новой разметке; не добавляйте правила правильных ответов в core.

При чтении текстовой подписи действия capture исключает aria-hidden-потомков (например, декоративные иконки). Явные
aria-labelledby и aria-label по-прежнему имеют приоритет. Это не полное вычисление Accessible Name. Измерение на
реальных Taiga/HTML-контролах: [отчёт устойчивости](../../docs/reference/matching-resilience.md).

## Наблюдение страницы и feature-сеансы

`providePageObservation()` предоставляет локальный `PageObservation`. При первой инъекции после рендера он запускает
обнаружение по `boundarySelector`, по умолчанию `microfrontend > *`. Непосредственный ребёнок обёртки — корневой
компонент микрофронта; его `localName` становится именем области. Тег приложения заранее неизвестен и не выбирается по
имени адаптера. `areas()` содержит снимки и ошибки областей, `updates$` синхронно выдаёт опубликованные кадры, `error()`
сообщает об ошибке запуска, а `refresh(id?)` обновляет геометрию. Уничтожение DI-владельца освобождает ресурсы.

`providePageObservation({boundarySelector: 'microfrontend > *'})` явно задаёт границы этой области наблюдения поверх
унаследованных настроек. Остальные параметры capture и частоты обновлений сохраняются; настройки родителя не меняются.

Общий `ObservationConnection` и `ObservationSessionOptions` находятся в core. На них опираются `RecordingSession` из
`@training-observer/recording` и `TrainingSession` из `@training-observer/runtime`; отдельного пакета интеграции нет.
Connection управляет корнем, after-render capture и очисткой, а feature-сеанс — записью либо попыткой обучения.

## Angular DI и жизненный цикл

Подключение низкоуровневого API: `providers: [provideDomObservation()]` в компоненте-владельце. Helper предоставляет
TrainingObserver, MicrofrontendObserver и фабрику сеансов. У фасадов нет providedIn root. Сервисы построения снимков и
проекции создаются для владельца, наследуя его адаптеры; состояние blur изолировано на сеанс.

ObservationSessionFactory создаёт EnvironmentInjector на один start/stop и сохраняет локальные overrides DOCUMENT,
DomSnapshotBuilder, DomElementAnalyzer и ControlSnapshotBuilder. Внутри DI создаёт DomObservationSession и
BlurConfirmation. Stop уничтожает контейнер; DestroyRef очищает браузерные ресурсы и инвалидирует ожидающие microtasks.
Уничтожение владельца освобождает оставшиеся сеансы. Повторный destroy безопасен на уровне ObservationSessionRef.

DomObservationSession выдаёт синхронные Observable snapshots$/errors$. Capture, проекция и подтверждение blur
выполняются до выдачи результата; эффектов или асинхронной очереди между этими стадиями нет. Потоки завершаются при
остановке, освобождая подписки фасада. Shared-сеансы публикуют и снимки областей, и собственные blur-подтверждения.
`MicrofrontendSnapshot.revision` меняется также при подтверждении без DOM-разницы. `TrainingObserver.state()` содержит
единый ObservationState, а остальные readonly signals вычисляются из него. Объекты отдельного capture/snapshot и модели
не превращены в DI-сервисы.
