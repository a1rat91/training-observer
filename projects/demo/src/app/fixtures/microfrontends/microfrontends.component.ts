import { JsonPipe } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiInput } from '@taiga-ui/core';
import { TuiDataListWrapper, TuiSelect } from '@taiga-ui/kit';
import { MicrofrontendObserver } from '@training-observer/core';

@Component({
    selector: 'app-microfrontends',
    imports: [FormsModule, JsonPipe, TuiInput, TuiButton, TuiSelect, TuiDataListWrapper],
    providers: [MicrofrontendObserver],
    templateUrl: './microfrontends.component.html',
    styleUrl: './microfrontends.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MicrofrontendsComponent {
    protected readonly observer = inject(MicrofrontendObserver);
    protected readonly selectedId = signal('');
    protected readonly selected = computed(
        () =>
            this.observer.areas().find((area) => area.id === this.selectedId()) ??
            this.observer.areas().at(0),
    );
    protected readonly extra = signal(false);
    protected readonly nested = signal(true);
    protected readonly departments = ['Разработка', 'Поддержка', 'Продажи'];
    protected name = 'Анна';
    protected department: string | null = 'Разработка';
    protected polling = 500;

    constructor() {
        afterNextRender(() => this.start());
    }

    protected start(): void {
        this.observer.start(undefined, { propertyCheckIntervalMs: this.polling });
    }
}
