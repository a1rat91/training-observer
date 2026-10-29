import {JsonPipe} from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    DestroyRef,
    inject,
    signal,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiInputNumber, TuiRadio} from '@taiga-ui/kit';
import {provideRecordingSession, RecordingSession} from '@training-observer/angular';
import {provideProcedurePlayerAdapter} from '@training-observer/procedure-player/angular';
import {provideTaigaUiAdapter} from '@training-observer/taiga-ui/angular';

/** Browser fixture for the real procedure table DOM markers and independent recording. */
@Component({
    selector: 'app-procedure-player-controls',
    imports: [FormsModule, JsonPipe, TuiButton, TuiInputNumber, TuiRadio, TuiTextfield],
    templateUrl: './procedure-player-controls.component.html',
    styleUrl: './procedure-player-controls.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        provideTaigaUiAdapter(),
        provideProcedurePlayerAdapter(),
        provideRecordingSession(),
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProcedurePlayerControlsComponent {
    private readonly destroy = inject(DestroyRef);

    protected readonly session = inject(RecordingSession);
    protected readonly blockId = signal('table-A');
    protected readonly rows = [
        {id: 'ivan', name: 'Иван Иванов', role: 'Менеджер', disabled: false},
        {id: 'anna', name: 'Анна Смирнова', role: 'Разработчик', disabled: false},
        {id: 'oleg', name: 'Олег Петров', role: 'Архив', disabled: true},
    ];

    protected selected = 'ivan';
    protected nested = '';
    protected search = '';
    protected amount: number | null = 1250;
    protected page = 1;

    protected switchBlock(): void {
        this.blockId.update((id) => (id === 'table-A' ? 'table-B' : 'table-A'));
    }

    protected stop(): void {
        this.session.stop().pipe(takeUntilDestroyed(this.destroy)).subscribe();
    }
}
