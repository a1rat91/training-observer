import {ChangeDetectionStrategy, Component, computed, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {interval} from 'rxjs';

@Component({
    selector: 'directory-mf',
    imports: [ReactiveFormsModule, TuiButton, TuiTextfield],
    template: `
        <h2>Сотрудники</h2>
        <tui-textfield>
            <label tuiLabel>Поиск</label>
            <input
                tuiTextfield
                [formControl]="query"
            />
        </tui-textfield>
        @for (name of matches(); track name) {
            <p>
                {{ name }}
                <button
                    size="s"
                    tuiButton
                    type="button"
                    (click)="selected.set(name)"
                >
                    Открыть карточку
                </button>
            </p>
        } @empty {
            <p>Сотрудники не найдены</p>
        }
        @if (selected()) {
            <p role="status">Карточка сотрудника: {{ selected() }}</p>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryComponent {
    public readonly query = new FormControl('', {nonNullable: true});
    public readonly search = signal('');
    public readonly selected = signal('');
    public readonly matches = computed(() =>
        ['Анна Смирнова', 'Борис Иванов'].filter((name) =>
            name.toLowerCase().includes(this.search()),
        ),
    );

    constructor() {
        this.query.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe((value) => this.search.set(value.toLowerCase()));
    }
}

@Component({
    selector: 'notifications-mf',
    imports: [TuiButton],
    template: `
        <h2>Уведомления</h2>
        <p>Фоновые обновления: {{ updates() }}</p>
        <p>Непрочитанных: {{ unread() }}</p>
        <button
            size="s"
            tuiButton
            type="button"
            (click)="unread.set(0)"
        >
            Прочитать все
        </button>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
    public readonly updates = signal(0);
    public readonly unread = signal(1);

    constructor() {
        interval(3000)
            .pipe(takeUntilDestroyed())
            .subscribe(() => {
                this.updates.update((value) => value + 1);
                this.unread.update((value) => value + 1);
            });
    }
}
