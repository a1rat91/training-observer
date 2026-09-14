/** Исключение служебной декорации прокрутки Taiga. Содержимое прокручиваемой области по-прежнему наблюдается. */
// Декорация прокрутки Taiga содержит только треки и ползунки. Не исключаем
// сам tui-scrollbar: в нём также находится содержимое приложения.
export const SCROLL_DECORATION_SELECTOR = 'tui-scroll-controls';

export function isScrollDecoration(node: Node): boolean {
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;

    return !!element?.closest(SCROLL_DECORATION_SELECTOR);
}
