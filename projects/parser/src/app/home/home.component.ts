import {JsonPipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TrainingObserver} from '@training-observer/core';

@Component({
    selector: 'app-home',
    imports: [FormsModule, JsonPipe, TuiButton, TuiTextfield],
    templateUrl: './home.component.html',
    styleUrl: './home.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
    protected readonly observer = inject(TrainingObserver);
    protected readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
    protected readonly additionalField = signal(false);
    protected readonly error = signal('');
    protected maxNodes = 10_000;
    protected maxDepth = 100;

    protected capture(): void {
        try {
            this.observer.capture(this.page().nativeElement, {maxNodes: this.maxNodes, maxDepth: this.maxDepth});
            this.error.set('');
        } catch (error: unknown) {
            this.error.set(error instanceof Error ? error.message : String(error));
        }
    }
}
