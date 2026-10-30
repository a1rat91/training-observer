import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
} from '@angular/core';
import {TuiPan} from '@taiga-ui/cdk';
import {TUI_DARK_MODE, TuiDropdown} from '@taiga-ui/core';
import {requiresBlur} from '@training-observer/contracts';
import {PageObservation, providePageObservation} from '@training-observer/core';

import {formatControlValue} from '../format-control-value';

@Component({
    selector: 'tc-controls-widget',
    imports: [TuiDropdown, TuiPan],
    templateUrl: './controls-widget.component.html',
    styleUrl: './controls-widget.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [providePageObservation()],
    host: {'data-training-observer-ignore': ''},
})
export class ControlsWidgetComponent {
    private readonly position = signal<readonly [number, number]>([0, 0]);

    protected readonly transform = computed(() => {
        const [x, y] = this.position();

        return `translate(${x}px, ${y}px)`;
    });

    protected readonly darkMode = inject(TUI_DARK_MODE);
    protected readonly observer = inject(PageObservation);
    protected readonly areas = this.observer.areas;
    protected readonly controlsCount = computed(() =>
        this.areas().reduce((sum, area) => sum + area.logicalControls.length, 0),
    );

    protected readonly value = formatControlValue;
    protected readonly needsBlur = requiresBlur;
    protected readonly popupLabels = {
        closed: 'Закрыт',
        open: 'Открыт',
        unresolved: 'Не найден',
        native: 'Нативный список',
    };

    protected onPan([deltaX, deltaY]: readonly [number, number]): void {
        this.position.update(([x, y]) => [x + deltaX, y + deltaY]);
    }
}
