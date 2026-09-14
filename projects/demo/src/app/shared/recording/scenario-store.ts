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
    private readonly sourceKey = 'training-observer.scenario-source.v1';
    readonly savedSource = signal('');
    readonly saved = signal<TrainingScenario | null>(null);
    readonly error = signal('');
    load(): void {
        this.savedSource.set('');
        try {
            const json = this.window?.localStorage.getItem(this.key);
            this.saved.set(json ? parseScenario(json) : null);
            this.error.set('');
            // Optional provenance never prevents a valid published scenario from running.
            try {
                const source = JSON.parse(this.window?.localStorage.getItem(this.sourceKey) || 'null');
                if (source?.scenario === json && typeof source?.recording === 'string') this.savedSource.set(source.recording);
            } catch { /* Older publications have no verified source. Recompile before editing. */ }
        }
        catch { this.saved.set(null); this.error.set('Сохранённый сценарий повреждён. Опубликуйте его заново в админке.'); }
    }
    save(scenario: TrainingScenario, recording: string): void {
        try {
            const parsed = parseScenario(JSON.stringify(scenario));
            const json = JSON.stringify(parsed);
            // Write the linked pair first: a failed scenario write leaves unmatched provenance,
            // which load ignores instead of associating an old publication with a new journal.
            this.window!.localStorage.setItem(this.sourceKey, JSON.stringify({scenario: json, recording}));
            this.window!.localStorage.setItem(this.key, json);
            this.savedSource.set(recording);
            this.saved.set(parsed); this.error.set('');
        } catch { this.error.set('Не удалось сохранить сценарий.'); }
    }
}
