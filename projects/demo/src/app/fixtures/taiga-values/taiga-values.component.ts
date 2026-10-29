import {JsonPipe} from '@angular/common';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    type ElementRef,
    inject,
    viewChild,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TuiDay, TuiTime} from '@taiga-ui/cdk';
import {
    TuiInputDateModule,
    TuiInputTimeModule,
    TuiMultiSelectModule,
    TuiTextfieldControllerModule,
} from '@taiga-ui/legacy';
import {provideDomObservation, TrainingObserver} from '@training-observer/core';

@Component({
    selector: 'app-taiga-values',
    imports: [
        FormsModule,
        JsonPipe,
        TuiInputDateModule,
        TuiInputTimeModule,
        TuiMultiSelectModule,
        TuiTextfieldControllerModule,
    ],
    templateUrl: './taiga-values.component.html',
    styleUrl: './taiga-values.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [provideDomObservation()],
})
export class TaigaValuesComponent {
    private readonly root = viewChild.required<ElementRef<HTMLElement>>('observed');

    protected readonly observer = inject(TrainingObserver);
    protected date: TuiDay | null = new TuiDay(2026, 9, 29);
    protected time: TuiTime | null = new TuiTime(12, 30);
    protected selected: readonly string[] = ['First, with comma', 'Second'];
    protected tagged: readonly string[] = ['First, with comma', 'Second'];
    protected disabled = false;

    constructor() {
        afterNextRender(() => {
            this.observer.start(this.root().nativeElement, {
                batchDelayMs: 0,
                propertyCheckIntervalMs: 0,
            });
        });
    }

    protected replace(): void {
        this.date = new TuiDay(2026, 9, 30);
        this.time = new TuiTime(15, 45);
        this.selected = ['Updated, with comma', 'Third'];
        this.tagged = [...this.selected];
    }

    protected clear(): void {
        this.date = null;
        this.time = null;
        this.selected = [];
        this.tagged = [];
    }
}
