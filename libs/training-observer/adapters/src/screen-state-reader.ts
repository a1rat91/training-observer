/**
 * Чистая проекция одного снимка в состояние экрана. Находит единственный видимый корень по конфигурации,
 * проверяет готовность и читает ключ с корня или единственного видимого потомка.
 * Прямой текст носителя ID не включает содержимое вложенных полей; controls ограничены корнем области.
 * Пропущенный/усечённый DOM и дубли не превращаются в пустой правильный ответ. Живой DOM не читается.
 */
import {
    type ControlSnapshot,
    type DomElementSnapshot,
    type DomSnapshot,
    ScreenIdentityKind,
    type ScreenState,
    type ScreenStateOptions,
    ScreenStatus,
} from '@training-observer/core/models';

import {
    belongsToScreen,
    matchesScreenElement,
    validateScreenSelector,
} from './screen-elements';

export function readScreenState(
    snapshot: DomSnapshot | null,
    controls: readonly ControlSnapshot[],
    options: ScreenStateOptions,
): ScreenState {
    validateScreenSelector(options.root);

    if (options.identity.element) {
        validateScreenSelector(options.identity.element);
    }

    if (
        (options.identity.kind === ScreenIdentityKind.Attribute &&
            !options.identity.name.trim()) ||
        (options.loading && !options.loading.name.trim()) ||
        (options.ready && !options.ready.name.trim())
    ) {
        throw new Error('Screen identity and readiness rules must be explicit.');
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

    const elements = Object.values(snapshot.nodes).filter(
        (node): node is DomElementSnapshot => node.kind === 'element',
    );

    const roots = elements.filter((node) => matchesScreenElement(node, options.root));

    if (roots.length > 1) {
        return unavailable('root-ambiguous', 'ambiguous');
    }

    if (!roots[0]) {
        return unavailable('root-missing');
    }

    const root = roots[0];

    if (options.ready && root.attributes[options.ready.name] !== options.ready.value) {
        return {
            ...unavailable('not-ready', ScreenStatus.Loading),
            rootNodeId: root.id,
        };
    }

    const selector = options.identity.element;
    const sources = selector
        ? elements.filter(
              (node) =>
                  node.id !== root.id &&
                  belongsToScreen(snapshot, node.id, root.id) &&
                  matchesScreenElement(node, selector),
          )
        : [root];

    if (sources.length > 1) {
        return unavailable('identity-ambiguous', ScreenStatus.Ambiguous);
    }

    const source = sources[0];

    if (!source) {
        return unavailable('identity-element-missing');
    }

    // Только прямой текст: значения вложенных контролов не должны менять ключ экрана.
    const value =
        options.identity.kind === ScreenIdentityKind.Attribute
            ? source.attributes[options.identity.name]
            : source.children
                  .map((id) => snapshot.nodes[id])
                  .filter((node) => node?.kind === 'text')
                  .map((node) => (node.kind === 'text' ? node.text : ''))
                  .join(' ');

    const key = value?.trim() || null;

    if (!key) {
        return unavailable('identity-missing');
    }

    const loading =
        !!options.loading &&
        root.attributes[options.loading.name] === options.loading.value;

    return {
        schemaVersion: 1,
        status: loading ? ScreenStatus.Loading : ScreenStatus.Ready,
        reason: loading ? 'loading' : 'ready',
        key,
        rootNodeId: root.id,
        controls: controls.filter((control) =>
            belongsToScreen(snapshot, control.targetNodeId, root.id),
        ),
    };
}
