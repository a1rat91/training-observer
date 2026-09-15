/**
 * Demo-плеер загружает экраны из HTTP fixture, сохраняет ответы при навигации и отменяет устаревший запрос.
 * ID секции — обычная идентичность экрана приложения. Никаких импортов библиотеки обучения или учебных правил.
 */
import {HttpClient} from '@angular/common/http';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import {TuiButton} from '@taiga-ui/core';
import {type Subscription} from 'rxjs';

import {
    type FieldValue,
    type ProcedureField,
    ProcedureFieldComponent,
} from './procedure-field.component';

interface ProcedureScreen {
    readonly id: string;
    readonly title: string;
    readonly sections: ReadonlyArray<{
        readonly title: string;
        readonly fields: readonly ProcedureField[];
    }>;
}

@Component({
    selector: 'app-procedure-form',
    imports: [ProcedureFieldComponent, TuiButton],
    templateUrl: './procedure-form.component.html',
    styleUrl: './procedure-form.component.less',
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
        this.request = this.http
            .get<readonly ProcedureScreen[]>('/assets/procedure/screens.json')
            .subscribe({
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
