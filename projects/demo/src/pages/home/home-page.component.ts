import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {TuiButton} from '@taiga-ui/core';

@Component({
    selector: 'home-page',
    imports: [RouterLink, TuiButton],
    templateUrl: './home-page.component.html',
    styleUrl: './home-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomePageComponent {}
