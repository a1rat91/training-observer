import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {TuiRoot} from '@taiga-ui/core';

@Component({
    selector: 'my-app',
    imports: [RouterLink, RouterLinkActive, RouterOutlet, TuiRoot],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
