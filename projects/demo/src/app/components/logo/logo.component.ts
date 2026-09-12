import {ChangeDetectionStrategy, Component} from '@angular/core';

/**
 * Пустой компонент логотипа оболочки demo.
 * Алгоритм: отображает пустой шаблон; данных, обработчиков и побочных эффектов нет.
 */
@Component({
    standalone: true,
    selector: 'logo',
    imports: [],
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {}
