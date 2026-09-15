import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/** Контейнер демонстрирует корень внешнего микрофронта и выводит переданное содержимое. Связи с наблюдателем нет. */
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
