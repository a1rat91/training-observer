/** Страница контролов владеет диагностическими примерами. Смена примера уничтожает наблюдатель; это варианты одной страницы, не отдельные маршруты приложения. */
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, RouterLink} from '@angular/router';

import ControlsExampleComponent from '../../../pages/examples/controls-example/controls-example.component';
import {LoadComponent} from '../../fixtures/load/load.component';
import {MicrofrontendsComponent} from '../../fixtures/microfrontends/microfrontends.component';
import {ControlsComponent} from './controls.component';

@Component({
    selector: 'app-controls-page',
    imports: [
        ControlsComponent,
        ControlsExampleComponent,
        LoadComponent,
        MicrofrontendsComponent,
        RouterLink,
    ],
    templateUrl: './controls-page.component.html',
    styleUrl: './controls-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsPageComponent {
    protected readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
}
