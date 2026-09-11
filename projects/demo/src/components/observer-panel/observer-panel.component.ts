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
    host: {'attr.data-training-observer-ignore': ''},
})
export class ObserverPanelComponent {
    private readonly highlighter = inject(DomHighlighter);

    public readonly root = input.required<HTMLElement>();
    public readonly observer = inject(TrainingObserver);

    public readonly highlight = signal<{
        mode: 'all' | 'dom' | 'one';
        nodeId?: DomNodeId;
    } | null>(null);

    public readonly error = signal('');
    public readonly document = inject(DOCUMENT);
    public maxNodes = 10_000;
    public maxDepth = 100;
    public batchDelayMs = 50;
    public propertyCheckIntervalMs = 500;
    public wholeDocument = false;
    public readonly popupLabels = {
        closed: 'Закрыт',
        open: 'Открыт',
        unresolved: 'Связанный список не найден',
        native: 'Native options',
    };

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

    public start(): void {
        this.run(() =>
            this.observer.start(this.observedRoot(), {
                maxNodes: this.maxNodes,
                maxDepth: this.maxDepth,
                batchDelayMs: this.batchDelayMs,
                propertyCheckIntervalMs: this.propertyCheckIntervalMs,
            }),
        );
    }

    public capture(): void {
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
