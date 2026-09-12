import {DOCUMENT, JsonPipe} from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    inject,
    NgZone,
    signal,
    viewChild,
} from '@angular/core';
import {finder} from '@medv/finder';
import {TuiButton} from '@taiga-ui/core';
import {computeAccessibleName, getRole} from 'dom-accessibility-api';

import savedReport from '../../../../../docs/spike/library-probes.json';
import {ResearchFixtureComponent} from './research-fixture.component';

interface LocatorResult {
    library: string;
    locator?: string;
    variants?: readonly string[];
    error?: string;
}

interface ValueEntry {
    sequence: number;
    name: string;
    source: 'native' | 'rrweb' | 'snapshot';
    event: string;
    value: boolean | string | readonly string[];
}

interface Counts {
    correct: number;
    wrong: number;
    ambiguous: number;
    missing: number;
}

interface ResearchReport {
    generatedAt: string;
    browser: string;
    rows: readonly unknown[];
    summary: Record<string, Record<string, Counts>>;
}

/**
 * Исследовательская панель: осмотр DOM-целей, сравнение locators и диагностика изменений значений.
 * Алгоритм: по событиям формы определяет цель, генерирует locators и проверяет CSS; по команде
 * запускает rrweb и объединяет ограниченный журнал snapshot/native/rrweb с отдельным сохранённым отчётом.
 * Собственные элементы панели исключаются из записи; при уничтожении снимаются listeners и останавливается replay.
 */
@Component({
    standalone: true,
    selector: 'research-page',
    imports: [JsonPipe, ResearchFixtureComponent, TuiButton],
    templateUrl: './research-page.component.html',
    styleUrl: './research-page.component.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ResearchPageComponent {
    private readonly document = inject(DOCUMENT);
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);
    private readonly fixture = viewChild(ResearchFixtureComponent, {
        read: ElementRef<HTMLElement>,
    });

    private selectedElement?: Element;
    private stopReplay?: () => void;
    private replayEvents: Array<{type: number; data: unknown}> = [];
    private generation = 0;
    private valueSequence = 0;
    private disposed = false;

    public readonly report = signal<ResearchReport>(savedReport);
    public readonly selection = signal<{
        role: string | null;
        name: string;
        tag: string;
    } | null>(null);

    public readonly locators = signal<readonly LocatorResult[]>([]);
    public readonly message = signal('Нажмите на поле или кнопку в форме слева.');
    public readonly nativeEvents = signal<readonly string[]>([]);
    public readonly valueEntries = signal<readonly ValueEntry[]>([]);
    public readonly replayStats = signal<{
        total: number;
        inputs: number;
        mutations: number;
    } | null>(null);

    public readonly recording = signal(false);
    public readonly replayLoading = signal(false);
    public readonly generatorsBusy = signal(false);
    public readonly libraries = [
        'dom-to-locator',
        'mizchi',
        'finder-default',
        'finder-filtered',
    ];

    public readonly scenarios = [
        {key: 'baseline', title: 'Исходный DOM в новом документе'},
        {key: 'layout', title: 'Wrappers, порядок, классы, icon/span, перенос'},
        {key: 'regenerated-ids', title: 'Перегенерация ID'},
        {key: 'renamed', title: 'Дополнение текста кнопки'},
        {key: 'duplicate', title: 'Дубликат формы'},
        {key: 'removed', title: 'Удаление цели'},
        {key: 'swap-indistinguishable', title: 'Перестановка одинаковых кнопок'},
        {key: 'css-trap', title: 'Старый CSS указывает на чужую кнопку'},
        {key: 'semantic-trap', title: 'Другая операция с похожим названием'},
    ];

    constructor() {
        const listener = (event: Event): void => this.observe(event);

        for (const type of ['click', 'input', 'change']) {
            this.document.addEventListener(type, listener, true);
        }

        this.destroyRef.onDestroy(() => {
            this.disposed = true;
            this.generation++;

            for (const type of ['click', 'input', 'change']) {
                this.document.removeEventListener(type, listener, true);
            }

            this.stopReplay?.();
        });
    }

    public downloadReport(): void {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(this.report(), null, 2)], {
                type: 'application/json',
            }),
        );

        const link = this.document.createElement('a');

        link.href = url;
        link.download = 'library-probes.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    public checkCss(): void {
        const selected = this.selectedElement;

        if (!selected?.isConnected) {
            this.message.set('Выбранный элемент больше не находится в DOM.');

            return;
        }

        const results = this.locators()
            .filter((row) => row.library.startsWith('finder') && row.locator)
            .map((row) => {
                const matches = this.document.querySelectorAll(row.locator!);
                const status =
                    matches.length === 1 && matches[0] === selected
                        ? 'correct'
                        : 'неоднозначность или чужая цель';

                return `${row.library}: ${matches.length} совпадений · ${status}`;
            });

        this.message.set(results.join('; ') || 'Сначала выберите элемент.');
    }

    public async startReplay(): Promise<void> {
        this.replayLoading.set(true);

        try {
            const {record, EventType, IncrementalSource} = await import('rrweb');

            if (this.disposed) {
                return;
            }

            this.stopReplay?.();
            this.replayEvents = [];
            this.nativeEvents.set([]);
            this.valueEntries.set([]);
            this.valueSequence = 0;
            this.replayStats.set(null);
            this.zone.runOutsideAngular(() => {
                this.stopReplay = record({
                    maskAllInputs: true,
                    // Keep real values only in the demo form. Same-length changes must not collapse after masking.
                    maskInputFn: (value, element) =>
                        this.belongsToFixture(element) &&
                        !element.matches('input[type="password"]')
                            ? value
                            : '*'.repeat(value.length),
                    blockSelector: 'research-page aside',
                    sampling: {mousemove: false},
                    emit: (event) => {
                        // Bounded replay buffer. The live value journal is inside the blocked sidebar.
                        if (this.replayEvents.length < 5000) {
                            this.replayEvents.push(event);
                        }

                        if (
                            this.recording() &&
                            !this.disposed &&
                            event.type === EventType.IncrementalSnapshot &&
                            event.data.source === IncrementalSource.Input
                        ) {
                            const element = record.mirror.getNode(event.data.id);
                            const input = event.data;

                            if (
                                element instanceof Element &&
                                this.belongsToFixture(element)
                            ) {
                                this.zone.run(() => {
                                    this.appendValue(
                                        element,
                                        'rrweb',
                                        'input update',
                                        element.matches(
                                            'input[type="checkbox"], input[type="radio"]',
                                        )
                                            ? input.isChecked
                                            : input.text,
                                    );
                                });
                            }
                        }
                    },
                });
            });
            this.recording.set(true);

            for (const element of this.fixture()!.nativeElement.querySelectorAll(
                'input,textarea,select',
            )) {
                this.appendValue(element, 'snapshot', 'начальное значение');
            }

            this.message.set(
                'Запись включена. В журнале появятся значения полей, включая выбор курса.',
            );
        } catch (error) {
            this.message.set(`Ошибка записи: ${String(error)}`);
        } finally {
            this.replayLoading.set(false);
        }
    }

    public stopRecording(): void {
        this.stopReplay?.();
        this.stopReplay = undefined;
        this.recording.set(false);
        this.refreshStats();
    }

    public refreshStats(): void {
        const incremental = this.replayEvents
            .filter((event) => event.type === 3)
            .map((event) => event.data as {source: number});

        this.replayStats.set({
            total: this.replayEvents.length,
            inputs: incremental.filter((event) => event.source === 5).length,
            mutations: incremental.filter((event) => event.source === 0).length,
        });
    }

    private belongsToFixture(element: Element): boolean {
        return this.fixture()?.nativeElement.contains(element) ?? false;
    }

    private appendValue(
        element: Element,
        source: ValueEntry['source'],
        event: string,
        capturedValue?: boolean | string,
    ): void {
        let value: ValueEntry['value'];

        if (element instanceof HTMLInputElement && element.type === 'password') {
            value = '[скрыто]';
        } else if (capturedValue !== undefined) {
            value = capturedValue;
        } else if (element instanceof HTMLInputElement) {
            value = ['checkbox', 'radio'].includes(element.type)
                ? element.checked
                : element.value;
        } else if (element instanceof HTMLTextAreaElement) {
            value = element.value;
        } else if (element instanceof HTMLSelectElement) {
            value = element.multiple
                ? Array.from(element.selectedOptions, (option) => option.value)
                : element.value;
        } else {
            return;
        }

        const entry: ValueEntry = {
            sequence: ++this.valueSequence,
            name: computeAccessibleName(element) || element.localName,
            source,
            event,
            value,
        };

        this.valueEntries.update((entries) => [entry, ...entries].slice(0, 50));
    }

    private observe(event: Event): void {
        const root = this.fixture()?.nativeElement;
        const element = event
            .composedPath()
            .find(
                (node) =>
                    node instanceof Element &&
                    node.matches('input,textarea,button,select,[role="option"]'),
            );

        if (!root || !(element instanceof Element)) {
            return;
        }

        const belongsToPopup = [...root.querySelectorAll('[aria-controls]')].some(
            (owner) => {
                const id = owner.getAttribute('aria-controls');

                return (
                    id &&
                    this.document.querySelector(`#${CSS.escape(id)}`)?.contains(element)
                );
            },
        );

        if (!root.contains(element) && !belongsToPopup) {
            return;
        }

        const name = computeAccessibleName(element) || element.localName;

        this.nativeEvents.update((events) =>
            [`${event.type} · ${name}`, ...events].slice(0, 12),
        );

        if (this.recording() && ['change', 'input'].includes(event.type)) {
            this.appendValue(element, 'native', event.type);
        }

        if (event.type === 'click') {
            void this.inspect(element);
        }
    }

    private async inspect(element: Element): Promise<void> {
        const generation = ++this.generation;

        this.selectedElement = element;
        this.selection.set({
            role: getRole(element),
            name: computeAccessibleName(element),
            tag: element.localName,
        });
        this.locators.set([]);
        this.generatorsBusy.set(true);
        this.message.set('Генерирую locators выбранного элемента…');

        try {
            const [dom, mizchi] = await Promise.all([
                import('dom-to-locator'),
                import('@mizchi/selector-generator'),
            ]);

            if (this.disposed || generation !== this.generation) {
                return;
            }

            if (!element.isConnected) {
                this.message.set(
                    'Элемент исчез до загрузки генераторов. Для option откройте список ещё раз.',
                );

                return;
            }

            const run = (
                library: string,
                generate: () => Omit<LocatorResult, 'library'>,
            ): LocatorResult => {
                try {
                    return {library, ...generate()};
                } catch (error) {
                    return {library, error: String(error)};
                }
            };

            this.locators.set([
                run('dom-to-locator', () => ({
                    locator: dom.generateInternalSelector(element),
                    variants: dom.generateLocators(element),
                })),
                run('mizchi', () => {
                    const result = mizchi.createSelectorGenerator(window)(element, {
                        testIdAttributeName: 'data-testid',
                        multiple: true,
                    });

                    return {
                        locator: result.selector,
                        variants: result.selectors.map((selector) =>
                            mizchi.toLocator(selector),
                        ),
                    };
                }),
                run('finder-default', () => ({
                    locator: finder(element, {timeoutMs: 100}),
                })),
                run('finder-filtered', () => ({
                    locator: finder(element, {
                        timeoutMs: 100,
                        idName: () => false,
                        className: () => false,
                        attr: (name) =>
                            [
                                'alt',
                                'href',
                                'name',
                                'placeholder',
                                'title',
                                'type',
                            ].includes(name),
                    }),
                })),
            ]);
            this.message.set(
                'Locators сгенерированы в текущем DOM. Их устойчивость ещё не доказана.',
            );
        } catch (error) {
            this.message.set(`Не удалось загрузить генераторы: ${String(error)}`);
        } finally {
            if (!this.disposed && generation === this.generation) {
                this.generatorsBusy.set(false);
            }
        }
    }
}
