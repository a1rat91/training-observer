/** Создаёт изолированный Angular injector на один start/stop.
 * Внутри живут браузерный сеанс и подтверждения blur. Уничтожение владельца освобождает оставшиеся сеансы.
 * На отдельные DOM-снимки injector не создаётся.
 */
import {DOCUMENT} from '@angular/common';
import {
    createEnvironmentInjector,
    DestroyRef,
    EnvironmentInjector,
    inject,
    Injectable,
} from '@angular/core';

import {DomElementAnalyzer} from '../capture/dom-element-analyzer';
import {DomSnapshotBuilder} from '../capture/dom-snapshot-builder';
import {ControlSnapshotBuilder} from '../controls/control-snapshot-builder';
import {type DomObservationOptions} from '../tokens/dom-observation-options';
import {BlurConfirmation} from './blur-confirmation';
import {DomObservationSession} from './dom-observation-session';
import {SESSION_CONTEXT, SessionSourceMode} from './session-context';

export interface ObservationSessionRef {
    readonly session: DomObservationSession;
    destroy(): void;
}

@Injectable()
export class ObservationSessionFactory {
    private readonly parent = inject(EnvironmentInjector);
    // Сохраняем overrides владельца из ElementInjector при переходе в дочерний EnvironmentInjector.
    private readonly dependencies = [
        {provide: DOCUMENT, useValue: inject(DOCUMENT)},
        {provide: DomSnapshotBuilder, useValue: inject(DomSnapshotBuilder)},
        {provide: DomElementAnalyzer, useValue: inject(DomElementAnalyzer)},
        {provide: ControlSnapshotBuilder, useValue: inject(ControlSnapshotBuilder)},
    ];

    private readonly sessions = new Set<ObservationSessionRef>();
    private destroyed = false;

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.destroyed = true;

            for (const session of this.sessions) {
                session.destroy();
            }
        });
    }

    public create(
        root: Element,
        options: DomObservationOptions,
        mode = SessionSourceMode.Standalone,
    ): ObservationSessionRef {
        if (this.destroyed) {
            throw new Error('Observation session owner has been destroyed.');
        }

        const injector = createEnvironmentInjector(
            [
                ...this.dependencies,
                {provide: SESSION_CONTEXT, useValue: {root, options, mode}},
                BlurConfirmation,
                DomObservationSession,
            ],
            this.parent,
        );

        try {
            const ref: ObservationSessionRef = {
                session: injector.get(DomObservationSession),
                destroy: () => {
                    if (this.sessions.delete(ref)) {
                        injector.destroy();
                    }
                },
            };

            this.sessions.add(ref);

            return ref;
        } catch (error) {
            injector.destroy();
            throw error;
        }
    }
}
