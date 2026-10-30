import {computed, DestroyRef, inject, Injectable} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {PageObservation} from '@training-observer/core';
import {Subject} from 'rxjs';

import {
    type ProcedurePlayerBlockChange,
    ProcedurePlayerBlockTracker,
    readProcedurePlayers,
} from './procedure-player-block-tracker';

/** Проецирует каждый опубликованный кадр страницы в события блоков procedure-player. */
@Injectable()
export class ProcedurePlayerObserver {
    private readonly observation = inject(PageObservation);
    private readonly tracker = new ProcedurePlayerBlockTracker();
    private readonly changes = new Subject<ProcedurePlayerBlockChange>();

    public readonly areas = this.observation.areas;
    public readonly players = computed(() => readProcedurePlayers(this.areas()));
    public readonly blockChanges$ = this.changes.asObservable();

    constructor() {
        this.observation.updates$.pipe(takeUntilDestroyed()).subscribe((areas) => {
            for (const event of this.tracker.update(areas)) {
                this.changes.next(event);
            }
        });
        inject(DestroyRef).onDestroy(() => {
            this.tracker.clear();
            this.changes.complete();
        });
    }
}
