/* eslint-disable unicorn/prefer-query-selector -- Нужен точный поиск HTML ID, включая пустые строки и специальные символы CSS. */
/** Разрешение внешних корней popup из снимка. Использует существующие ссылки aria-controls, не угадывает владельца по позиции. */
import {type DomSnapshot} from '@training-observer/core/models';

/** Разрешает только корни popup, уже захваченные в сеансе; новых владельцев не обнаруживает. */
export function resolveRelatedRoots(
    snapshot: DomSnapshot,
    document: Document,
): Element[] {
    const roots: Element[] = [];

    for (const id of snapshot.relatedRootIds ?? []) {
        const node = snapshot.nodes[id];
        const htmlId = node?.kind === 'element' ? node.attributes['id'] : undefined;
        const element = htmlId ? document.getElementById(htmlId) : null;

        if (element) {
            roots.push(element);
        }
    }

    return roots;
}
