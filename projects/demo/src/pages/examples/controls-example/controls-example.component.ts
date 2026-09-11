import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {TuiAddonDoc} from '@taiga-ui/addon-doc';
import {TuiButton} from '@taiga-ui/core';

import {DemoMicrofrontendComponent} from '../../../components/demo-microfrontend/demo-microfrontend.component';
import {ObserverPanelComponent} from '../../../components/observer-panel';

@Component({
    standalone: true,
    selector: 'controls-example',
    imports: [DemoMicrofrontendComponent, ObserverPanelComponent, TuiAddonDoc, TuiButton],
    templateUrl: './controls-example.component.html',
    styleUrl: './controls-example.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [],
})
export default class ControlsExampleComponent {
    public readonly showInspector = signal(true);
}
