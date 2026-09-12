/**
 * Публичное описание DOM-цели для приложений записи и редактирования сценариев.
 * Проверяет принадлежность root и поддерживаемый тип цели, затем делегирует генерацию descriptor.
 * includeStatic разрешает заголовки и области результата. Внутренние CSS-наборы не входят в API.
 */
import {type ElementDescriptor} from '../contracts';
import {CONTROLS, OBSERVABLES} from '../dom/identity';
import {describe} from './dom';

export function isObservableElement(element: Element, root: Element): boolean {
    return root.contains(element) && element.matches(OBSERVABLES);
}

export function describeElement(
    element: Element,
    root: Element,
    id: string,
    options: {includeStatic?: boolean} = {},
): ElementDescriptor {
    const selector = options.includeStatic ? OBSERVABLES : CONTROLS;

    if (!root.contains(element) || !element.matches(selector)) {
        throw new Error('Target is outside the supported observable DOM');
    }

    return describe(element, root, id, selector);
}
