# Core: наблюдение DOM

**Назначение:** превратить существующий DOM и browser-свойства в сериализуемые снимки и логические контролы. Core не
знает о записи администратора, ожидаемых ответах, учебных шагах и уведомлениях об ошибке.

## Точки входа

- `@training-observer/core` — Angular-фасады и сервисы.
- `@training-observer/core/models` — модели и enum без Angular; [отдельное описание](models/README.md).

`src/index.ts` — полный публичный API. Не импортируйте внутренние файлы из приложения. Пакет зависит от Angular
common/core и tslib. На contracts/recording/runtime зависимостей нет.

## Структура и маршрут чтения

| Каталог/модуль                      | Роль                                                   |
| ----------------------------------- | ------------------------------------------------------ |
| `src/lib/training-observer.ts`      | Facade одного сеанса, readonly signals и lifecycle     |
| `src/lib/microfrontend-observer.ts` | независимые области с общими browser sources           |
| `src/lib/capture/`                  | обход DOM, свойства, подписи, геометрия, связи popup   |
| `src/lib/controls/`                 | адаптеры разметки, проекция в логические поля          |
| `src/lib/observation/`              | invalidation, batching, polling, blur, память выбора   |
| `src/lib/screen/`                   | конфигурируемое чтение ID и учёт посещений             |
| `src/lib/highlight/`                | необязательный overlay, не участвующий в распознавании |
| `src/lib/tokens/`                   | DI-настройки и их значения по умолчанию                |
| `models/src/`                       | JSON-модели DOM и контролов                            |

Читайте TrainingObserver → DomObservationSession → DomSnapshotBuilder → control-projection. Затем BlurConfirmation
объясняет, почему сырое значение и подтверждённое значение отличаются.

## Алгоритм

1. `start(root, options)` проверяет параметры и строит исходный снимок до замены старого сеанса.
2. DomCapture обходит light DOM, соблюдая ограничения, и добавляет явно связанные popup.
3. Адаптеры объединяют служебные узлы в ControlSnapshot с target, host, value и locator hints.
4. Browser events, MutationObserver и polling native properties запускают объединённый capture.
5. Fingerprint подавляет одинаковые публикации; время capture не считается изменением страницы.
6. Focusout за пределы host/popup сохраняет уходящее поле; settled capture публикует confirmedControls.
7. stop/clear/DestroyRef освобождают browser-ресурсы и отменяют отложенную работу.

Capture выполняется вне Angular zone, публикация signals — внутри. Один локально предоставленный сервис соответствует
lifecycle страницы. `start` на новом root заменяет сеанс, `capture` — ручное чтение, `flush` — завершение ожидающего
capture. `stop` сохраняет результат; `clear` его очищает.

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

Taiga-адаптеры используют DOM-признаки версии 4.98; native/ARIA fallback работает независимо от Taiga. Сессионные ID
меняются при remount. Подписи — приближённый алгоритм, не полный accessible-name standard. Структурный path предназначен
для диагностики. Core не гарантирует идентичность поля между документами. Password/file скрываются; произвольная
политика конфиденциальных данных ещё требует отдельной настройки. Неизвестные popup, закрытые границы обхода и truncated
явно отражаются в снимке.

Снимки не доказывают конкретный клик или происхождение изменения. MicrofrontendObserver пока обнаруживает области по
`observe(selectors)`; `[data-mf]` остаётся только значением по умолчанию для `start()`. `TrainingObserver.start(root)`
наблюдает одну переданную область и её явные внешние зависимости.

## Проверка и расширение

`npx nx build training-observer` собирает primary и models entry points. `npm run lint` запрещает зависимости core от
учебных пакетов. Browser tests в `tests/` проверяют capture, popup, focus, remount, lifecycle и multi-MF. Меняйте
адаптер при новой разметке; не добавляйте правила правильных ответов в core.

При чтении текстовой подписи действия capture исключает aria-hidden-потомков (например, декоративные иконки). Явные
aria-labelledby и aria-label по-прежнему имеют приоритет. Это не полное вычисление Accessible Name. Измерение на
реальных Taiga/HTML-контролах: [отчёт устойчивости](../../docs/reference/matching-resilience.md).
