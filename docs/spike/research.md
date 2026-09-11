# Этап 2: исследование библиотек и browser probes

Дата: 2026-09-11. Связанные документы: [план](./PLAN.md), [эксперимент с процедурами](./procedure-experiment.md).

## Решение для следующих этапов

Для ядра используем `dom-accessibility-api` и проверяемый CSS fallback `@medv/finder`. `dom-to-locator` выбираем как
источник дополнительных candidates при записи и comparator; его output требует адаптации к нашему JSON-контракту и
политике отказа. `@mizchi/selector-generator` оставляем сравнительным инструментом. В runtime два извлечённых генератора
Playwright одновременно не нужны.

**rrweb имеет подтверждённую пользу:** в Taiga Select он зафиксировал изменение значения, которое не пришло через native
input/change. Используем его на следующем этапе recorder как диагностическую запись администратора; отдельно оценим
достаточность этого источника для нормализации действий. В learner runtime не включаем полный replay автоматически.

XState подходит для сценарного runtime: guards и отмена устаревших invoked actors проверены. Driver.js подходит для
подсветки с перепривязкой при пересоздании цели. По уточнению пользователя его служебные классы допустимы; использовать
их как locator нельзя. Healenium не подключаем; используем только идеи детерминированного сопоставления признаков и
порогового отказа.

Это выбор для продолжения spike. Собственный ElementResolver и процедура с HTTP backend на этом этапе не измерялись; их
результаты нельзя выводить из этой таблицы.

## Что фактически запускалось

Команда из корня репозитория:

```sh
npm ci
npm run research:spike
```

Нужен установленный Google Chrome. Runner поднимает HTTP на случайном порту **127.0.0.1**, собирает отдельный Angular
JIT fixture и запускает headless Chrome через Playwright. По завершении Chrome и сервер закрываются. Для другого
установленного Chromium channel: `SPIKE_BROWSER_CHANNEL=chromium npm run research:spike`. Node в измеренном запуске:
24.20.0, Chrome: 152.0.7977.83, Angular: 19.2.25, Taiga UI core/kit: **4.98.0**, Playwright: 1.62.1. Это проверенная
среда, не обещание поддержки всех версий Angular/Node/browser.

Исходники — `scripts/spike-research/{fixture,libraries,run}.mjs`. Они независимы от чернового ядра и незавершённых
страниц demo. Обычные поля и кнопки fixture используют Taiga UI 4. Имеющиеся `name` служат Angular ngModel, а не
добавлены как training ID. Генерируемые самой Taiga ID и атрибуты не считаются постоянными идентификаторами.

Артефакты нового запуска сохраняются в `dist/spike-research/`. Зафиксированный результат:
[library-probes.json](./library-probes.json). В нём версии, лицензии, SHA-256 исходников, сгенерированные locators, все
504 попытки и диагностические проверки.

### Разделение экспериментов

1. Генерация: **14 целей** на живом Angular/Taiga UI. JSON записывается на диск и читается заново.
2. Восстановление: девять **новых browser pages**, каждая получает сериализованный отрендеренный Taiga DOM без Angular
   handlers. Проверяем именно поиск после мутаций.
3. Dynamic probe: отдельное взаимодействие с исходным **живым** Taiga Select/checkbox для сравнения DOM events и rrweb.
   Здесь Angular handlers работают.
4. Driver.js: реальный highlight, замена узла, cleanup.
5. XState: guards, failure, invoke cancellation и поздний результат старого actor.

Oracle хранит ожидаемые узлы только в runner. Генераторы получают DOM Element без oracle keys. После мутации
правильность проверяется строгим сравнением с ожидаемым узлом; удалённый узел не подменяется «похожим». Runtime-код не
получает эту таблицу соответствия.

Сгенерированные **internal selector strings исполняются Playwright** через `page.locator`. Это проверка совместимости
генерации и поиска в test engine. Она **не доказывает**, что пакет экспортирует самостоятельный browser query engine.
`getByRole(...)` строки не вычисляются через eval и не являются готовым безопасным runtime-контрактом.

## Версии, API и решение по каждому кандидату

| Библиотека                 | Версия / лицензия                                           | Проверено                                                                         | Решение                                                                            |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Playwright                 | 1.62.1 / Apache-2.0                                         | Исполнение сохранённых internal locators, strict identity oracle                  | Test harness; принципы semantic-first + uniqueness перенести в ядро                |
| dom-to-locator             | 1.0.0 / BSD-3-Clause; производный код Playwright Apache-2.0 | `generateInternalSelector`, `generateLocators`, scoped semantic candidates        | **Adapt** для authoring; запретить positional acceptance, проверять exact identity |
| @mizchi/selector-generator | 1.50.0-next / Apache-2.0                                    | `createSelectorGenerator`, `multiple`, `toLocator`                                | **Comparator**; не включать вместе с dom-to-locator в продукт                      |
| @medv/finder               | 4.0.2 / MIT                                                 | Default и вариант без id/classes/data attributes                                  | **Use** только fallback; всегда проверять identity                                 |
| dom-accessibility-api      | 0.7.1 / MIT                                                 | Accessible name/role всех 14 целей и option Taiga                                 | **Use**; не писать полный AccName самостоятельно                                   |
| rrweb                      | 2.1.4 / MIT                                                 | DOM mutations, input property change, masking, lifecycle mirror ID                | **Use для диагностики записи**; semantic actions потребуют своего слоя             |
| XState                     | 5.32.6 / MIT                                                | Guards, failure transition, stop invoked actor, игнорирование позднего результата | **Use** на этапе scenario runtime                                                  |
| Driver.js                  | 1.8.0 / MIT                                                 | Highlight Element, host mutation, stale reference после replace, destroy          | **Use** с re-resolve/rebind и cleanup; служебные классы исключены из descriptors   |
| Healenium Web              | Документация/исходники 3.5.8 / Apache-2.0; не установлен    | Только source review, без Java/Selenium/backend запуска                           | **Ideas only**; не объявлять интеграцией                                           |

У mizchi пакет экспортирует provenance: Playwright `1.50.0-next`, commit `1afb56ee1b63ffbb972a1773432979b865878072`.
`dom-to-locator` не экспортирует аналогичный проверенный commit upstream в своём public API. Версии extraction и query
engine различаются; успех этих probes не гарантирует совместимость всех внутренних стратегий.

Первичные источники API: [dom-to-locator](https://github.com/gajus/dom-to-locator),
[mizchi](https://github.com/mizchi/selector-generator), [finder](https://github.com/antonmedv/finder),
[dom-accessibility-api](https://github.com/eps1lon/dom-accessibility-api),
[Playwright locators](https://playwright.dev/docs/locators).

## Результаты поиска: не только процент успеха

В каждой ячейке **C / W / A / M**: correct / wrong / ambiguous / missing. Знаменатель каждой ячейки — 14 целей. Ошибок
генерации и исполнения — 0 в этом прогоне. Фильтрованный finder запрещает ID и classes, разрешает только
name/type/placeholder/title/alt/href.

| Изменение                                             | dom-to-locator | mizchi         | finder default | finder filtered |
| ----------------------------------------------------- | -------------- | -------------- | -------------- | --------------- |
| Новый документ, исходный DOM                          | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0  |
| Wrappers + порядок + classes + span/icon + перенос    | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 8 / 0 / 0 / 6  | 8 / 0 / 0 / 6   |
| Новые ID с сохранёнными label/ARIA-связями            | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0  |
| Текст стал «Продолжить оформление»                    | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0  |
| Дубликат формы с новыми ID и теми же labels           | 4 / 0 / 10 / 0 | 4 / 0 / 10 / 0 | 4 / 0 / 10 / 0 | 4 / 0 / 10 / 0  |
| Удалена кнопка «Продолжить»                           | 13 / 0 / 0 / 1 | 13 / 0 / 0 / 1 | 12 / 1 / 0 / 1 | 12 / 1 / 0 / 1  |
| Переставлены две неразличимые кнопки                  | 12 / 2 / 0 / 0 | 12 / 2 / 0 / 0 | 12 / 2 / 0 / 0 | 12 / 2 / 0 / 0  |
| Старое место занято «Удалить заявку», цель перенесена | 14 / 0 / 0 / 0 | 14 / 0 / 0 / 0 | 13 / 1 / 0 / 0 | 13 / 1 / 0 / 0  |
| Вместо цели другая кнопка «Продолжить удаление»       | 13 / 1 / 0 / 0 | 13 / 1 / 0 / 0 | 13 / 1 / 0 / 0 | 13 / 1 / 0 / 0  |

На layout-наборе semantic generators дали **14/14 (100%)**, CSS generators — **8/14 (57,1%)**. Это не общая точность
системы: сохранены labels и обычные name-атрибуты, набор небольшой, нет локализации, virtual scrolling, масштабного DOM
и всех вариантов доступности.

Две важные ловушки:

- Для неразличимых целей оба semantic generator используют `nth`. После swap — **две ошибки с единственным
  совпадением**. Unique не означает correct.
- У `getByRole(..., {name: 'Продолжить'})` по умолчанию нет exact match. Это помогло при нейтральном дополнении текста,
  но также приняло «Продолжить удаление» вместо прежней операции. Подстрока не должна считаться достаточным identity
  evidence.

`generateLocators()` также возвращает позиционные варианты, например `getByRole('button').nth(1)`. Несколько candidates
сами по себе не повышают надёжность: нужна классификация стратегий и проверка каждого результата.

Не усредняем все 504 попытки в один рекламный процент: 504 = 14 × 9 × 4, это зависимые проверки на одном fixture.
Удаление/дубликаты ожидаемо не должны разрешаться однозначно. Исходные случаи предназначены для исследования; это не
holdout для калибровки resolver.

## Taiga и rrweb: почему обычных listeners недостаточно

В живом Select проверены `role=combobox`, accessible name «Курс», `aria-controls` и option «Angular». Dropdown находится
**вне form**, но внутри того же document. Внутри option Taiga создаёт декоративные checkbox: они disabled/aria-hidden и
не являются действиями ученика. Обычный поиск `input[tuiCheckbox]` по всему документу не различает их и поле формы.

После click на option:

- значение `input[tuiSelect]` стало `Angular`;
- в capture-log есть click по combobox и click по option;
- **native input/change для course отсутствуют**;
- rrweb записал Input incremental event для mirror ID владельца combobox (`78` в этом запуске), с маскированным
  значением `*******`.

Это экспериментальное основание использовать rrweb для диагностической записи. Он наблюдает больше, чем перечень простых
DOM listeners. Однако изменение свойства не доказывает действие пользователя: программа тоже меняет values. Нужны связь
действия с контролом, before/after state, фильтрация декоративных узлов и проверка commit.

В короткой записи: **41 rrweb event, 313472 байта сырого JSON**, включая initial snapshot со стилями fixture. Число и
размер event batches могут меняться из-за расписания browser. Это не throughput и не прогноз production-хранилища.
Включены `maskAllInputs: true`, выключено mousemove sampling. Введённая синтетическая строка не попала в rrweb events
открытым текстом; диагностический native-log runner намеренно содержит synthetic values.

Отдельная проверка: при пересоздании input mirror ID изменился с `50` на `449`. Такие ID полезны внутри replay, **не
являются ElementDescriptor для следующего прохождения**. Политику хранения, исключение training UI, объём snapshots и
нагрузку на реальный плеер проверяем на этапе recorder. Маскирование значения не скрывает автоматически все labels,
текст страницы и бизнес-содержимое snapshot.

Источник механики record/snapshot/replay: [rrweb guide](https://github.com/rrweb-io/rrweb/blob/main/guide.md).
Наблюдения выше — результат собственного запуска, не обещания из документации.

## Highlight и scenario runtime

Driver.js 1.8.0 принимает живой `Element`, создаёт popover и корректно удаляет overlay при destroy. При подсветке
добавляет целевому input класс `driver-active-element`. После `replaceWith` `getActiveElement()` всё ещё возвращает
отключённый старый узел. Это требует re-resolve/rebind: повторный `highlight({element: replacement})` успешно
перепривязывает подсветку. После destroy удалены overlay, popover и служебный класс новой цели — проверено отдельными
assertions. Автоматические изменения DOM разрешены пользователем. Запрет касается специальных локаторов/hooks для
облегчения распознавания. Поэтому выбираем Driver.js для highlight, его классы не участвуют в descriptor/fingerprint,
собственный overlay пока не требуется. Источник API: [Driver.js configuration](https://driverjs.com/docs/configuration).

Для XState исполнена трасса: `editing → editing` при невалидном submit, затем `waiting → editing` при failure, затем
`waiting → done` при success. Отдельный invoked Promise actor при RESET получает aborted signal; его поздний результат
игнорируется. Результат нового actor принимается. Это подходит ожиданию следующей формы после backend-ответа. Browser
events и completion predicates остаются ответственностью нашего слоя; XState не распознаёт DOM-смысл. Источники:
[guards](https://stately.ai/docs/guards), [invoke](https://stately.ai/docs/invoke).

## Healenium: что заимствуем и что не подключаем

Из архитектуры полезны сохранение прошлого представления цели, candidate ranking, порог восстановления и отчёт о
предложенной замене. Для training добавляем обязательный разрыв между лидерами и отказ при конфликтующих признаках.
Порог similarity не называем вероятностью без калибровки.

Healenium Web работает вокруг Java/Selenium и backend; его здесь не запускали. Кроме того, release 3.5.8 включает
изменение «call ai to get xpath» — нельзя автоматически считать все актуальные пути восстановления детерминированными
или совместимыми с запретом LLM. Мы не подключаем этот путь и не делаем вызовов модели. Источники:
[Healenium Web](https://github.com/healenium/healenium-web),
[релиз 3.5.8](https://github.com/healenium/healenium-web/releases/tag/3.5.8),
[PR 315](https://github.com/healenium/healenium-web/pull/315).

## Размеры browser bundle

esbuild 0.28.0, ESM, ES2022, minify; bytes и gzip bytes. Для сравнения удержаны все public exports пакета, без Angular
fixture, sourcemaps и CSS. Это размер изолированного bundle, а не прирост общего приложения; tree shaking и общие
зависимости изменят итог.

| Пакет                      | Minified bytes | Gzip bytes |
| -------------------------- | -------------: | ---------: |
| dom-to-locator             |          79397 |      22602 |
| @mizchi/selector-generator |         135476 |      39456 |
| @medv/finder               |           3543 |       1628 |
| dom-accessibility-api      |          15235 |       4948 |
| rrweb, все exports         |         261088 |      81940 |
| rrweb, только record       |         181921 |      58172 |
| xstate                     |          46942 |      15074 |
| driver.js, без CSS         |          25543 |       7385 |

В JSON есть generation duration и query duration. Последняя включает Playwright transport; называть её browser-only
latency нельзя. Повторных измерений и статистики p95 здесь нет.

## Что переносим в реализацию и что остаётся проверить

- Сохранять typed JSON descriptors, а не исполняемый JavaScript locator.
- Semantic exact match — первый вариант; substring/fuzzy — только с независимым evidence.
- Любой positional/CSS match проверять; неоднозначность не разрешать порядком DOM.
- Контекст формы/строки полезен, но его сохранность нельзя предполагать.
- События, state observation и переход сценария разделить. Учесть Taiga property updates, portaled dropdown, generated
  IDs, исчезновение option и декоративные controls.
- `dom-to-locator` подключать через ограниченный адаптер authoring. Public API не даёт полноценного самостоятельного
  query engine; внутренний Playwright синтаксис не делать публичным контрактом нашей системы.
- Запустить этап 3: настоящий HTTP-плеер по спецификации. Динамический backend, две ветки, IME, клавиатурный выбор и все
  22 приёмочных сценария в этом этапе исследования не покрыты.
- Перед выпуском библиотек отдельно сохранить требуемые upstream license/notice при копировании или адаптации кода;
  здесь используются npm-пакеты, исходники не vendored.

Этап 2 завершён. Браузерные probes прошли; ограничения поиска проявились как измеренные wrong/ambiguous/missing, а не
были скрыты успешным завершением test runner.
