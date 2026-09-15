/** Отпечаток снимка для подавления одинаковых публикаций. Исключает время/стоимость capture, сохраняет наблюдаемые данные. */
import {type DomSnapshot} from '@training-observer/core/models';

/** Время и длительность capture не меняют состояние страницы. Порядок массивов сохраняется. */
export function snapshotFingerprint(snapshot: DomSnapshot): string {
    return JSON.stringify([
        snapshot.rootId,
        snapshot.relatedRootIds,
        snapshot.nodes,
        snapshot.interactiveIds,
        snapshot.stats,
    ]);
}
