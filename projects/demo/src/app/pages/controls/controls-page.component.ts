/** Controls page owns optional diagnostic fixtures. Changing a fixture destroys its observer;
 * these are test cases within the controls page, not separate application routes.
 */
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {ControlsComponent} from './controls.component';
import {LoadComponent} from '../../fixtures/load/load.component';
import {MicrofrontendsComponent} from '../../fixtures/microfrontends/microfrontends.component';

@Component({
    selector: 'app-controls-page',
    imports: [RouterLink, ControlsComponent, LoadComponent, MicrofrontendsComponent],
    template: `
        <details data-training-observer-ignore><summary>Дополнительные проверки контролов</summary>
            <a routerLink="/controls">Обычные контролы</a> ·
            <a routerLink="/controls" [queryParams]="{fixture: 'microfrontends'}">Несколько областей</a> ·
            <a routerLink="/controls" [queryParams]="{fixture: 'load'}">Нагрузка</a>
        </details>
        @switch (params()?.get('fixture')) {
            @case ('microfrontends') { <app-microfrontends /> }
            @case ('load') { <app-load /> }
            @default { <app-controls /> }
        }
    `,
    styles: 'details {padding:1rem 2rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsPageComponent {
    protected readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
}
