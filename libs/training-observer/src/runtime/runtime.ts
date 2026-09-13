/**
 * ScenarioRuntime выбирает интерпретатор по проверенной версии документа.
 * v2/v3 сохраняют последовательную семантику, v4/v5 используют группы ожиданий; v5 добавляет обратную связь.
 * Facade делегирует lifecycle; импорт не мигрирует зависимости и не переупорядочивает сценарий.
 */
import {readScenario, type Scenario} from '../contracts';
import {GroupRuntime} from './group-runtime';
import {LegacyScenarioRuntime} from './legacy-runtime';
import {type RuntimeOptions, type RuntimeSnapshot} from './state';

export type {
    ExpectationSnapshot,
    RuntimeFeedback,
    RuntimeOptions,
    RuntimeSnapshot,
    RuntimeStatus,
} from './state';
export class ScenarioRuntime {
    private readonly session: GroupRuntime | LegacyScenarioRuntime;

    constructor(root: HTMLElement, scenario: Scenario, options: RuntimeOptions = {}) {
        const document = readScenario(scenario);

        this.session =
            'groups' in document
                ? new GroupRuntime(root, document, options)
                : new LegacyScenarioRuntime(root, document, options);
    }

    public start(): void {
        this.session.start();
    }

    public stop(): void {
        this.session.stop();
    }

    public retry(): void {
        this.session.retry();
    }

    public skip(id?: string): void {
        if (this.session instanceof GroupRuntime) {
            this.session.skip(id);
        } else {
            this.session.skip();
        }
    }

    public snapshot(): RuntimeSnapshot {
        return this.session.snapshot();
    }
}
