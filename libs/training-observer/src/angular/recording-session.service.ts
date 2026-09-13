/**
 * RecordingSessionService — Angular-владелец одного сеанса записи без UI.
 * start подключает recorder к уже настроенному registry и публикует readonly signals журнала/статуса.
 * Изменения observe применяются внутри recorder без его перезапуска. resolve использует сохранённый
 * в документе key цели и текущую границу области; отсутствие key/root означает отказ, не глобальный поиск.
 * pause/resume отменяют черновики и сохраняют журнал; running означает открытый сеанс, paused — временный перерыв.
 * stop сохраняет журнал; DestroyRef освобождает ресурсы. Wire v3 сохраняет привязку target → area.
 */
import {DestroyRef, inject, Injectable, signal} from '@angular/core';
import {
    type ElementDescriptor,
    ElementRecorder,
    type Recording,
    type Resolution,
    TargetResolver,
    type ValuePolicy,
} from '@training-observer/core';

import {AreaRegistryService} from './area-registry.service';

@Injectable()
export class RecordingSessionService {
    private readonly areas = inject(AreaRegistryService);
    private recorder?: ElementRecorder;
    private root?: HTMLElement;
    private readonly report = signal<Recording | null>(null);
    private readonly active = signal(false);
    private readonly suspended = signal(false);

    public readonly recording = this.report.asReadonly();
    public readonly running = this.active.asReadonly();
    public readonly paused = this.suspended.asReadonly();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.recorder?.stop());
    }

    public start(root: HTMLElement, valuePolicy: ValuePolicy): void {
        this.recorder?.stop();
        this.root = root;
        this.recorder = new ElementRecorder(root, {
            valuePolicy,
            areas: this.areas.boundary(),
            onUpdate: () => this.refresh(),
        });
        this.recorder.start();
        this.refresh();
    }

    public pause(): void {
        this.recorder?.pause();
        this.refresh();
    }

    public resume(): void {
        this.recorder?.resume();
        this.refresh();
    }

    public stop(): void {
        this.recorder?.stop();
        this.refresh();
    }

    public resolve(descriptor: ElementDescriptor): Resolution {
        const recording = this.report();

        return recording && this.root
            ? new TargetResolver(recording, this.root, {}, this.areas.boundary()).resolve(
                  descriptor,
              ).report
            : {
                  kind: 'element-resolution',
                  version: 2,
                  targetId: descriptor.id,
                  candidates: [],
                  attempts: [],
                  status: 'broken',
                  reason: 'unsupported',
              };
    }

    private refresh(): void {
        this.report.set(this.recorder?.snapshot() ?? null);
        this.active.set(
            !!this.recorder && (this.recorder.running || this.recorder.paused),
        );
        this.suspended.set(this.recorder?.paused ?? false);
    }
}
