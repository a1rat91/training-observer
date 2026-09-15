/** Чтение существующего ID экрана по конфигурации. Проверяет уникальность корня и готовность, ограничивает контролы его поддеревом. */
/**
 * Чистая проекция одного снимка в состояние экрана. Находит единственный видимый корень по конфигурации,
 * читает существующий ключ и признак загрузки, ограничивает controls его поддеревом.
 * Пропущенный/усечённый DOM и дубли не превращаются в пустой правильный ответ. Живой DOM не читается.
 */
import {
    type ControlSnapshot,
    type DomElementSnapshot,
    type DomSnapshot,
    type ScreenState,
    type ScreenStateOptions,
    ScreenStatus,
} from '@training-observer/core/models';

export function readScreenState(
    snapshot: DomSnapshot | null,
    controls: readonly ControlSnapshot[],
    options: ScreenStateOptions,
): ScreenState {
    if (
        (!options.root.tagName && !options.root.attribute?.name) ||
        (options.identity.kind === 'attribute' && !options.identity.name.trim())
    ) {
        throw new Error('Screen root and identity rules must be explicit.');
    }

    const unavailable = (
        reason: ScreenState['reason'],
        status: ScreenState['status'] = 'unavailable',
    ): ScreenState => ({
        schemaVersion: 1,
        status,
        reason,
        key: null,
        rootNodeId: null,
        controls: [],
    });

    if (!snapshot) {
        return unavailable('no-snapshot');
    }

    if (snapshot.stats.truncated) {
        return unavailable('truncated');
    }

    const roots = Object.values(snapshot.nodes).filter(
        (node): node is DomElementSnapshot => {
            if (
                node.kind !== 'element' ||
                !node.visible ||
                (options.root.tagName &&
                    node.tagName !== options.root.tagName.toLowerCase())
            ) {
                return false;
            }

            const attribute = options.root.attribute;

            return (
                !attribute ||
                (Object.hasOwn(node.attributes, attribute.name) &&
                    (attribute.value === undefined ||
                        node.attributes[attribute.name] === attribute.value))
            );
        },
    );

    if (roots.length > 1) {
        return unavailable('root-ambiguous', 'ambiguous');
    }

    if (!roots[0]) {
        return unavailable('root-missing');
    }

    const root = roots[0];
    // Для текстового ID используется только прямой текст: значения потомков не должны менять ключ экрана.
    const value =
        options.identity.kind === 'attribute'
            ? root.attributes[options.identity.name]
            : root.children
                  .map((id) => snapshot.nodes[id])
                  .filter((node) => node?.kind === 'text')
                  .map((node) => (node.kind === 'text' ? node.text : ''))
                  .join(' ');

    const key = value?.trim() || null;

    if (!key) {
        return unavailable('identity-missing');
    }

    const belongs = (id: string): boolean => {
        const visited = new Set<string>();
        let node = snapshot.nodes[id];

        while (node && !visited.has(node.id)) {
            if (node.id === root.id) {
                return true;
            }

            visited.add(node.id);
            node = node.parentId ? snapshot.nodes[node.parentId] : undefined;
        }

        return false;
    };

    const loading =
        !!options.loading &&
        root.attributes[options.loading.name] === options.loading.value;

    return {
        schemaVersion: 1,
        status: loading ? ScreenStatus.Loading : ScreenStatus.Ready,
        reason: loading ? 'loading' : 'ready',
        key,
        rootNodeId: root.id,
        controls: controls.filter((control) => belongs(control.targetNodeId)),
    };
}
