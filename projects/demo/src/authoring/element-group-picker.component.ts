/**
 * Инструмент админки выбирает controls в переданной области без активации приложения.
 * Верхний слой принимает pointer events; hit testing временно исключает только этот слой.
 * Фокус и Tab остаются в панели. Выбор хранит живые цели только до закрытия; сохранение — descriptors и area keys.
 * Изменение/удаление выбранного DOM требует повторного выбора. Группы сохраняются отдельно от учебного сценария.
 * Включается только вне записи/прохождения. Глобальные capture handlers приложения могут видеть события слоя.
 */
import {DOCUMENT} from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    effect,
    type ElementRef,
    inject,
    input,
    signal,
    viewChild,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {
    describeElement,
    type ElementDescriptor,
    ElementResolver,
    isObservableElement,
} from '@training-observer/core';
import {AreaRegistryService} from '@training-observer/core/angular';

import {
    ELEMENT_GROUPS_KEY,
    type ElementGroup,
    parseElementGroups,
    serializeElementGroups,
} from './element-groups';

interface SelectedTarget {
    areaKey: string;
    descriptor: ElementDescriptor;
    element: Element | null;
    generation: number;
    stale: boolean;
}

@Component({
    selector: 'element-group-picker',
    imports: [FormsModule, TuiButton, TuiTextfield],
    templateUrl: './element-group-picker.component.html',
    styleUrl: './element-group-picker.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementGroupPickerComponent {
    private readonly document = inject(DOCUMENT);
    private readonly areas = inject(AreaRegistryService);
    private readonly layer = viewChild<ElementRef<HTMLElement>>('layer');
    private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
    private cleanup?: () => void;
    private previousFocus: HTMLElement | null = null;
    private editingId = '';
    private readonly storageBlocked: boolean = false;

    public readonly root = input.required<HTMLElement>();
    public readonly disabled = input(false);
    public readonly groups = signal<ElementGroup[]>([]);
    public readonly active = signal(false);
    public readonly selected = signal<SelectedTarget[]>([]);
    public readonly hover = signal<Element | null>(null);
    public readonly outline = signal<{
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);

    public readonly title = signal('');
    public readonly left = signal(false);
    public readonly error = signal('');
    public readonly canSave = computed(
        () =>
            this.title().trim().length > 0 &&
            this.selected().length > 0 &&
            this.selected().every((entry) => !entry.stale),
    );

    constructor() {
        inject(DestroyRef).onDestroy(() => this.release());

        try {
            const source =
                this.document.defaultView?.localStorage.getItem(ELEMENT_GROUPS_KEY);

            if (source) {
                this.groups.set(parseElementGroups(source));
            }
        } catch {
            this.storageBlocked = true;
            this.error.set(
                'Не удалось прочитать сохранённые группы. Существующие данные не перезаписаны.',
            );
        }

        effect(() => {
            if (this.disabled() && this.active()) {
                this.close();
            }

            const layer = this.layer()?.nativeElement;

            if (!layer || !this.active()) {
                return;
            }

            this.install(layer);
        });
    }

    public open(group?: ElementGroup): void {
        if (this.disabled() || this.storageBlocked) {
            return;
        }

        if (typeof HTMLElement.prototype.showPopover !== 'function') {
            this.error.set(
                'Для безопасного выбора нужен браузер с поддержкой Popover API.',
            );

            return;
        }

        this.error.set('');
        this.previousFocus =
            this.document.activeElement instanceof HTMLElement
                ? this.document.activeElement
                : null;
        this.editingId = group?.id ?? this.identifier();
        this.title.set(group?.title ?? `Группа вариантов ${this.groups().length + 1}`);
        const registry = this.areas.boundary();

        this.selected.set(
            (group?.targets ?? []).map((target) => {
                const root = registry.root(target.areaKey);
                const match =
                    root && this.root().contains(root)
                        ? new ElementResolver({
                              accepts: (element) =>
                                  registry.accepts(target.areaKey, element),
                          }).resolve(target.descriptor, root)
                        : null;

                const element =
                    match?.report.status === 'resolved' ? (match.element ?? null) : null;

                const owner = element ? registry.owner(element) : null;

                return {
                    ...target,
                    element,
                    generation: owner?.status === 'owned' ? owner.area.generation : -1,
                    stale: !element,
                };
            }),
        );
        this.active.set(true);
    }

    public close(): void {
        this.release();
        this.active.set(false);
        this.selected.set([]);
        this.hover.set(null);
        this.outline.set(null);
        const previous = this.previousFocus;

        this.previousFocus = null;

        if (previous?.isConnected) {
            previous.focus({preventScroll: true});
        }
    }

    public save(): void {
        this.refresh();

        if (!this.canSave()) {
            return;
        }

        const group: ElementGroup = {
            id: this.editingId,
            title: this.title().trim(),
            targets: this.selected().map(({areaKey, descriptor}) => ({
                areaKey,
                descriptor,
            })),
        };

        const existing = this.groups();
        const groups = existing.some((entry) => entry.id === group.id)
            ? existing.map((entry) => (entry.id === group.id ? group : entry))
            : [...existing, group];

        try {
            this.document.defaultView!.localStorage.setItem(
                ELEMENT_GROUPS_KEY,
                serializeElementGroups(groups),
            );
            this.groups.set(groups);
            this.close();
        } catch {
            this.error.set('Не удалось сохранить группу. Выбор оставлен открытым.');
        }
    }

    public remove(id: string): void {
        this.selected.update((entries) =>
            entries.filter((entry) => entry.descriptor.id !== id),
        );
    }

    public name(descriptor: ElementDescriptor): string {
        const features = descriptor.fingerprint.features;

        return (
            features.accessibleName ||
            features.label ||
            features.placeholder ||
            features.text ||
            features.tag
        );
    }

    public move(event: PointerEvent): void {
        if (this.inPanel(event.target)) {
            this.hover.set(null);
            this.outline.set(null);

            return;
        }

        const element = this.targetAt(event.clientX, event.clientY);

        this.hover.set(element);
        this.position();
    }

    public choose(event: MouseEvent): void {
        if (this.inPanel(event.target)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const element = this.targetAt(event.clientX, event.clientY);

        if (!element) {
            this.error.set(
                'Выберите поддерживаемый элемент управления в наблюдаемой области.',
            );

            return;
        }

        const previous = this.selected().find((entry) => entry.element === element);

        if (previous) {
            this.remove(previous.descriptor.id);

            return;
        }

        const registry = this.areas.boundary();
        const owner = registry.owner(element);

        if (owner.status !== 'owned') {
            return;
        }

        try {
            const descriptor = describeElement(
                element,
                registry.root(owner.area.key)!,
                this.identifier(),
                {accepts: (target) => registry.accepts(owner.area.key, target)},
            );

            this.selected.update((entries) => [
                ...entries,
                {
                    element,
                    descriptor,
                    areaKey: owner.area.key,
                    generation: owner.area.generation,
                    stale: false,
                },
            ]);
            this.error.set('');
        } catch {
            this.error.set(
                'Не удалось описать элемент. Выберите другой элемент управления.',
            );
        }
    }

    public guard(event: Event): void {
        if (!this.inPanel(event.target)) {
            event.preventDefault();
        }

        event.stopPropagation();
    }

    private inPanel(target: EventTarget | null): boolean {
        return target instanceof Node && !!this.panel()?.nativeElement.contains(target);
    }

    private targetAt(x: number, y: number): Element | null {
        const layer = this.layer()!.nativeElement;

        layer.style.pointerEvents = 'none';
        let hits: Element[];

        try {
            hits = this.document.elementsFromPoint(x, y);
        } finally {
            layer.style.pointerEvents = '';
        }

        const registry = this.areas.boundary();
        let element = hits.find((hit) => !layer.contains(hit)) ?? null;
        const visited = new Set<Element>();

        while (element && this.root().contains(element) && !visited.has(element)) {
            visited.add(element);

            if (
                element instanceof HTMLLabelElement &&
                element.control &&
                this.root().contains(element.control)
            ) {
                element = element.control;
            }

            if (isObservableElement(element, this.root())) {
                const owner = registry.owner(element);

                if (owner.status !== 'owned') {
                    return null;
                }

                try {
                    describeElement(element, registry.root(owner.area.key)!, 'preview');

                    return element;
                } catch {
                    /* Статический текст не становится вариантом действия. */
                }
            }

            element = element.parentElement;
        }

        return null;
    }

    private install(layer: HTMLElement): void {
        this.release();
        layer.showPopover();
        this.panel()!.nativeElement.focus({preventScroll: true});

        const keys = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.close();

                return;
            }

            if (event.key === 'Tab') {
                const controls = [
                    ...this.panel()!.nativeElement.querySelectorAll<HTMLElement>(
                        'button:not(:disabled),input:not(:disabled)',
                    ),
                ];

                const index = controls.indexOf(
                    this.document.activeElement as HTMLElement,
                );

                const start = index < 0 && event.shiftKey ? 0 : index;
                const next =
                    (start + (event.shiftKey ? -1 : 1) + controls.length) %
                    controls.length;

                event.preventDefault();
                controls[next]?.focus();
            }

            if (!this.inPanel(event.target)) {
                event.preventDefault();
            }

            event.stopImmediatePropagation();
        };

        const focus = (event: FocusEvent): void => {
            if (!this.inPanel(event.target)) {
                this.panel()?.nativeElement.focus({preventScroll: true});
            }
        };

        const observer = new MutationObserver((records) => {
            this.selected.update((entries) =>
                entries.map((entry) => ({
                    ...entry,
                    stale:
                        entry.stale ||
                        records.some((record) =>
                            [...record.removedNodes].some(
                                (node) =>
                                    node === entry.element ||
                                    (!!entry.element && node.contains(entry.element)),
                            ),
                        ),
                })),
            );
            this.refresh();
            this.position();
        });

        observer.observe(this.root(), {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        this.document.addEventListener('keydown', keys, true);
        this.document.addEventListener('focusin', focus, true);
        const position = (): void => this.position();

        this.document.addEventListener('scroll', position, true);
        this.document.defaultView!.addEventListener('resize', position);

        this.cleanup = () => {
            observer.disconnect();
            this.document.removeEventListener('keydown', keys, true);
            this.document.removeEventListener('focusin', focus, true);
            this.document.removeEventListener('scroll', position, true);
            this.document.defaultView!.removeEventListener('resize', position);
            layer.hidePopover();
        };
    }

    private refresh(): void {
        const registry = this.areas.boundary();

        this.selected.update((entries) =>
            entries.map((entry) => {
                const owner = entry.element ? registry.owner(entry.element) : null;
                let changed = false;

                if (entry.element && owner?.status === 'owned') {
                    try {
                        const current = describeElement(
                            entry.element,
                            registry.root(owner.area.key)!,
                            entry.descriptor.id,
                            {
                                accepts: (target) =>
                                    registry.accepts(owner.area.key, target),
                            },
                        );

                        changed =
                            JSON.stringify(current.fingerprint) !==
                            JSON.stringify(entry.descriptor.fingerprint);
                    } catch {
                        changed = true;
                    }
                }

                return {
                    ...entry,
                    stale:
                        entry.stale ||
                        changed ||
                        !entry.element?.isConnected ||
                        owner?.status !== 'owned' ||
                        owner.area.key !== entry.areaKey ||
                        owner.area.generation !== entry.generation,
                };
            }),
        );
    }

    private position(): void {
        const element = this.hover();

        this.outline.set(
            element?.isConnected ? element.getBoundingClientRect().toJSON() : null,
        );
    }

    private release(): void {
        this.cleanup?.();
        this.cleanup = undefined;
    }

    private identifier(): string {
        return crypto.getRandomValues(new Uint32Array(4)).join('-');
    }
}
