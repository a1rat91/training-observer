import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/**
 * Ранняя демонстрационная обёртка для проецируемого содержимого микрофронта.
 * Алгоритм: принимает name, отображает ng-content и отражает имя в существующем data-mf.
 * Не реализует lifecycle отдельного приложения; этот атрибут не является контрактом нового AreaRegistry.
 */
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
