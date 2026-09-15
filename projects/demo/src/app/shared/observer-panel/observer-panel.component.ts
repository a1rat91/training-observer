import {DOCUMENT, JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton} from '@taiga-ui/core';
import {DomHighlighter, type DomNodeId, TrainingObserver} from '@training-observer/core';

@Component({
    selector: 'app-observer-panel',
    imports: [FormsModule, JsonPipe, TuiButton],
    templateUrl: './observer-panel.component.html',
    styleUrl: './observer-panel.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [TrainingObserver, DomHighlighter],
    host: {'data-training-observer-ignore': ''},
})
export class ObserverPanelComponent {
    private readonly highlighter = inject(DomHighlighter);

    protected readonly observer = inject(TrainingObserver);

    protected readonly highlight = signal<{
        mode: 'all' | 'dom' | 'one';
        nodeId?: DomNodeId;
    } | null>(null);

    protected readonly error = signal('');
    protected readonly document = inject(DOCUMENT);
    protected maxNodes = 10_000;
    protected maxDepth = 100;
    protected batchDelayMs = 50;
    protected propertyCheckIntervalMs = 500;
    protected wholeDocument = false;
    protected readonly popupLabels = {
        closed: 'Закрыт',
        open: 'Открыт',
        unresolved: 'Связанный список не найден',
        native: 'Native options',
    };

    public readonly root = input.required<HTMLElement>();

    constructor() {
        effect(() => {
            const selection = this.highlight();
            const snapshot = this.observer.snapshot();

            if (!selection || !snapshot) {
                this.highlighter.clear();

                return;
            }

            const ids =
                selection.mode === 'dom'
                    ? snapshot.interactiveIds
                    : this.observer
                          .logicalControls()
                          .map((control) => control.targetNodeId);

            this.highlighter.show(
                snapshot,
                ids,
                selection.mode === 'one' ? selection.nodeId : undefined,
            );
        });
        afterNextRender(() => this.start());
    }

    protected start(): void {
        this.run(() =>
            this.observer.start(this.observedRoot(), {
                maxNodes: this.maxNodes,
                maxDepth: this.maxDepth,
                batchDelayMs: this.batchDelayMs,
                propertyCheckIntervalMs: this.propertyCheckIntervalMs,
            }),
        );
    }

    protected capture(): void {
        this.run(() =>
            this.observer.capture(this.observedRoot(), {
                maxNodes: this.maxNodes,
                maxDepth: this.maxDepth,
            }),
        );
    }

    private observedRoot(): HTMLElement {
        return this.wholeDocument ? this.document.body : this.root();
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
