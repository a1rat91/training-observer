/** Learner entry point shows whether an admin recording exists. It deliberately does not start
 * a fake training: scenario compilation, matching and feedback will be connected in the next stages.
 */
import {afterNextRender, ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {RecordingStore} from '../../shared/recording/recording-store';

@Component({
    selector: 'app-learn',
    imports: [RouterLink],
    template: `
        <main data-training-observer-ignore>
            <h1>Тренировка</h1>
            @if (store.saved(); as recording) {
                <p>Запись администратора сохранена: {{ recording.events.length }} строк.</p>
                <p>Прохождение по записи ещё не подключено. Здесь появится форма с автоматической проверкой и Taiga Alerts при ошибках.</p>
            } @else { <p>Сначала создайте и завершите запись в админке.</p> }
            @if (store.error()) { <p role="alert">{{ store.error() }}</p> }
            <a routerLink="/record">Открыть запись</a>
        </main>
    `,
    styles: 'main {max-width:60rem; margin:auto; padding:2rem;}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnComponent {
    protected readonly store = inject(RecordingStore);
    constructor() { afterNextRender(() => this.store.load()); }
}
