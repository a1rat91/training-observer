/**
 * RecordingSessionService — Angular-владелец одного сеанса записи без UI.
 * start подключает recorder к уже настроенному registry и публикует readonly signals журнала/статуса.
 * Изменения observe применяются внутри recorder без его перезапуска. resolve использует сохранённый
 * в памяти key цели и текущую границу области; отсутствие key/root означает отказ, не глобальный поиск.
 * stop сохраняет журнал; DestroyRef освобождает ресурсы. Wire v2 пока не сохраняет привязку target → area.
 */
import {DestroyRef, inject, Injectable, signal} from '@angular/core';
import {
    type ElementDescriptor,
    ElementRecorder,
    ElementResolver,
    type Recording,
    type Resolution,
    type ValuePolicy,
} from '@training-observer/core';

import {AreaRegistryService} from './area-registry.service';

@Injectable()
export class RecordingSessionService {
    private readonly areas = inject(AreaRegistryService);
    private recorder?: ElementRecorder;
    private readonly report = signal<Recording | null>(null);
    private readonly active = signal(false);

    public readonly recording = this.report.asReadonly();
    public readonly running = this.active.asReadonly();

    constructor() {
        inject(DestroyRef).onDestroy(() => this.recorder?.stop());
    }

    public start(root: HTMLElement, valuePolicy: ValuePolicy): void {
        this.recorder?.stop();
        this.recorder = new ElementRecorder(root, {
            valuePolicy,
            areas: this.areas.boundary(),
            onUpdate: () => this.refresh(),
        });
        this.recorder.start();
        this.refresh();
    }

    public stop(): void {
        this.recorder?.stop();
        this.refresh();
    }

    public resolve(descriptor: ElementDescriptor): Resolution {
        const key = this.recorder?.areaForTarget(descriptor.id);
        const areas = this.areas.boundary();
        const root = key ? areas.root(key) : null;

        return !key || !root || !areas.accepts(key, root)
            ? {
                  kind: 'element-resolution',
                  version: 2,
                  targetId: descriptor.id,
                  candidates: [],
                  attempts: [],
                  status: 'broken',
                  reason: 'unsupported',
              }
            : new ElementResolver({
                  accepts: (element) => areas.accepts(key, element),
              }).resolve(descriptor, root).report;
    }

    private refresh(): void {
        this.report.set(this.recorder?.snapshot() ?? null);
        this.active.set(this.recorder?.running ?? false);
    }
}
