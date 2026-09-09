// Taiga UI's scroll controls contain tracks and thumbs only. Do not exclude
// tui-scrollbar itself: it also contains the application's scrollable content.
export const SCROLL_DECORATION_SELECTOR = 'tui-scroll-controls';

export function isScrollDecoration(node: Node): boolean {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;

    return !!element?.closest(SCROLL_DECORATION_SELECTOR);
}
