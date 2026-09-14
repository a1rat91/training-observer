/** Demo persistence: loads a validated finished recording and writes it explicitly on Stop.
 * Storage failures stay visible; UI can still copy the in-memory JSON. No Angular form data is read.
 */
import {DOCUMENT} from '@angular/common';
import {inject, Injectable, signal} from '@angular/core';
import {parseStateRecording, type StateRecording} from '@training-observer/core';

@Injectable({providedIn: 'root'})
export class RecordingStore {
    private readonly document = inject(DOCUMENT);
    private readonly key = 'training-observer.state-recording.v1';
    readonly saved = signal<StateRecording | null>(null);
    readonly error = signal('');

    load(): void {
        try {
            const json = this.document.defaultView?.localStorage.getItem(this.key);
            this.saved.set(json ? parseStateRecording(json) : null);
            this.error.set('');
        } catch {
            this.saved.set(null);
            this.error.set('Не удалось прочитать сохранённую запись. Можно создать новую.');
        }
    }

    save(recording: StateRecording): void {
        this.saved.set(recording);
        try {
            const json = JSON.stringify(recording);
            parseStateRecording(json);
            this.document.defaultView!.localStorage.setItem(this.key, json);
            this.error.set('');
        } catch {
            this.error.set('Не удалось сохранить запись в браузере. Скопируйте JSON ниже.');
        }
    }
}
