/**
 * TargetResolver применяет сохранённую область до поиска DOM-кандидатов.
 * Конфигурация документа сверяется с registry интеграции; документ не меняет observe.
 * Каждый вызов заново получает текущий экземпляр MF. Нет области, доступа или однозначного
 * host — нет глобального fallback. v2 допустим только без registry, либо после явной миграции.
 */
import {type AreaRegistry} from '../areas';
import {
    type ElementDescriptor,
    type LiveResolution,
    type Recording,
    type Scenario,
} from '../contracts';
import {ElementResolver, type ResolverOptions} from './resolver';

export class TargetResolver {
    private readonly resolver: ElementResolver;
    private readonly keys = new Map<string, string>();

    constructor(
        document: Recording | Scenario,
        private readonly root: Element,
        private readonly options: ResolverOptions = {},
        private readonly areas?: AreaRegistry,
    ) {
        this.resolver = new ElementResolver(options);

        if (document.version === 2) {
            if (areas) {
                throw new Error(
                    'Документ v2 требует явной привязки целей к микрофронтам.',
                );
            }

            return;
        }

        if (!areas) {
            throw new Error('Документ v3 требует AreaRegistry.');
        }

        const definitions = areas.definitions();

        for (const expected of document.areas.definitions) {
            const actual = definitions.find((entry) => entry.key === expected.key);
            const attributes = (value: typeof expected): string =>
                JSON.stringify(
                    Object.entries(value.context?.attributes ?? {}).sort(([a], [b]) =>
                        a.localeCompare(b),
                    ),
                );

            if (
                actual?.hostTag !== expected.hostTag ||
                actual.context?.ancestorTag !== expected.context?.ancestorTag ||
                attributes(actual) !== attributes(expected)
            ) {
                throw new Error(
                    `Конфигурация микрофронта ${expected.key} не соответствует документу.`,
                );
            }
        }

        for (const binding of document.areas.targets) {
            this.keys.set(binding.targetId, binding.areaKey);
        }
    }

    public areaStatus(
        targetId: string,
    ):
        | 'ambiguous'
        | 'conflict'
        | 'excluded'
        | 'missing'
        | 'resolved'
        | 'unbound'
        | 'unscoped' {
        if (!this.areas) {
            return 'unscoped';
        }

        const area = this.areas
            .snapshots()
            .find((entry) => entry.key === this.keys.get(targetId));

        if (!area) {
            return 'unbound';
        }

        return area.observe ? area.status : 'excluded';
    }

    public resolve(descriptor: ElementDescriptor): LiveResolution {
        if (!this.areas) {
            return this.resolver.resolve(descriptor, this.root);
        }

        const key = this.keys.get(descriptor.id);
        const root = key ? this.areas.root(key) : null;

        return !key ||
            !root ||
            !this.root.contains(root) ||
            !this.areas.accepts(key, root)
            ? {
                  report: {
                      kind: 'element-resolution',
                      version: 2,
                      targetId: descriptor.id,
                      candidates: [],
                      attempts: [],
                      status: 'broken',
                      reason: 'unsupported',
                  },
              }
            : new ElementResolver({
                  ...this.options,
                  accepts: (element) =>
                      this.areas!.accepts(key, element) &&
                      (this.options.accepts?.(element) ?? true),
              }).resolve(descriptor, root);
    }
}
