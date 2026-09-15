/** Перенос опубликованного сценария через JSON-файл.
 * Сначала читает и проверяет файл, затем показывает сводку; сохраняет только по явному действию.
 * Экспортирует публикацию из хранилища. Журнал записи и наблюдаемый интерфейс не изменяет.
 */
import {DOCUMENT} from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    output,
    signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {TuiButton} from '@taiga-ui/core';
import {TuiFiles} from '@taiga-ui/kit';
import {parseScenario, type TrainingScenario} from '@training-observer/contracts';

import {ScenarioStore} from '../../shared/scenarios/scenario-store';

@Component({
    selector: 'app-scenario-transfer',
    imports: [FormsModule, RouterLink, TuiButton, TuiFiles],
    templateUrl: './scenario-transfer.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioTransferComponent {
    private readonly document = inject(DOCUMENT);
    private readonly destroy = inject(DestroyRef);
    private request = 0;

    protected readonly store = inject(ScenarioStore);
    protected readonly candidate = signal<TrainingScenario | null>(null);
    protected readonly fileName = signal('');
    protected readonly reading = signal(false);
    protected readonly error = signal('');
    protected readonly done = signal(false);

    public readonly imported = output();

    constructor() {
        this.destroy.onDestroy(() => {
            // Результат незавершённого чтения больше не принадлежит этому редактору.
            ++this.request;
        });
    }

    protected async read(file: File | null): Promise<void> {
        const request = ++this.request;

        this.candidate.set(null);
        this.error.set('');
        this.done.set(false);
        this.fileName.set(file?.name ?? '');
        this.reading.set(!!file);

        if (!file) {
            return;
        }

        try {
            // UTF-8 занимает до четырёх байт на символ; кодек отдельно ограничивает длину JSON.
            if (file.size > 4_000_000) {
                throw new Error('Файл слишком большой. Максимум — 4 МБ.');
            }

            const json = await file.text();

            if (request !== this.request) {
                return;
            }

            this.candidate.set(parseScenario(json.replace(/^\uFEFF/, '')));
        } catch (error) {
            if (request === this.request) {
                let message = 'Не удалось прочитать файл.';

                if (error instanceof SyntaxError) {
                    message = 'Не удалось прочитать JSON. Проверьте содержимое файла.';
                } else if (error instanceof Error) {
                    message = error.message;
                }

                this.error.set(message);
            }
        } finally {
            if (request === this.request) {
                this.reading.set(false);
            }
        }
    }

    protected reject(): void {
        ++this.request;
        this.reading.set(false);
        this.candidate.set(null);
        this.done.set(false);
        this.error.set('Выберите JSON-файл размером до 4 МБ.');
    }

    protected accept(): void {
        const scenario = this.candidate();

        if (!scenario || this.reading()) {
            return;
        }

        this.store.save(scenario, '');

        if (!this.store.error()) {
            this.candidate.set(null);
            this.done.set(true);
            this.imported.emit();
        }
    }

    protected download(): void {
        const scenario = this.store.saved();

        if (!scenario) {
            return;
        }

        this.error.set('');

        try {
            // Компактный JSON не увеличивает размер относительно проверенного документа.
            const json = JSON.stringify(scenario);

            parseScenario(json);
            const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
            const link = this.document.createElement('a');

            link.href = url;
            link.download = 'training-scenario.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            this.error.set('Не удалось скачать сценарий.');
        }
    }
}
