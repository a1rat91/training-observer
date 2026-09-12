import {ChangeDetectionStrategy, Component} from '@angular/core';
import {TuiDocMain} from '@taiga-ui/addon-doc';
import {TuiRoot} from '@taiga-ui/core';

/**
 * Корневая оболочка demo: предоставляет Taiga UI root и навигационную оболочку документации.
 * Алгоритм: шаблон монтирует TuiRoot и TuiDocMain; выбранные страницы отображаются внутри оболочки.
 * Собственного состояния, наблюдения DOM и бизнес-логики здесь нет.
 */
@Component({
    standalone: true,
    selector: 'my-app',
    imports: [TuiDocMain, TuiRoot],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
