/** Reserved for library-owned presentation, regardless of the consumer's ignore selector. */
export const OBSERVER_UI_ATTRIBUTE = 'data-training-observer-ui';

export function isObserverUi(node: Node): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;

    return Boolean(element?.closest(`[${OBSERVER_UI_ATTRIBUTE}]`));
}

export function isObserverUiMutation(record: MutationRecord): boolean {
    if (isObserverUi(record.target)) {
        return true;
    }

    const changed = [
        ...Array.from(record.addedNodes),
        ...Array.from(record.removedNodes),
    ];

    return (
        record.type === 'childList' && changed.length > 0 && changed.every(isObserverUi)
    );
}
