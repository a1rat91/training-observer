/**
 * Demo-плеер загружает экраны из HTTP fixture, сохраняет ответы при навигации и отменяет устаревший запрос.
 * ID секции — обычная идентичность экрана приложения. Никаких импортов библиотеки обучения или учебных правил.
 */
import {HttpClient} from '@angular/common/http';
import {afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, inject, signal} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {type Subscription} from 'rxjs';

import {type FieldValue, type ProcedureField, ProcedureFieldComponent} from './procedure-field.component';

interface ProcedureScreen {
    readonly id: string;
    readonly title: string;
    readonly sections: readonly {readonly title: string; readonly fields: readonly ProcedureField[]}[];
}

@Component({
    selector: 'app-procedure-form',
    imports: [ProcedureFieldComponent, TuiButton],
    template: `
        <section aria-label="Экран процедуры" [attr.id]="screen()?.id ?? null" [attr.aria-busy]="loading()">
            <h2>{{ screen()?.title ?? 'Открываем заявку' }}</h2>
            @if (loading()) { <p role="status">Загрузка экрана…</p> }
            @if (error()) {
                <p role="alert">{{ error() }}</p>
                <button tuiButton size="s" type="button" (click)="retry()">Повторить загрузку</button>
            }
            @if (screen(); as current) {
                @if (current.id === 'application-other') {
                    <p>Открыта другая ветка. Вернитесь назад, чтобы продолжить заполнение.</p>
                }
                @if (current.id === 'application-done') { <p>Все экраны пройдены. Можно вернуться к ответам.</p> }
                @for (generation of [current.id]; track generation) {
                    @for (section of current.sections; track section.title) {
                        <fieldset [disabled]="loading()"><legend>{{ section.title }}</legend>
                            <div class="fields">
                                @for (field of section.fields; track field.id) {
                                    <app-procedure-field [field]="field" [value]="values()[field.id] ?? null"
                                        (changed)="setValue(field.id, $event)" />
                                }
                            </div>
                        </fieldset>
                    }
                }
            }
            <footer>
                <button tuiButton size="s" type="button" [disabled]="loading() || !screen() || !!error() || index() >= 3" (click)="load(index() + 1)">Далее</button>
                <button tuiButton size="s" appearance="secondary" type="button" [disabled]="loading() || index() === 0"
                    (click)="load(index() === 4 ? returnIndex : index() - 1)">Назад</button>
                <button tuiButton size="s" appearance="secondary" type="button" [disabled]="loading() || !screen() || !!error() || index() === 4"
                    (click)="wrong()">Неправильный переход</button>
            </footer>
        </section>
    `,
    styles: 'fieldset {margin:1.25rem 0; padding:1rem; border:1px solid var(--tui-border-normal); border-radius:.75rem;} legend {font-weight:600;} .fields {display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem;} footer {display:flex; flex-wrap:wrap; gap:.75rem; margin-top:1.5rem;} @media(max-width:700px) {.fields {grid-template-columns:1fr;}}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureFormComponent {
    private readonly http = inject(HttpClient);
    private request?: Subscription;
    private requestedIndex = 0;
    protected readonly screen = signal<ProcedureScreen | null>(null);
    protected readonly values = signal<Record<string, FieldValue>>({});
    protected readonly loading = signal(true);
    protected readonly error = signal('');
    protected readonly index = signal(0);
    protected returnIndex = 0;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
        afterNextRender(() => this.load(0));
    }

    protected setValue(id: string, value: FieldValue): void {
        this.values.update((values) => ({...values, [id]: value}));
    }

    protected wrong(): void {
        this.returnIndex = this.index();
        this.load(4);
    }

    protected retry(): void {
        this.load(this.requestedIndex);
    }

    protected load(index: number): void {
        this.request?.unsubscribe();
        this.requestedIndex = index;
        this.loading.set(true);
        this.error.set('');
        this.request = this.http.get<readonly ProcedureScreen[]>('/assets/procedure/screens.json').subscribe({
            next: (screens) => {
                if (!screens[index]) {
                    this.error.set('Экран не найден.');
                    this.loading.set(false);
                    return;
                }
                this.screen.set(screens[index]);
                this.index.set(index);
                this.loading.set(false);
            },
            error: () => {
                this.error.set('Не удалось загрузить экран. Попробуйте ещё раз.');
                this.loading.set(false);
            },
        });
    }
}
