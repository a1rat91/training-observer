import {DOCUMENT, JsonPipe} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, inject, input, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton} from '@taiga-ui/core';
import {TrainingObserver} from '@training-observer/core';

@Component({
    selector: 'app-observer-panel',
    imports: [FormsModule, JsonPipe, TuiButton],
    providers: [TrainingObserver],
    host: {'data-training-observer-ignore': ''},
    templateUrl: './observer-panel.component.html',
    styleUrl: './observer-panel.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObserverPanelComponent {
    readonly root = input.required<HTMLElement>();
    protected readonly observer = inject(TrainingObserver);
    protected readonly error = signal('');
    protected readonly document = inject(DOCUMENT);
    protected maxNodes = 10_000;
    protected maxDepth = 100;
    protected batchDelayMs = 50;
    protected propertyCheckIntervalMs = 500;
    protected wholeDocument = false;

    constructor() {
        afterNextRender(() => this.start());
    }

    protected start(): void {
        this.run(() => this.observer.start(this.observedRoot(), {
            maxNodes: this.maxNodes,
            maxDepth: this.maxDepth,
            batchDelayMs: this.batchDelayMs,
            propertyCheckIntervalMs: this.propertyCheckIntervalMs,
        }));
    }

    protected capture(): void {
        this.run(() => this.observer.capture(this.observedRoot(), {maxNodes: this.maxNodes, maxDepth: this.maxDepth}));
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
