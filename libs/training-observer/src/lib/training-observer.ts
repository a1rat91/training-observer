/** Angular-фасад одного сеанса наблюдения. Создаёт/останавливает browser session и публикует readonly signals.
 * DOM capture работает вне Angular zone; публикация состояния возвращается внутрь. DestroyRef завершает сеанс.
 */
import {DOCUMENT} from '@angular/common';
import {computed, DestroyRef, inject, Injectable, NgZone, signal} from '@angular/core';
import {
    type ControlSnapshot,
    type DomElementSnapshot,
    type DomSnapshot,
} from '@training-observer/core/models';

import {DomSnapshotBuilder} from './capture/dom-snapshot-builder';
import {ControlSnapshotBuilder} from './controls/control-snapshot-builder';
import {
    type DomObservationSession,
    type SessionSnapshot,
} from './observation/dom-observation-session';
import {
    ObservationSessionFactory,
    type ObservationSessionRef,
} from './observation/observation-session-factory';
import {snapshotFingerprint} from './observation/snapshot-fingerprint';
import {
    DOM_OBSERVATION_OPTIONS,
    type DomObservationOptions,
    validateObservationTiming,
} from './tokens/dom-observation-options';
import {type DomSnapshotOptions} from './tokens/dom-snapshot-options';

/** Один сеанс на экземпляр сервиса. Предоставляйте локально для жизненного цикла области. */
@Injectable()
export class TrainingObserver {
    private readonly builder = inject(DomSnapshotBuilder);
    private readonly controlBuilder = inject(ControlSnapshotBuilder);
    private readonly zone = inject(NgZone);
    private readonly current = signal<DomSnapshot | null>(null);
    private readonly document = inject(DOCUMENT);
    private readonly defaults = inject(DOM_OBSERVATION_OPTIONS);
    private readonly sessions = inject(ObservationSessionFactory);
    private readonly destroyRef = inject(DestroyRef);
    private readonly observing = signal(false);
    private readonly failure = signal<string | null>(null);
    private readonly scans = signal(0);
    private readonly publications = signal(0);
    private sessionRef: ObservationSessionRef | null = null;
    private fingerprint: string | null = null;
    private destroyed = false;
    private readonly confirmed = signal<Readonly<Record<string, ControlSnapshot>>>({});

    /** Последнее значение при выходе из логического поля. Сырые снимки обновляются независимо; отсутствие означает, что подтверждения нет. */
    public readonly confirmedControls = this.confirmed.asReadonly();
    public readonly snapshot = this.current.asReadonly();
    public readonly isObserving = this.observing.asReadonly();
    public readonly error = this.failure.asReadonly();
    public readonly scanCount = this.scans.asReadonly();
    public readonly revision = this.publications.asReadonly();
    public readonly controls = computed<readonly DomElementSnapshot[]>(() => {
        const snapshot = this.snapshot();

        return snapshot
            ? snapshot.interactiveIds
                  .map((id) => snapshot.nodes[id])
                  .filter((node): node is DomElementSnapshot => node?.kind === 'element')
            : [];
    });

    public readonly logicalControls = computed(() => {
        const snapshot = this.snapshot();

        return snapshot ? this.controlBuilder.build(snapshot) : [];
    });

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.destroyed = true;
            this.clear();
        });
    }

    /** Исходный синхронный снимок, затем объединённые обновления. Новый start заменяет старый сеанс. */
    public start(
        root: Element = this.document.body,
        overrides: Partial<DomObservationOptions> = {},
    ): DomSnapshot {
        this.assertAlive();

        const options = {...this.defaults, ...overrides};

        validateObservationTiming(options);

        // Проверяем и строим снимок до замены рабочего сеанса: неверные настройки не должны его остановить.
        const initial = this.zone.runOutsideAngular(() =>
            this.builder.build(root, options),
        );

        this.stop();
        this.confirmed.set({});
        this.failure.set(null);

        this.zone.runOutsideAngular(() => {
            const ref = this.sessions.create(root, options);

            this.sessionRef = ref;
            // Потоки синхронные; при уничтожении сеанса они завершаются вместе с подписками.
            ref.session.snapshots$.subscribe((result) => this.publish(result, true));
            ref.session.errors$.subscribe((error) => this.fail(error));

            try {
                const result = ref.session.start(initial);

                this.zone.run(() => this.observing.set(true));
                this.publish(result, false);
            } catch (error: unknown) {
                this.stop();
                throw error;
            }
        });

        return initial;
    }

    /** Оставить последний снимок, освободив observers/listeners и отменив ожидающую работу. */
    public stop(): void {
        this.sessionRef?.destroy();
        this.sessionRef = null;
        this.observing.set(false);
    }

    public capture(root?: Element, options?: Partial<DomSnapshotOptions>): DomSnapshot {
        this.assertAlive();
        const snapshot = this.zone.runOutsideAngular(() =>
            this.builder.build(root, options),
        );

        const result = this.session?.project(snapshot) ?? {
            snapshot,
            controls: this.controlBuilder.build(snapshot),
            confirmedControls: this.confirmed(),
        };

        this.publish(result, false);
        this.zone.runOutsideAngular(() => this.session?.resetPropertyBaseline());

        return snapshot;
    }

    /** Завершить текущий capture после обработчиков UI с сохранением правил обхода и скрытия значений. */
    public flush(): void {
        this.assertAlive();
        this.zone.runOutsideAngular(() => this.session?.flush());
    }

    public clear(): void {
        this.stop();
        this.fingerprint = null;
        this.failure.set(null);
        this.current.set(null);
        this.confirmed.set({});
    }

    private get session(): DomObservationSession | null {
        return this.sessionRef?.session ?? null;
    }

    private fail(error: unknown): void {
        this.zone.run(() => {
            this.stop();
            this.failure.set(error instanceof Error ? error.message : String(error));
        });
    }

    private publish(result: SessionSnapshot, onlyIfChanged: boolean): void {
        const {snapshot, confirmedControls} = result;
        const fingerprint = snapshotFingerprint(snapshot);

        this.zone.run(() => {
            this.scans.update((count) => count + 1);
            this.confirmed.set(confirmedControls);

            if (!onlyIfChanged || this.fingerprint !== fingerprint) {
                this.fingerprint = fingerprint;
                this.current.set(snapshot);
                this.publications.update((count) => count + 1);
            }
        });
    }

    private assertAlive(): void {
        if (this.destroyed) {
            throw new Error('TrainingObserver has been destroyed.');
        }
    }
}
