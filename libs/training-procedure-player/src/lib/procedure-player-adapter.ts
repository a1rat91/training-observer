/** Правила DOM процедурного плеера. Один адаптер обслуживает несколько компонентов плеера;
 * ветки добавляются по мере распознавания новых компонентов. Нативный fallback остаётся базой. */
import {
    type ControlAdapter,
    type ControlAdapterContext,
    type ControlAdapterResult,
    normalizeText,
} from '@training-observer/core/adapters';

const TABLE_HOST = 'procedure-player-table';
const ROW = 'tr';

/** DOM-маркеры проверены на procedure-player-front. Приоритет выше taiga-ui (100). */
export const procedurePlayerAdapter: ControlAdapter = {
    id: 'procedure-player',
    priority: 200,
    match(context) {
        const {ancestors} = context;

        // Таблица процедурного плеера.
        if (ancestors.some((parent) => parent.tagName === TABLE_HOST)) {
            return matchTable(context);
        }

        // Другие компоненты плеера добавляются отдельными ветками здесь.
        return null;
    },
    resolveLabel({reader, candidate}) {
        if (candidate.source !== 'procedure-player') {
            return;
        }

        // Строка таблицы: метка — весь текст строки; остальные компоненты добавляются по мере появления.
        const row = candidate.ancestors.find((parent) => parent.tagName === ROW);

        return row ? normalizeText(reader.text(row.id)) : undefined;
    },
};

function matchTable(context: ControlAdapterContext): ControlAdapterResult | null {
    const {ancestors, nativeKind, reader} = context;
    const tableIndex = ancestors.findIndex((parent) => parent.tagName === TABLE_HOST);
    const owned = ancestors.slice(0, tableIndex);
    const row = owned.find((parent) => parent.tagName === ROW);
    const chrome = owned.some((parent) => ['tfoot', 'thead'].includes(parent.tagName));

    // Radio в строке данных: выбор несёт checked, хост — строка (для label и группы).
    if (row && !chrome && nativeKind === 'radio') {
        return {
            status: 'match',
            kind: 'radio',
            hostId: row.id,
            label: normalizeText(reader.text(row.id)),
        };
    }

    // Всё прочее (поиск, фильтры, сортировка, переключатель фильтров, пагинация) — chrome таблицы.
    return {status: 'exclude'};
}
