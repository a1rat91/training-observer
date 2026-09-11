import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
    standalone: true,
    selector: 'simple-example-doc-page',
    imports: [],
    templateUrl: '../simple-example.component.html',
    styleUrl: '../simple-example.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GettingStartedDocComponent {}
