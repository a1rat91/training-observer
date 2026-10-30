import {afterNextRender, inject, Injectable, signal} from '@angular/core';

import {MicrofrontendObserver} from './microfrontend-observer';
import {DOM_OBSERVATION_OPTIONS} from './tokens/dom-observation-options';

/** Наблюдение страницы в DI-области владельца, независимо от записи и обучения. */
@Injectable()
export class PageObservation {
    private readonly observer = inject(MicrofrontendObserver);
    private readonly options = inject(DOM_OBSERVATION_OPTIONS);
    private readonly failure = signal<string | null>(null);

    public readonly areas = this.observer.areas;
    public readonly updates$ = this.observer.updates$;
    public readonly isObserving = this.observer.isObserving;
    public readonly error = this.failure.asReadonly();

    constructor() {
        afterNextRender(() => {
            try {
                this.observer.start(undefined, this.options);
            } catch (error: unknown) {
                this.failure.set(error instanceof Error ? error.message : String(error));
            }
        });
    }

    public refresh(id?: string): void {
        this.observer.refresh(id);
    }
}
