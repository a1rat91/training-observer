/** Чтение геометрии и доступности указателю. Проверяет rects, viewport и перекрытие; не использует координаты как постоянную идентичность. */
import { type DomRectSnapshot, type HitTestResult } from '@training-observer/core/models';

/** Кэш одного capture: геометрия и computed styles не переиспользуются между снимками. */
export class DomGeometry {
    private readonly styles = new WeakMap<Element, CSSStyleDeclaration>();
    private readonly boxes = new WeakMap<Element, readonly DOMRect[]>();

    constructor(private readonly view: Window) {}

    style(element: Element): CSSStyleDeclaration {
        let style = this.styles.get(element);

        if (!style) {
            style = this.view.getComputedStyle(element);
            this.styles.set(element, style);
        }

        return style;
    }

    rects(element: Element): readonly DOMRect[] {
        let rects = this.boxes.get(element);

        if (!rects) {
            rects = Array.from(element.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
            this.boxes.set(element, rects);
        }

        return rects;
    }

    serializeRects(element: Element): readonly DomRectSnapshot[] {
        return this.rects(element).map(({ x, y, width, height }) => ({ x, y, width, height }));
    }

    visible(element: Element): boolean {
        return this.rects(element).length > 0 && this.stylesAllowVisibility(element);
    }

    textVisible(text: Text): boolean {
        if (!text.parentElement || !this.stylesAllowVisibility(text.parentElement)) {
            return false;
        }

        const range = text.ownerDocument.createRange();

        range.selectNodeContents(text);

        return Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
    }

    inViewport(element: Element): boolean {
        return this.rects(element).some((rect) => this.clipToViewport(rect) !== null);
    }

    hitTest(element: Element): HitTestResult {
        if (!this.visible(element) || !this.inViewport(element)) {
            return 'not-tested';
        }

        if (typeof element.ownerDocument.elementFromPoint !== 'function') {
            return 'unavailable';
        }

        for (const rect of this.rects(element)) {
            const clipped = this.clipToViewport(rect);

            if (!clipped) {
                continue;
            }

            const { left, top, right, bottom } = clipped;
            const insetX = Math.min(2, (right - left) / 4);
            const insetY = Math.min(2, (bottom - top) / 4);
            const points = [
                [(left + right) / 2, (top + bottom) / 2],
                [left + insetX, top + insetY],
                [right - insetX, bottom - insetY],
            ];

            for (const [x, y] of points) {
                const hit = element.ownerDocument.elementFromPoint(x, y);

                if (hit && element.contains(hit)) {
                    return 'hit';
                }
            }
        }

        return 'covered';
    }

    private stylesAllowVisibility(element: Element): boolean {
        const visibility = this.style(element).visibility;

        if (visibility === 'hidden' || visibility === 'collapse') {
            return false;
        }

        // Потомок может переопределить visibility:hidden, но не opacity:0 предка.
        for (let current: Element | null = element; current; current = current.parentElement) {
            const style = this.style(current);

            if (style.display === 'none' || style.opacity === '0' || style.contentVisibility === 'hidden') {
                return false;
            }
        }

        return true;
    }

    private clipToViewport(
        rect: DOMRect,
    ): { left: number; top: number; right: number; bottom: number } | null {
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(this.view.innerWidth, rect.right);
        const bottom = Math.min(this.view.innerHeight, rect.bottom);

        return right > left && bottom > top ? { left, top, right, bottom } : null;
    }
}
