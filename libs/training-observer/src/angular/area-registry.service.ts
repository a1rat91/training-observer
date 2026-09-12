/**
 * AreaRegistryService — Angular facade библиотечного registry без визуальных компонентов.
 * connect создаёт browser adapter для заданного scope и публикует readonly snapshots через signal.
 * Повторное подключение освобождает предыдущий adapter; disconnect и DestroyRef снимают observer
 * и subscription. Provider задаётся интеграцией на уровне маршрута, а не глобально для всех MF.
 */
import {DOCUMENT} from '@angular/common';
import {DestroyRef, inject, Injectable, signal} from '@angular/core';
import {
    type AreaDefinition,
    AreaRegistry,
    type AreaSnapshot,
} from '@training-observer/core';

@Injectable()
export class AreaRegistryService {
    private readonly document = inject(DOCUMENT);
    private registry?: AreaRegistry;
    private unsubscribe?: () => void;
    private readonly state = signal<readonly AreaSnapshot[]>([]);

    public readonly areas = this.state.asReadonly();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.disconnect());
    }

    public connect(scope: Element, definitions: readonly AreaDefinition[]): AreaRegistry {
        this.disconnect();

        if (scope.ownerDocument !== this.document) {
            throw new Error('Area scope belongs to a different document');
        }

        const registry = new AreaRegistry(definitions);

        this.registry = registry;
        this.unsubscribe = registry.subscribe(() => this.state.set(registry.snapshots()));
        registry.start(scope);
        this.state.set(registry.snapshots());

        return registry;
    }

    public disconnect(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.registry?.stop();
        this.registry = undefined;
        this.state.set([]);
    }
}
