/**
 * Сравнение черновика с DOM-значением перед blur без зависимости от библиотеки controls.
 * Допускает точное совпадение либо одинаковое значение по явно включённому normalizer.
 * Так отложенное форматирование числа/даты не подменяет смысл ввода; другое значение отклоняется.
 */
import {type CapturedValue} from '../contracts';

export function sameInputValue(left: CapturedValue, right: CapturedValue): boolean {
    return (
        JSON.stringify(left) === JSON.stringify(right) ||
        (left.status === 'captured' &&
            right.status === 'captured' &&
            !!left.normalized &&
            !!right.normalized &&
            left.normalized.rule === right.normalized.rule &&
            left.normalized.value === right.normalized.value)
    );
}
