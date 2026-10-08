import {DOCUMENT, JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {MicrofrontendObserver, provideDomObservation} from '@training-observer/core';
import {type MicrofrontendSnapshot} from '@training-observer/core/models';

import {
    type FieldValue,
    ProcedureFieldComponent,
} from '../../shared/demo-form/procedure-field.component';
import {
    ASYNC_MICROFRONTENDS,
    type AsyncMicrofrontendDefinition,
} from './async-microfrontends.data';

interface MicrofrontendInstance {
    readonly generation: number;
    readonly phase: 'loading' | 'ready';
    readonly disabled: boolean;
    readonly extra: boolean;
    readonly values: Readonly<Record<string, FieldValue>>;
}

@Component({
    selector: 'app-async-microfrontends',
    imports: [JsonPipe, ProcedureFieldComponent, TuiButton],
    templateUrl: './async-microfrontends.component.html',
    styleUrl: './async-microfrontends.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideDomObservation()],
})
export class AsyncMicrofrontendsComponent {
    private readonly view = inject(DOCUMENT).defaultView;
    private readonly pending = new Map<string, Set<number>>();
    private generation = 0;

    protected readonly observer = inject(MicrofrontendObserver);
    protected readonly definitions = ASYNC_MICROFRONTENDS;
    protected readonly phaseNames = {
        loading: 'Загрузка',
        ready: 'Готов',
        unknown: 'Готовность не указана',
    };

    protected readonly instances = signal<
        Readonly<Record<string, MicrofrontendInstance>>
    >({});

    protected readonly selectedId = signal('');
    protected readonly selected = computed(
        () =>
            this.observer.areas().find((area) => area.id === this.selectedId()) ??
            this.observer.areas()[0],
    );

    protected readonly readyCount = computed(
        () => this.observer.areas().filter((area) => this.phase(area) === 'ready').length,
    );

    protected readonly controlCount = computed(() =>
        this.observer
            .areas()
            .reduce((total, area) => total + area.logicalControls.length, 0),
    );

    constructor() {
        inject(DestroyRef).onDestroy(() => this.cancelAll());
        afterNextRender(() => {
            this.start();
            this.reloadAll();
        });
    }

    protected start(): void {
        this.observer.start();
    }

    protected reloadAll(): void {
        this.cancelAll();
        this.instances.set({});

        for (const definition of this.definitions) {
            this.load(definition);
        }
    }

    protected load(definition: AsyncMicrofrontendDefinition): void {
        this.unmount(definition.name);
        const generation = ++this.generation;

        this.schedule(definition.name, definition.mountDelayMs, () => {
            this.instances.update((instances) => ({
                ...instances,
                [definition.name]: {
                    generation,
                    phase: 'loading',
                    disabled: false,
                    extra: false,
                    values: {},
                },
            }));
            this.schedule(definition.name, definition.readyDelayMs, () =>
                this.update(definition.name, (instance) => ({
                    ...instance,
                    phase: 'ready',
                    values: {...definition.initialValues},
                })),
            );
        });
    }

    protected unmount(name: string): void {
        this.cancel(name);
        this.instances.update((instances) =>
            Object.fromEntries(Object.entries(instances).filter(([key]) => key !== name)),
        );
    }

    protected setValue(name: string, id: string, value: FieldValue): void {
        this.update(name, (instance) => ({
            ...instance,
            values: {...instance.values, [id]: value},
        }));
    }

    protected toggleDisabled(name: string): void {
        this.update(name, (instance) => ({...instance, disabled: !instance.disabled}));
    }

    protected toggleExtra(name: string): void {
        this.update(name, (instance) => ({...instance, extra: !instance.extra}));
    }

    /** Статус читается из результата парсера, а не из модели имитации. */
    protected phase(
        area: MicrofrontendSnapshot,
    ): MicrofrontendInstance['phase'] | 'unknown' {
        const snapshot = area.snapshot;
        const root = snapshot?.rootId ? snapshot.nodes[snapshot.rootId] : null;
        const phase =
            root?.kind === 'element' ? root.attributes['data-load-state'] : null;

        return phase === 'loading' || phase === 'ready' ? phase : 'unknown';
    }

    private update(
        name: string,
        change: (instance: MicrofrontendInstance) => MicrofrontendInstance,
    ): void {
        this.instances.update((instances) =>
            instances[name] ? {...instances, [name]: change(instances[name])} : instances,
        );
    }

    private schedule(name: string, delayMs: number, action: () => void): void {
        const view = this.view;

        if (!view) {
            return;
        }

        const pending = this.pending.get(name) ?? new Set<number>();

        this.pending.set(name, pending);
        const timer = view.setTimeout(() => {
            pending.delete(timer);

            if (!pending.size) {
                this.pending.delete(name);
            }

            action();
        }, delayMs);

        pending.add(timer);
    }

    private cancel(name: string): void {
        for (const timer of this.pending.get(name) ?? []) {
            this.view?.clearTimeout(timer);
        }

        this.pending.delete(name);
    }

    private cancelAll(): void {
        for (const name of this.pending.keys()) {
            this.cancel(name);
        }
    }
}
