/** Подписи старых PoC-стендов. Библиотечный name всегда содержит имя DOM-тега. */
import {type MicrofrontendSnapshot} from '@training-observer/core/models';

export function pocAreaLabel(area: MicrofrontendSnapshot): string {
    const snapshot = area.snapshot;
    const root = snapshot?.rootId ? snapshot.nodes[snapshot.rootId] : undefined;

    return root?.kind === 'element'
        ? (root.attributes['data-microfrontend-name'] ??
              root.attributes['data-mf'] ??
              area.name)
        : area.name;
}
