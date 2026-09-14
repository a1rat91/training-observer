# Core models: сериализуемое наблюдаемое состояние

Вторичная точка входа `@training-observer/core/models` пакета core. Не импортирует Angular, browser-сервисы
или учебные контракты. Нужна чистым обработчикам снимков, записи и runtime, которым не нужен Angular-фасад.

## Состав

| Файл | Что описывает |
| --- | --- |
| `src/observation-enums.ts` | ControlType, ScreenStatus; строковые значения не меняют JSON |
| `src/dom-snapshot.ts` | узлы DOM-графа, свойства, геометрия и границы обхода |
| `src/control-snapshot.ts` | логический контрол, locator hints, choice/popup |
| `src/screen-state.ts` | настройки чтения экрана, результат и посещение |
| `src/microfrontend-snapshot.ts` | результат независимой области, счётчики и ошибка |

## Основные правила

Все модели readonly и сериализуемы. У них нет методов, subscriptions или DOM Element.
ID узла и контрола относится к сеансу, а не к постоянной идентичности интерфейса.
ControlLocatorHints содержит признаки поиска; текущий ответ и координаты в него не входят.
`displayValue` ComboBox и `selection` — разные факты. Unknown не означает пустое значение.
Числовое поле хранит DOM-строку с форматированием, boolean false не теряется.

ControlKind принимает строковые значения enum через template literal type, сохраняя совместимость конфигураций.
Строковые значения enum являются wire-контрактом. Модели не определяют, что считать правильным ответом.

## Работа и расширение

Начните с `src/index.ts`, затем ControlSnapshot и DomSnapshot. Новое поле модели добавляйте вместе с capture/
projection и тестом сериализации. Живые ссылки оставляйте в builder, не в этих интерфейсах.
Сборка выполняется вместе с `npx nx build training-observer`.
