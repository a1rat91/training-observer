/** Хранение опубликованного сценария demo. Проверяет документ при сохранении и загрузке; runtime не получает непроверенный JSON. Черновик редактора отделён от публикации. */
import {DOCUMENT} from '@angular/common';
import {inject, Injectable, signal} from '@angular/core';
import {parseScenario, type TrainingScenario} from '@training-observer/contracts';

@Injectable({providedIn: 'root'})
export class ScenarioStore {
    private readonly window = inject(DOCUMENT).defaultView;
    private readonly key = 'training-observer.scenario.v1';
    private readonly sourceKey = 'training-observer.scenario-source.v1';
    private readonly savedSourceState = signal('');
    private readonly savedState = signal<TrainingScenario | null>(null);
    private readonly errorState = signal('');

    public readonly savedSource = this.savedSourceState.asReadonly();
    public readonly saved = this.savedState.asReadonly();
    public readonly error = this.errorState.asReadonly();

    public load(): void {
        this.savedSourceState.set('');

        try {
            const json = this.window?.localStorage.getItem(this.key);

            this.savedState.set(json ? parseScenario(json) : null);
            this.errorState.set('');

            // Отсутствие метаданных источника не мешает запуску валидного опубликованного сценария.
            try {
                const source = JSON.parse(
                    this.window?.localStorage.getItem(this.sourceKey) || 'null',
                );

                if (source?.scenario === json && typeof source?.recording === 'string') {
                    this.savedSourceState.set(source.recording);
                }
            } catch {
                /** У старых публикаций нет проверенной связи с записью. Перед редактированием требуется пересборка. */
            }
        } catch {
            this.savedState.set(null);
            this.errorState.set(
                'Сохранённый сценарий повреждён. Опубликуйте его заново в админке.',
            );
        }
    }

    public save(scenario: TrainingScenario, recording: string): void {
        try {
            const parsed = parseScenario(JSON.stringify(scenario));
            const json = JSON.stringify(parsed);

            // Сначала сохраняется связанная пара: при сбое записи сценария метаданные не совпадут,
            // и загрузка проигнорирует их вместо ошибочной связи старой публикации с новым журналом.
            this.window!.localStorage.setItem(
                this.sourceKey,
                JSON.stringify({scenario: json, recording}),
            );
            this.window!.localStorage.setItem(this.key, json);
            this.savedSourceState.set(recording);
            this.savedState.set(parsed);
            this.errorState.set('');
        } catch {
            this.errorState.set('Не удалось сохранить сценарий.');
        }
    }
}
