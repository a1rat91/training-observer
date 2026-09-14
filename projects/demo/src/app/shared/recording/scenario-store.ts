/** Demo storage for a published scenario. Validation runs on save and reload; runtime never consumes
 * an unchecked localStorage document. The editor draft stays separate until Publish is pressed.
 */
import {DOCUMENT} from '@angular/common';
import {inject, Injectable, signal} from '@angular/core';
import {parseScenario, type TrainingScenario} from '@training-observer/core';
@Injectable({providedIn: 'root'})
export class ScenarioStore {
    private readonly window = inject(DOCUMENT).defaultView;
    private readonly key = 'training-observer.scenario.v1';
    readonly saved = signal<TrainingScenario | null>(null);
    readonly error = signal('');
    load(): void {
        try { const json = this.window?.localStorage.getItem(this.key); this.saved.set(json ? parseScenario(json) : null); this.error.set(''); }
        catch { this.saved.set(null); this.error.set('Сохранённый сценарий повреждён. Опубликуйте его заново в админке.'); }
    }
    save(scenario: TrainingScenario): void {
        try {
            const parsed = parseScenario(JSON.stringify(scenario));
            this.window!.localStorage.setItem(this.key, JSON.stringify(parsed));
            this.saved.set(parsed); this.error.set('');
        } catch { this.error.set('Не удалось сохранить сценарий.'); }
    }
}
