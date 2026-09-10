# Form-контролы: Radio и Switch

Следующие адаптеры библиотеки предназначены для полей формы. На этом этапе
добавлены `radio` и `switch`; версия Taiga UI — 5.15.0.

| Контрол | DOM-признак | Состояние |
| --- | --- | --- |
| TuiRadio | input[type=radio][tuiRadio] | checked, DOM-value, доступность и валидация |
| TuiSwitch | input[type=checkbox][tuiSwitch][role=switch] | checked, доступность и валидация |
| Native Radio | input[type=radio] без противоречащей роли | Аналогично TuiRadio |
| Native Switch | input[type=checkbox][role=switch] либо [switch] без явной роли | Аналогично TuiSwitch |

Каждый radio-вариант — отдельный `ControlSnapshot`. Поле `state.checked` говорит,
выбран ли вариант, `state.value` содержит значение **DOM input**. При Angular
`[value]="object"` браузерное value может не содержать объект или уникальный ключ.
Библиотека не читает Angular ControlValueAccessor, FormControl и приватные поля
Taiga и не выдаёт DOM-строку за бизнес-значение. Имя и контекст группы остаются
в `locatorHints.name` и `locatorHints.context`; единый объект radio-группы пока
не создаётся, особенно при неполном снимке или разных областях наблюдения.

Switch имеет двоичное состояние `checked`. Native value вроде `on` не становится
значением переключателя; `indeterminate` не переносится в логический Switch.
У Checkbox поддержка `indeterminate` сохраняется.

## Подписи обязательны в примерах

Каждый Radio имеет собственный label, Switch — подпись переключателя. Библиотека
читает `aria-labelledby`, `aria-label`, связанные `label[for]` и оборачивающие
`label`. Связанные HTML-label входят в `memberNodeIds`. `legend` описывает группу
в `locatorHints.context`, а не заменяет подпись варианта.

```html
<fieldset>
    <legend>Способ доставки</legend>
    <label><input type="radio" name="delivery" value="email">Электронная почта</label>
    <label><input type="radio" name="delivery" value="sms">SMS</label>
</fieldset>
<label for="auto-save">Автосохранение</label>
<input id="auto-save" type="checkbox" role="switch">
```

На внешней странице может встретиться контрол без подписи. Он остаётся в снимке
с пустым `label`: парсер не придумывает подпись из name, value или legend и не
скрывает такой контрол. Непустая корректная подпись должна быть обеспечена исходным
интерфейсом; это не повод требовать доработки соседнего микрофронта для самого наблюдения.

## Изменения и radio-группы

`input`/`change` фиксируют выбор мышью и клавиатурой. Периодическая сверка native
свойств обнаруживает программные изменения checked без события.

Браузер снимает checked с прежнего варианта без отдельного change на нём. Поэтому
при input/change нового radio `MicrofrontendObserver` обновляет также области,
в которых находятся его native-партнёры: совпадают непустой name, DOM-дерево и
**form owner**. Учитывается и внешняя форма через `form="id"`. Одинаковые name
в разных формах не объединяются. У неназванных radio общей группы нет.

Событие reset внешней формы также направляется в области её полей. Эти сценарии
работают при `propertyCheckIntervalMs: 0`. Изменения native-свойств без события,
включая программные изменения состава группы, при отключённой сверке требуют
явного refresh; это прежнее ограничение наблюдения за DOM-свойствами.

## Проверки

В разделе `/controls` раскрыть «Radio и Switch». Там находятся настоящие
TuiRadio/TuiSwitch с Angular Forms, подписями и disabled-вариантом.

`tests/form-controls.spec.ts` проверяет распознавание, подписи и их изменения,
выбор мышью/клавиатурой, silent property writes, disabled/inert, двоичный Switch,
radio-группу в разных микрофронтах и reset через внешнюю форму без polling.

Следующие семейства: InputNumber, Slider/Range, дата/время, поля с несколькими
значениями. Для них понадобятся собственные модели значения и составных контролов.
