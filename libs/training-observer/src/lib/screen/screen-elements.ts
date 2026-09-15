/** Поиск в готовом снимке. Общие правила для корня области и отдельного носителя ID; живой DOM не читается. */
import {
    type DomElementSnapshot,
    type DomSnapshot,
    type ScreenElementSelector,
} from '@training-observer/core/models';

export function validateScreenSelector(selector: ScreenElementSelector): void {
    if (
        (!selector.tagName?.trim() && !selector.attribute?.name.trim()) ||
        (selector.tagName !== undefined && !selector.tagName.trim()) ||
        (selector.attribute && !selector.attribute.name.trim())
    ) {
        throw new Error('Screen element rules must be explicit.');
    }
}

export function matchesScreenElement(
    node: DomElementSnapshot,
    selector: ScreenElementSelector,
): boolean {
    const {tagName, attribute} = selector;

    return (
        node.visible &&
        (!tagName || node.tagName === tagName.toLowerCase()) &&
        (!attribute ||
            (Object.hasOwn(node.attributes, attribute.name) &&
                (attribute.value === undefined ||
                    node.attributes[attribute.name] === attribute.value)))
    );
}

/** parentId ограничивает область; защита от циклов не даёт повреждённому графу зависнуть. */
export function belongsToScreen(
    snapshot: DomSnapshot,
    id: string,
    rootId: string,
): boolean {
    const visited = new Set<string>();
    let node = snapshot.nodes[id];

    while (node && !visited.has(node.id)) {
        if (node.id === rootId) {
            return true;
        }

        visited.add(node.id);
        node = node.parentId ? snapshot.nodes[node.parentId] : undefined;
    }

    return false;
}
