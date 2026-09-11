# Этап 4: контракты наблюдения и сценария, v2

Принятый контракт: `libs/element-spike/src/contracts/`. Это формат данных и проверки импорта, **не реализованный
recorder, resolver или сценарный движок**. Старый `src/model.ts` и его consumers остаются черновиком v1. Не переводим их
на новые имена с сохранением старой семантики: миграция recorder выполняется на этапе 5, resolver — на этапе 6.

Новый контракт экспортируется отдельным entry point `src/contracts/index.ts`, а из общего `src/index.ts` — namespace
`contracts`. Не смешивать одноимённые типы из `model.ts` и `contracts`. Импорт v1 в v2 не выполняется автоматически.

## 1. Документы и ссылки

| Объект              | Что сохраняет                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Recording`         | `kind: training-recording`, version 2, режим наблюдения, политику значений, descriptors, actions, states       |
| `Scenario`          | `kind: training-scenario`, version 2, descriptors, начальный шаг, шаги/ветки и общее условие завершения        |
| `ElementDescriptor` | version 2, ID внутри документа, scope, structured fingerprint, несколько locator candidates                    |
| `SemanticAction`    | Намерение пользователя, подтверждённое действие, targetId, sequence, время, evidence и при необходимости value |
| `ObservedState`     | Наблюдаемое состояние и источник обновления, отдельно от пользовательского действия                            |
| `Resolution`        | `kind: element-resolution`, version 2; решение, кандидаты, evidence и попытки поиска, без DOM                  |
| `TargetWaitState`   | `kind: target-wait`, version 2; ожидание, готовность, неоднозначность, поломку, timeout или отмену             |
| `LiveResolution`    | Временную привязку `resolved` к живому `Element`; никогда не сохраняется                                       |

Вложенные actions/states/steps подчиняются версии документа. Descriptor ID, action ID и step ID — ссылки в training
JSON, **не атрибуты целевого DOM и не field keys серверной схемы**. ID уникальны внутри соответствующего массива;
locator ID уникален внутри descriptor. Импорт проверяет ссылки на цели, начальный/следующий шаг и ветки.

## 2. Идентичность элемента

Признаки хранятся один раз: `descriptor.fingerprint.features`. Fingerprint — структурированные признаки для будущего
сопоставления, а не хеш HTML. Алгоритм представления — `semantic-features-v1`; нормализация identity-текста —
`nfc-whitespace-v1`: Unicode NFC, объединение пробельных последовательностей в один пробел и trim, без приведения
регистра. Реализация извлечения/нормализации проверяется на следующих этапах; декодер проверяет структуру, не доказывает
правильность извлечения признаков из DOM.

Сохраняются tag, role, accessibleName, text, label, placeholder, разрешённые attributes и semantic context.
Отсутствующие текстовые признаки представлены null. Context содержит пары role/name для формы, секции, строки и т.п.
Scope — точный `location.pathname` и semantic context. Query/hash не включаются неявно; динамический pathname потребует
отдельной явно спроектированной политики. Один URL `/spike/procedure` не различает экраны: контекст и наблюдаемое
состояние остаются необходимыми.

В attributes допустимы `name`, `type`, `title`, `alt`, `href`, `autocomplete`, если они уже есть у целевого приложения.
В identity не входят value, checked, selected, disabled, readonly, координаты, позиция, class, data-* и Angular IDs.
Связи label/aria-labelledby используются при извлечении доступного имени; сами генерируемые ID не становятся постоянной
идентичностью. Разрешённый attribute тоже может измениться или содержать ID сущности: сам факт его наличия не означает
стабильность.

Locator — структурированный union: role/name, label, text, placeholder, attribute или CSS. Semantic locators имеют
обязательное `exact: true`; поиск по подстроке нельзя случайно включить в импортированном сценарии. Raw Playwright DSL,
XPath, функции и eval-предикаты не являются частью контракта. CSS fallback хранится candidate с `kind: css`; отдельное
дублирующее поле cssFallback не нужно.

`recordedMatches` — число совпадений при записи в соответствующем scope, а не обещание будущей уникальности. При
`contextRequired: true` импорт требует сохранённый context. Уникальный CSS после перестановки может указывать на чужую
цель. Resolver обязан проверить идентичность независимо от числа совпадений, не разрешать tie по порядку DOM и
диагностировать отсутствие необходимого контекста.

Для scoring предусмотрены группы naming, role-type, attributes, context. Label/name/text коррелированы и не считаются
тремя независимыми доказательствами. Score в [0,1] — условная мера сходства, не вероятность. Порог, margin и правила
противоречий калибруются отдельно на этапах 6–8; контракт не закрепляет произвольные числа как проверенную надёжность.

## 3. Значение, действие и состояние

`CapturedValue` различает:

- captured: raw string / boolean / string[], в том числе пустую строку, false и пустой selection;
- omitted: значение не записано по политике;
- redacted: чувствительное значение скрыто;
- unavailable: неподдержанный или исчезнувший контрол.

Raw string сохраняет отображаемое значение без identity-нормализации. Число Taiga и дата не выдаются за Angular model
или backend code. Необязательный normalized содержит именованное правило и результат: `decimal-comma-v1` / number или
`date-dmy-v1` / ISO `YYYY-MM-DD`. Правило должно быть разрешено в valuePolicy; исходное значение должно быть строкой.
Декодер проверяет формат результата, но пока не вычисляет и не подтверждает саму нормализацию — это задача recorder.
Неполная маска или неизвестный формат не нормализуются угадыванием.

valuePolicy требует явный режим capture/omit и sensitive=redact. Для descriptor с password/file или autocomplete
current-password/new-password/one-time-code импорт запрещает captured values. Redacted не может содержать raw или
normalized. Это проверка очевидных типов, а не автоматическая классификация любых секретов в произвольном тексте;
политика recorder должна применяться до формирования документа.

У actions независимые ID и строго возрастающая sequence; пропуски sequence допустимы. timeMs — неубывающий монотонный
offset от старта этой записи, не системное время и не время другой сессии. В states время также не убывает.

- click указывает интерактивную цель; клик на icon/span должен быть отнесён к владельцу на этапе 5.
- input фиксируется после commit: blur/change/idle. Промежуточные IME composition не становятся шагами.
- select означает подтверждённое изменение выбора, а не каждый click на dropdown/option. Checkbox/switch используют
  boolean; для списка возможны label или массив labels, а не скрытый код Angular-сущности.
- navigation сохраняет pathname без выдуманного targetId. Смена формы на том же URL не является navigation.

Evidence содержит тип исходного взаимодействия и trusted=true/false/null. isTrusted сам по себе не доказывает ни
завершение операции, ни правильную цель. Изменение `.value` программой, rrweb input update или MutationRecord сначала
является ObservedState (source property-observer/mutation). Только проверенная связь с действием пользователя позволяет
recorder создать SemanticAction. Декодер не восстанавливает эту причинную связь и не выполняет события.

Состояние хранит connected, visible/enabled/readOnly (null означает «не установлено») и value. Оно не добавляется в
fingerprint. Исчезновение элемента, присвоенный default и readonly после ответа сервера не являются действиями ученика.

## 4. Поиск и ожидание

Resolved имеет selectedCandidateId и strategy semantic/css-verified/similarity. Выбранный ID обязан присутствовать среди
candidates. Ambiguous содержит минимум двух кандидатов и не может содержать победителя. Broken содержит reason:
not-found, insufficient-evidence, identity-conflict, scope-mismatch или unsupported. Reports сохраняют краткие описания
кандидатов и evidence; ни `Element`, ни WeakMap, ни Angular dependency не входят в JSON.

`Resolution` — результат одной попытки поиска. `broken/not-found` означает «не найден сейчас», а не окончательный провал
ожидающего шага. Координатор ожидания переводит отсутствие ещё не пришедшего поля в waiting/not-yet-present;
нестабильный узел — в waiting/not-stable. Ready требует resolved. Ambiguous и broken остаются различимыми состояниями;
истечение deadline — timed-out; смена шага/reset/stop/unmount — cancelled. Поздний результат отменённого ожидания не
может сделать следующий шаг готовым. Исполнение этого жизненного цикла — этапы 6–7.

LiveResolution позволяет передать найденный Element подсветке, но остаётся локальным объектом текущего document. После
replace/reload нужна новая попытка поиска. Driver.js может добавлять служебные классы, но они не evidence.

## 5. Сценарий и завершение

Recording — исходные наблюдения. Scenario — отдельно отредактированные задания: instruction, hint, ожидаемый action,
optional, completion и branches. Поддержан небольшой декларативный язык условий: visible, value (raw-equals или
normalized-equals), pathname, all/any. Произвольные JS/HTML-функции, regex и сетевые запросы в условиях не исполняются.
Значение omitted/redacted/unavailable не означает совпадение с ожидаемой строкой.

Action и completion шага проверяются отдельно: «Продолжить» нажато не означает «новая форма принята сервером». Branch
выбирается по условиям после завершения шага. Если совпало несколько веток, runtime обязан сообщить неоднозначность;
порядок массива не является приоритетом. Если не совпала ни одна, используется nextStepId. Optional пропускается явным
решением runtime, а не потому, что locator сломался; переход идёт в nextStepId.

У Scenario есть **общее completion**. Достижение nextStepId=null не является достаточным условием успеха. Для
экспериментальной процедуры общее условие может ссылаться на descriptor видимого «Заявка принята». Это доказывает
наблюдаемое UI-подтверждение; транзакцию backend независимо проверяет test oracle. Декодер проверяет структуру и ссылки
графа, не его достижимость, отсутствие циклов или взаимную исключительность branch predicates.

## 6. Граница интеграции

Каждый документ имеет mode: dom-only либо shared-adapter с явными adapterId/adapterVersion. Форматы нельзя смешивать
неявно и сравнивать результаты как одинаковые условия эксперимента. В dom-only запрещено добывать field keys,
FormRecord, schema, procedureId/revision или HTTP bodies через Angular debug API. URL и видимые признаки доступны.

Исключённые DOM-root собственной панели — локальные настройки наблюдения, не сериализуемые части сценария. Подключение
уже shared DI проверяется отдельно и не требует добавлять hooks/маркеры в целевое приложение. Сам адаптер здесь не
создан.

## 7. API и проверка

```ts
import {parseRecording, parseScenario, serializeRecording, serializeScenario} from './contracts';

const recording = parseRecording(jsonFromStorage);
const portable = serializeRecording(recording);
const scenario = parseScenario(editedScenarioJson);
const edited = serializeScenario(scenario);
```

Также доступны readRecording/readScenario для объектов, readResolution/readTargetWaitState для диагностик. ContractError
содержит путь ошибочного поля. Неизвестные версии/discriminators/поля отклоняются. Проверяются уникальность, ссылки,
порядок, value policy и согласованность diagnostic states. Парсинг не выполняет querySelector/eval/HTML insertion.

Сериализация отвергает DOM, Date/Map/Set, функции, undefined, nonfinite numbers, cycles, getters, symbol/скрытые
properties и sparse/decorated arrays вместо их тихой потери через JSON.stringify. Обычные общие ссылки копируются как
JSON-значения, без сохранения объектной идентичности. Импорт ограничен 1 000 000 символов, 100 000 узлов и глубиной 40;
конкретные списки дополнительно ограничены схемой. Семантическая корректность extraction, нормализации и scoring не
следует из успешной проверки формата.

```sh
npm run test:spike
npx tsc -p libs/element-spike/tsconfig.json --noEmit
npm test
```

Unit-тесты проверяют round-trip, значения, разделение режимов, секреты, ошибочные ссылки/версии/порядок, отсутствие
живого DOM, циклы/getters, условия и ambiguous/waiting/timeout/cancelled. `npm test` запускает тесты контрактов и HTTP
backend плеера; Playwright остаётся отдельной командой. Следующий этап — реализация recorder по этому контракту.

## Диагностика записи (этап 5)

В `Recording` v2 добавлено необязательное поле `diagnostics`: до 100 записей `{timeMs, code, message}`. Коды:
`unsupported-control`, `ambiguous-owner`, `unconfirmed-selection`, `composition-cancelled`, `capacity-reached`. Запись с
диагностикой может быть неполной и не должна автоматически считаться готовым учебным сценарием. Старые JSON v2 без
diagnostics продолжают читаться. Старый строгий reader до этого расширения отклонит новое поле; совместимость разных
развёрнутых версий ещё не обещается в этом spike.
