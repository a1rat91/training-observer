/** Хранилище demo загружает проверенную запись и сохраняет её явным действием Stop. Ошибки видимы, JSON из памяти можно скопировать. Angular-состояние формы не читается. */
import {DOCUMENT} from '@angular/common';
import {inject, Injectable, signal} from '@angular/core';
import {parseStateRecording, type StateRecording} from '@training-observer/contracts';

@Injectable({providedIn: 'root'})
export class RecordingStore {
    private readonly document = inject(DOCUMENT);
    private readonly key = 'training-observer.state-recording.v1';
    private readonly savedState = signal<StateRecording | null>(null);
    private readonly errorState = signal('');

    public readonly saved = this.savedState.asReadonly();
    public readonly error = this.errorState.asReadonly();

    public load(): void {
        try {
            const json = this.document.defaultView?.localStorage.getItem(this.key);

            this.savedState.set(json ? parseStateRecording(json) : null);
            this.errorState.set('');
        } catch {
            this.savedState.set(null);
            this.errorState.set(
                'Не удалось прочитать сохранённую запись. Можно создать новую.',
            );
        }
    }

    public save(recording: StateRecording): void {
        this.savedState.set(recording);

        try {
            const json = JSON.stringify(recording);

            parseStateRecording(json);
            this.document.defaultView!.localStorage.setItem(this.key, json);
            this.errorState.set('');
        } catch {
            this.errorState.set(
                'Не удалось сохранить запись в браузере. Скопируйте JSON ниже.',
            );
        }
    }
}
