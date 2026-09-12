import {
    ChangeDetectionStrategy,
    Component,
    type ElementRef,
    input,
    signal,
    viewChild,
} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';

import ProcedurePageComponent from '../procedure/procedure-page.component';
import {DirectoryComponent, NotificationsComponent} from './neighbors.component';
import {
    type ProcedureDefinition,
    ProcedureSearchComponent,
} from './procedure-search.component';

@Component({
    selector: 'microfrontend',
    template: '<ng-content />',
    styles: ':host {display: block; padding: 1rem; border: 1px solid var(--tui-border-normal); border-radius: 1rem; margin-block: 1rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MicrofrontendComponent {}

@Component({
    selector: 'procedure-mf',
    imports: [ProcedurePageComponent],
    template:
        '<procedure-page [autoStart]="true" [initialProfile]="definition().profile" />',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureMicrofrontendComponent {
    public readonly definition = input.required<ProcedureDefinition>();
}

@Component({
    selector: 'procedure-shell',
    imports: [
        DirectoryComponent,
        MicrofrontendComponent,
        NotificationsComponent,
        ProcedureMicrofrontendComponent,
        ProcedureSearchComponent,
        TuiButton,
    ],
    template: `
        <details>
            <summary>Эксперименты с микрофронтами</summary>
            <p>
                Эмуляция DOM и lifecycle в одном Angular-приложении. Настройки находятся
                вне наблюдаемой области.
            </p>
            <button
                size="s"
                tuiButton
                type="button"
                (click)="reverse.set(!reverse())"
            >
                Переставить соседей
            </button>
            <button
                size="s"
                tuiButton
                type="button"
                [disabled]="!selection()"
                (click)="mounted.set(!mounted())"
            >
                {{ mounted() ? 'Скрыть плеер' : 'Показать плеер' }}
            </button>
            <button
                size="s"
                tuiButton
                type="button"
                [disabled]="!selection()"
                (click)="generation.update(increment)"
            >
                Пересоздать плеер
            </button>
            <button
                size="s"
                tuiButton
                type="button"
                (click)="duplicate.set(!duplicate())"
            >
                {{
                    duplicate()
                        ? 'Убрать второй справочник'
                        : 'Добавить второй справочник'
                }}
            </button>
        </details>
        <div #surface>
            <microfrontend>
                <procedure-search-mf (selected)="choose($event)" />
            </microfrontend>
            @if (selection(); as procedure) {
                @if (mounted()) {
                    @for (version of [generation()]; track version) {
                        <microfrontend>
                            <procedure-mf [definition]="procedure" />
                        </microfrontend>
                    }
                }
            }
            @for (
                area of reverse()
                    ? ['notifications', 'directory']
                    : ['directory', 'notifications'];
                track area
            ) {
                <microfrontend>
                    @if (area === 'directory') {
                        <directory-mf />
                    } @else {
                        <notifications-mf />
                    }
                </microfrontend>
            }
            @if (duplicate()) {
                <microfrontend><directory-mf /></microfrontend>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureShellComponent {
    public readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
    public readonly selection = signal<ProcedureDefinition | null>(null);
    public readonly generation = signal(0);
    public readonly mounted = signal(true);
    public readonly duplicate = signal(false);
    public readonly reverse = signal(false);
    public readonly increment = (value: number): number => value + 1;

    public choose(procedure: ProcedureDefinition | null): void {
        this.selection.set(procedure);
        this.generation.update(this.increment);
        this.mounted.set(true);
    }
}
