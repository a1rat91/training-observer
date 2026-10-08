/** Общие исключения DOM, объявленные подключёнными адаптерами. */
import {isObserverUi} from '../observation/dom-observer-ui';

export function isAdapterExcluded(node: Node, selector: string): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;

    return Boolean(selector && element?.closest(selector));
}

/** Удаление проверяется по самому узлу: его новые предки не должны скрыть изменение прежнего родителя. */
export function isAdapterExcludedRemoval(node: Node, selector: string): boolean {
    return Boolean(
        selector && node.nodeType === 1 && (node as Element).matches(selector),
    );
}

/** Монтаж/удаление только исключённых поддеревьев не изменяет capture и discovery. */
export function isCaptureExcludedMutation(
    record: MutationRecord,
    selector: string,
    wasIncluded: (element: Element) => boolean,
): boolean {
    if (isObserverUi(record.target)) {
        return true;
    }

    const target =
        record.target.nodeType === 1
            ? (record.target as Element)
            : record.target.parentElement;

    const excluded = selector ? target?.closest(selector) : null;

    // Проверяем прежнее включение предка, а не только target: :has() может исключить
    // всё поддерево после mutation в любом из его потомков.
    if (excluded) {
        return !wasIncluded(excluded);
    }

    const added = Array.from(record.addedNodes);
    const removed = Array.from(record.removedNodes);

    return (
        record.type === 'childList' &&
        added.length + removed.length > 0 &&
        added.every((node) => isObserverUi(node) || isAdapterExcluded(node, selector)) &&
        removed.every(
            (node) =>
                isObserverUi(node) ||
                (isAdapterExcludedRemoval(node, selector) &&
                    !wasIncluded(node as Element)),
        )
    );
}
