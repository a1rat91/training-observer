import {NgTemplateOutlet} from '@angular/common';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    input,
    type OnInit,
    signal,
} from '@angular/core';
import {
    FormControl,
    FormRecord,
    FormsModule,
    ReactiveFormsModule,
    type ValidatorFn,
    Validators,
} from '@angular/forms';
import {TuiDay} from '@taiga-ui/cdk';
import {TuiButton, TuiTextfield} from '@taiga-ui/core';
import {TuiDataListWrapper, TuiSelect} from '@taiga-ui/kit';
import {type Subscription, timeout} from 'rxjs';

import {environment} from '../../environments/environment';
import {
    type ProcedureAction,
    type ProcedureField,
    type ProcedureResponse,
    type WireValue,
} from './procedure-contract';
import {type FieldValue, ProcedureFieldComponent} from './procedure-field.component';

const API = environment.procedureApiUrl;

@Component({
    standalone: true,
    selector: 'procedure-page',
    imports: [
        FormsModule,
        NgTemplateOutlet,
        ProcedureFieldComponent,
        ReactiveFormsModule,
        TuiButton,
        TuiDataListWrapper,
        TuiSelect,
        TuiTextfield,
    ],
    templateUrl: './procedure-page.component.html',
    styleUrl: './procedure-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProcedurePageComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly destroyRef = inject(DestroyRef);
    private request?: Subscription;
    private generation = 0;
    private retryAttempt?: {url: string; body: ProcedureAction | {profile: string}};

    public readonly autoStart = input(false);
    public readonly initialProfile = input('Обычный ответ');
    public readonly session = signal<ProcedureResponse | null>(null);
    public readonly pending = signal(false);
    public readonly error = signal('');
    public readonly canRetry = signal(false);
    public readonly fieldErrors = signal<Record<string, string>>({});
    public readonly epoch = signal(0);
    public readonly form = new FormRecord<FormControl<FieldValue>>({});
    public readonly layouts = ['Обычное расположение', 'Другое расположение'];
    public readonly profiles = [
        'Обычный ответ',
        'Медленный ответ',
        'Сбой перед сохранением',
        'Потеря ответа после сохранения',
    ];

    public layout = this.layouts[0]!;
    public profile = this.profiles[0]!;
    public activeLayout = this.layout;

    constructor() {
        this.destroyRef.onDestroy(() => this.cancel());
    }

    public ngOnInit(): void {
        if (this.autoStart()) {
            this.profile = this.initialProfile();
            this.start();
        }
    }

    public start(): void {
        this.cancel();
        this.session.set(null);
        this.activeLayout = this.layout;
        this.epoch.update((value) => value + 1);
        const profile = ['normal', 'slow', 'fail-once', 'lost-response'][
            this.profiles.indexOf(this.profile)
        ]!;

        this.send(API, {profile});
    }

    public reset(): void {
        this.cancel();
        this.session.set(null);
        this.error.set('');
        this.fieldErrors.set({});
        this.canRetry.set(false);
        this.retryAttempt = undefined;
    }

    public advance(action: 'back' | 'next'): void {
        const session = this.session();

        if (!session || this.pending()) {
            return;
        }

        this.fieldErrors.set({});
        this.error.set('');
        this.canRetry.set(false);

        if (action === 'next' && this.form.invalid) {
            this.form.markAllAsTouched();
            this.fieldErrors.set(
                Object.fromEntries(
                    this.fields()
                        .filter((field) => this.control(field.key).invalid)
                        .map((field) => [field.key, this.validationMessage(field)]),
                ),
            );

            return;
        }

        const values = Object.fromEntries(
            this.fields().map((field) => [
                field.key,
                this.toWire(field, this.control(field.key).value),
            ]),
        );

        this.send(`${API}/${session.procedureId}/actions`, {
            requestId: Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
                value.toString(16).padStart(8, '0'),
            ).join(''),
            expectedRevision: session.revision,
            action,
            values,
        });
    }

    public retry(): void {
        if (this.retryAttempt && !this.pending()) {
            this.send(this.retryAttempt.url, this.retryAttempt.body);
        }
    }

    public control(key: string): FormControl<FieldValue> {
        return this.form.controls[key]!;
    }

    private cancel(): void {
        this.generation++;
        this.request?.unsubscribe();
        this.pending.set(false);
    }

    private fields(): readonly ProcedureField[] {
        return (
            this.session()?.screen?.sections.flatMap((section) => section.fields) ?? []
        );
    }

    private send(url: string, body: ProcedureAction | {profile: string}): void {
        this.cancel();
        const generation = this.generation;

        this.retryAttempt = {url, body};
        this.pending.set(true);
        this.canRetry.set(false);
        this.error.set('');
        this.form.disable({emitEvent: false});
        this.request = this.http
            .post<ProcedureResponse>(url, body)
            .pipe(timeout(6000))
            .subscribe({
                next: (response) => {
                    if (generation !== this.generation) {
                        return;
                    }

                    this.pending.set(false);
                    this.apply(response);
                    this.retryAttempt = undefined;
                },
                error: (error: unknown) => {
                    if (generation !== this.generation) {
                        return;
                    }

                    this.pending.set(false);
                    this.enableEditable();

                    if (error instanceof HttpErrorResponse && error.status === 422) {
                        const errors = error.error?.error?.fieldErrors as
                            Array<{key: string; message: string}> | undefined;

                        this.fieldErrors.set(
                            Object.fromEntries(
                                (errors ?? []).map((item) => [item.key, item.message]),
                            ),
                        );
                        this.error.set('Проверьте данные: сервер отклонил отправку.');
                        this.retryAttempt = undefined;
                    } else {
                        const conflict =
                            error instanceof HttpErrorResponse && error.status === 409;

                        this.error.set(
                            conflict
                                ? 'Состояние процедуры изменилось. Начните новую процедуру.'
                                : 'Не удалось получить следующий шаг. Повторите запрос.',
                        );
                        this.canRetry.set(!conflict);
                    }
                },
            });
    }

    private apply(response: ProcedureResponse): void {
        const fields =
            response.screen?.sections.flatMap((section) => section.fields) ?? [];

        if (response.render === 'replace') {
            this.epoch.update((value) => value + 1);

            for (const key of Object.keys(this.form.controls)) {
                this.form.removeControl(key, {emitEvent: false});
            }
        }

        for (const key of Object.keys(this.form.controls)) {
            if (!fields.some((field) => field.key === key)) {
                this.form.removeControl(key, {emitEvent: false});
            }
        }

        for (const field of fields) {
            let control = this.form.controls[field.key];
            const validators: ValidatorFn[] = [];

            if (field.required) {
                validators.push(
                    field.kind === 'checkbox'
                        ? Validators.requiredTrue
                        : Validators.required,
                );
            }

            if (field.kind === 'email') {
                validators.push(Validators.email);
            }

            if (field.min !== undefined) {
                validators.push(Validators.min(field.min));
            }

            if (field.required && ['email', 'text', 'textarea'].includes(field.kind)) {
                validators.push((value) =>
                    typeof value.value === 'string' && !value.value.trim()
                        ? {blank: true}
                        : null,
                );
            }

            if (field.kind === 'date') {
                validators.push((value) =>
                    value.value === null || value.value instanceof TuiDay
                        ? null
                        : {date: true},
                );
            }

            if (!control) {
                control = new FormControl<FieldValue>(null, validators);
                this.form.addControl(field.key, control, {emitEvent: false});
            }

            const wire = response.values[field.key] ?? field.default ?? null;
            let value: FieldValue = wire;

            if (field.kind === 'select') {
                value =
                    field.options?.find((option) => option.value === wire)?.label ?? null;
            } else if (field.kind === 'date' && typeof wire === 'string') {
                value = TuiDay.fromLocalNativeDate(new Date(`${wire}T12:00:00`));
            }

            control.setValue(value, {emitEvent: false});
        }

        this.session.set(response);
        this.fieldErrors.set({});
        this.enableEditable();
    }

    private enableEditable(): void {
        for (const field of this.fields()) {
            const control = this.control(field.key);

            if (field.readonly) {
                control.disable({emitEvent: false});
            } else {
                control.enable({emitEvent: false});
            }
        }
    }

    private toWire(field: ProcedureField, value: FieldValue): WireValue {
        if (value instanceof TuiDay) {
            return `${value.year}-${String(value.month + 1).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
        }

        return field.kind === 'select'
            ? (field.options?.find((option) => option.label === value)?.value ?? null)
            : value;
    }

    private validationMessage(field: ProcedureField): string {
        if (this.control(field.key).hasError('email')) {
            return 'Укажите корректную почту';
        }

        return this.control(field.key).hasError('min')
            ? `Минимальное значение: ${field.min}`
            : 'Заполните обязательное поле';
    }
}
