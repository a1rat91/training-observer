import {DecimalPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiCheckbox} from '@taiga-ui/kit';
import {MicrofrontendObserver} from '@training-observer/core';

interface AreaFixture {
    readonly id: number;
    readonly kind: 'checkbox' | 'form' | 'select' | 'table';
    readonly fields: readonly number[];
}

const MIXED_SIZES = [5, 10, 20, 50, 100, 200, 5, 10, 20, 50];
const MIXED_KINDS: ReadonlyArray<AreaFixture['kind']> = [
    'form',
    'checkbox',
    'select',
    'table',
    'form',
    'form',
    'checkbox',
    'select',
    'table',
    'form',
];

/** Воспроизводимая нагрузочная форма. Отображает только краткие счётчики; DOM-снимки остаются в памяти. */
@Component({
    selector: 'app-load',
    imports: [DecimalPipe, FormsModule, TuiButton, TuiCheckbox, TuiTextfield],
    templateUrl: './load.component.html',
    styleUrl: './load.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [MicrofrontendObserver],
})
export class LoadComponent {
    private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
    private nextId = 0;
    private mixed = this.params.get('mixed') === '1' || !this.params.has('count');

    protected readonly observer = inject(MicrofrontendObserver);

    protected readonly items = signal(
        this.createItems(this.mixed ? 10 : Number(this.params.get('count')) || 10),
    );

    protected readonly startMs = signal(0);
    protected polling = this.params.get('polling') === '0' ? 0 : 500;
    protected readonly totals = computed(() =>
        this.observer.areas().reduce(
            (total, area) => ({
                scans: total.scans + area.scanCount,
                controls: total.controls + area.logicalControls.length,
                nodes: total.nodes + (area.snapshot?.stats.nodeCount ?? 0),
                errors: total.errors + Number(Boolean(area.error)),
            }),
            {scans: 0, controls: 0, nodes: 0, errors: 0},
        ),
    );

    constructor() {
        afterNextRender(() => this.start());
    }

    protected mount(count: number): void {
        this.mixed = false;
        this.items.set(this.createItems(count));
    }

    protected mountMixed(): void {
        this.mixed = true;
        this.items.set(this.createItems(10));
    }

    protected replace(): void {
        const count = Math.min(30, this.items().length);

        this.items.update((items) => [...this.createItems(count), ...items.slice(count)]);
    }

    protected start(): void {
        const started = performance.now();

        this.observer.start(undefined, {propertyCheckIntervalMs: this.polling});
        this.startMs.set(performance.now() - started);
    }

    private createItems(count: number): AreaFixture[] {
        return Array.from(
            {length: Math.max(1, Math.min(500, Math.floor(count)))},
            (_, index) => ({
                id: ++this.nextId,
                kind: this.mixed
                    ? (MIXED_KINDS[index % MIXED_KINDS.length] ?? 'form')
                    : 'form',
                fields: Array.from(
                    {
                        length:
                            (this.mixed
                                ? (MIXED_SIZES[index % MIXED_SIZES.length] ?? 5)
                                : 5) - 1,
                    },
                    (_, field) => field + 1,
                ),
            }),
        );
    }
}
