/** Набор независимых способов разметки. ID нужны существующим связям label/for;
 * эталон теста хранит ссылки на элементы вне DOM и не передаёт их matcher.
 */
export const TAIGA_TARGETS = [
    'full-name',
    'department',
    'employee',
    'notifications',
    'delivery-email',
    'delivery-sms',
    'auto-save',
    'amount',
] as const;

export const MATCHING_HTML = `
<section aria-label="Анкета">
<label>Почта<input id="mail" type="email"></label>
<label>Телефон<input id="phone" type="tel"></label>
<label>Поиск<input id="search" type="search"></label>
<label>Сайт<input id="website" type="url"></label>
<label>Дата<input id="date" type="date"></label>
<label>Время<input id="time" type="time"></label>
<label>Месяц<input id="month" type="month"></label>
<label>Неделя<input id="week" type="week"></label>
<label>Количество<input id="quantity" type="number"></label>
<label>Комментарий<textarea id="notes"></textarea></label>
<label for="external">Внешняя подпись</label><input id="external">
<span id="labelled-caption">Подпись через ARIA</span><input id="labelled" aria-labelledby="labelled-caption">
<input id="aria" aria-label="Код подразделения">
<input id="placeholder" placeholder="Укажите индекс">
<input id="readonly" aria-label="Номер заявки" readonly value="123">
<input id="disabled" aria-label="Архивный код" disabled>
<label>Страна<select id="country"><option>Россия</option><option>Казахстан</option></select></label>
<label>Языки<select id="languages" multiple><option>Русский</option><option>Английский</option></select></label>
<label>Условия приняты<input id="terms" type="checkbox"></label>
<fieldset><legend>Транспорт</legend><label>Поезд<input id="train" type="radio" name="transport"></label></fieldset>
<button id="submit" type="button">Отправить</button>
<button id="help" aria-label="Открыть справку" type="button">?</button>
</section>`;

export const NATIVE_TARGETS = [
    'mail',
    'phone',
    'search',
    'website',
    'date',
    'time',
    'month',
    'week',
    'quantity',
    'notes',
    'external',
    'labelled',
    'aria',
    'placeholder',
    'readonly',
    'disabled',
    'country',
    'languages',
    'terms',
    'train',
    'submit',
    'help',
] as const;

export enum MatchingMutation {
    Baseline = 'baseline',
    Wrappers = 'wrappers',
    Reorder = 'reorder',
    Classes = 'classes',
    Nesting = 'nesting',
    Icons = 'icons',
    Move = 'move',
    Combined = 'combined',
    NewIds = 'new-ids',
    CombinedNewIds = 'combined-new-ids',
    Missing = 'removed',
    Duplicate = 'duplicate',
    LostSemantics = 'lost-semantics',
    ReusedId = 'reused-id',
}
