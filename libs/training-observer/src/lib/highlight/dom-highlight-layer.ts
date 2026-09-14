/** Отрисовка отдельного слоя подсветки по текущим DOM-ссылкам. Не добавляет идентификаторы наблюдаемым контролам. */
import { type DomNodeId } from '@training-observer/core/models';
import { DomGeometry } from '../capture/dom-geometry';
import { OBSERVER_UI_ATTRIBUTE } from '../observation/dom-observer-ui';

const COLORS = ['#d7263d', '#1769aa', '#15803d', '#9333ea', '#b45309', '#087f8c'];

export interface HighlightTarget {
    readonly nodeId: DomNodeId;
    readonly element: WeakRef<Element>;
    readonly number: number;
}

/** Один слой отображения и один цикл анимации независимо от DOM capture. */
export class DomHighlightLayer {
    private readonly host: HTMLElement;
    private readonly shadow: ShadowRoot;
    private readonly view: Window;
    private readonly groups = new Map<DomNodeId, { element: HTMLElement; geometry: string }>();
    private frame = 0;

    constructor(
        private readonly document: Document,
        private readonly targets: readonly HighlightTarget[],
    ) {
        this.view = document.defaultView!;
        this.host = document.createElement('training-observer-highlights');
        this.host.setAttribute(OBSERVER_UI_ATTRIBUTE, '');
        this.host.setAttribute('aria-hidden', 'true');
        this.host.style.cssText =
            'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;overflow:hidden!important;contain:strict!important;';
        this.shadow = this.host.attachShadow({ mode: 'open' });
        document.body.append(this.host);
        this.update();
    }

    dispose(): void {
        this.view.cancelAnimationFrame(this.frame);
        this.host.remove();
        this.groups.clear();
    }

    private isRendered(element: Element): boolean {
        // Закрытый details может возвращать устаревшие rects для скрытых потомков.
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor.localName !== 'details' || ancestor.hasAttribute('open')) continue;
            if (ancestor === element) continue;
            const summary = Array.from(ancestor.children).find((child) => child.localName === 'summary');
            if (!summary?.contains(element)) return false;
        }
        return typeof element.checkVisibility !== 'function' || element.checkVisibility();
    }

    private update = (): void => {
        // Геометрический кэш принадлежит одному кадру; при scroll нельзя переиспользовать rects снимка.
        const geometry = new DomGeometry(this.view);
        for (const target of this.targets) {
            const element = target.element.deref();
            const rects =
                element?.isConnected &&
                element.ownerDocument === this.document &&
                this.isRendered(element) &&
                geometry.visible(element)
                    ? geometry
                          .rects(element)
                          .filter(
                              (rect) =>
                                  rect.bottom > 0 &&
                                  rect.right > 0 &&
                                  rect.top < this.view.innerHeight &&
                                  rect.left < this.view.innerWidth,
                          )
                    : [];
            const key = JSON.stringify(rects.map(({ x, y, width, height }) => [x, y, width, height]));
            let group = this.groups.get(target.nodeId);
            if (group?.geometry === key) continue;
            if (!group) {
                const container = this.document.createElement('div');
                container.dataset['nodeId'] = target.nodeId;
                this.shadow.append(container);
                group = { element: container, geometry: '' };
                this.groups.set(target.nodeId, group);
            }
            group.geometry = key;
            group.element.replaceChildren();
            const color = COLORS[(target.number - 1) % COLORS.length];
            for (const rect of rects) {
                const box = this.document.createElement('div');
                box.dataset['highlightRect'] = '';
                box.style.cssText = `position:absolute;pointer-events:none;box-sizing:border-box;border:2px solid ${color};background:${color}14;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;`;
                group.element.append(box);
            }
            const first = rects[0];
            if (first) {
                const label = this.document.createElement('span');
                label.textContent = String(target.number);
                label.style.cssText = `position:absolute;pointer-events:none;font:600 12px/18px monospace;color:white;background:${color};padding:0 4px;border-radius:3px;left:${Math.max(0, Math.min(first.x, this.view.innerWidth - 40))}px;top:${Math.max(0, first.y - 18)}px;`;
                group.element.append(label);
            }
        }
        this.frame = this.view.requestAnimationFrame(this.update);
    };
}
