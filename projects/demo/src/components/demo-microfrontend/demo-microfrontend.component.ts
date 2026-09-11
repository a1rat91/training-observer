import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/** Demo stand-in for a foreign microfrontend root. No observer integration is required. */
@Component({
    standalone: true,
    selector: 'demo-microfrontend',
    template: '<ng-content />',
    styles: ':host { display: block; }',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {'[attr.data-mf]': 'name()'},
})
export class DemoMicrofrontendComponent {
    public readonly name = input('');
}
