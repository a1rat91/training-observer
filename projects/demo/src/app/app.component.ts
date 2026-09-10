import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {TuiRoot} from '@taiga-ui/core';

@Component({
    selector: 'app-root',
    imports: [RouterLink, RouterLinkActive, RouterOutlet, TuiRoot],
    templateUrl: './app.component.html',
    styleUrl: './app.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
