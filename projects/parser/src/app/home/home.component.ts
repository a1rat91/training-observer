import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';

import {ObserverPanelComponent} from '../observer-panel/observer-panel.component';

@Component({
    selector: 'app-home',
    imports: [ObserverPanelComponent, TuiButton, TuiTextfield],
    templateUrl: './home.component.html',
    styleUrl: './home.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
    protected readonly additionalField = signal(false);
    protected readonly showInspector = signal(true);
}
