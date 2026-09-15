import {JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton} from '@taiga-ui/core';
import {
    DomHighlighter,
    type DomNodeId,
    MicrofrontendObserver,
    provideDomObservation,
} from '@training-observer/core';

@Component({
    selector: 'app-observer-panel',
    imports: [FormsModule, JsonPipe, TuiButton],
    templateUrl: './observer-panel.component.html',
    styleUrl: './observer-panel.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideDomObservation(), DomHighlighter],
    host: {'data-training-observer-ignore': '', 'data-training-observer-ui': ''},
})
export class ObserverPanelComponent {
    private readonly highlighter = inject(DomHighlighter);

    public readonly selectors = input.required<string | readonly string[]>();
    public readonly observer = inject(MicrofrontendObserver);

    public readonly highlight = signal<{
        mode: 'all' | 'dom' | 'one';
        nodeId?: DomNodeId;
    } | null>(null);

    public readonly error = signal('');
    public readonly selectedId = signal('');
    public readonly selected = computed(
        () =>
            this.observer.areas().find((area) => area.id === this.selectedId()) ??
            this.observer.areas()[0],
    );

    public readonly snapshot = computed(() => this.selected()?.snapshot ?? null);
    public readonly logicalControls = computed(
        () => this.selected()?.logicalControls ?? [],
    );

    public maxNodes = 10_000;
    public maxDepth = 100;
    public batchDelayMs = 50;
    public propertyCheckIntervalMs = 500;
    public readonly popupLabels = {
        closed: 'Закрыт',
        open: 'Открыт',
        unresolved: 'Связанный список не найден',
        native: 'Native options',
    };

    constructor() {
        effect(() => {
            const selection = this.highlight();
            const snapshot = this.snapshot();

            if (!selection || !snapshot) {
                this.highlighter.clear();

                return;
            }

            const ids =
                selection.mode === 'dom'
                    ? snapshot.interactiveIds
                    : this.logicalControls().map((control) => control.targetNodeId);

            this.highlighter.show(
                snapshot,
                ids,
                selection.mode === 'one' ? selection.nodeId : undefined,
            );
        });
        afterNextRender(() => this.start());
    }

    public start(): void {
        this.run(() =>
            this.observer.observe(this.selectors(), {
                maxNodes: this.maxNodes,
                maxDepth: this.maxDepth,
                batchDelayMs: this.batchDelayMs,
                propertyCheckIntervalMs: this.propertyCheckIntervalMs,
            }),
        );
    }

    public capture(): void {
        this.run(() => this.observer.refresh(this.selected()?.id));
    }

    private run(action: () => unknown): void {
        try {
            action();
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(error instanceof Error ? error.message : String(error));
        }
    }
}
