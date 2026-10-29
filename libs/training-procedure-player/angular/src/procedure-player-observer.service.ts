import {
    afterNextRender,
    computed,
    DestroyRef,
    effect,
    type EnvironmentInjector,
    inject,
    Injectable,
    Injector,
} from '@angular/core';
import {
    DOM_OBSERVATION_OPTIONS,
    MicrofrontendObserver,
    provideDomObservation,
} from '@training-observer/core';
import {
    type ProcedurePlayerBlockChange,
    ProcedurePlayerBlockTracker,
    procedurePlayerScreenAdapter,
    readProcedurePlayers,
} from '@training-observer/procedure-player';
import {Subject} from 'rxjs';

/** Независимое наблюдение всех procedure-player; запись и её start/stop не требуются. */
@Injectable()
export class ProcedurePlayerObserver {
    private readonly child = Injector.create({
        providers: provideDomObservation(),
        parent: inject(Injector),
    }) as Injector & Pick<EnvironmentInjector, 'destroy'>;

    private readonly observer = this.child.get(MicrofrontendObserver);
    private readonly tracker = new ProcedurePlayerBlockTracker();
    private readonly changes = new Subject<ProcedurePlayerBlockChange>();
    private readonly boundaries =
        inject(DOM_OBSERVATION_OPTIONS).boundarySelector ?? 'microfrontend > *';

    public readonly areas = this.observer.areas;
    public readonly players = computed(() => readProcedurePlayers(this.areas()));
    public readonly blockChanges$ = this.changes.asObservable();

    constructor() {
        effect(() => {
            for (const event of this.tracker.update(this.players())) {
                this.changes.next(event);
            }
        });
        afterNextRender(() =>
            this.observer.observe([
                procedurePlayerScreenAdapter.rootSelector,
                this.boundaries,
            ]),
        );
        inject(DestroyRef).onDestroy(() => {
            this.child.destroy();
            this.tracker.clear();
            this.changes.complete();
        });
    }
}
