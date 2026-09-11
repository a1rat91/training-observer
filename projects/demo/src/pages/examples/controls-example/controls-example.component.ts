import {ChangeDetectionStrategy, Component} from '@angular/core';
import {TuiAddonDoc} from '@taiga-ui/addon-doc';

@Component({
    standalone: true,
    selector: 'controls-example',
    imports: [TuiAddonDoc],
    templateUrl: './controls-example.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [],
})
export default class ControlsExampleComponent {}
