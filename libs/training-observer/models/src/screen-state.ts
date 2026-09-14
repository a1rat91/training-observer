/** Учебная проекция снимка: логический экран, качество чтения и его контролы. DOM-ссылок нет. */
import type { ScreenStatus } from './observation-enums';
import type { ControlSnapshot } from './control-snapshot';
import type { DomNodeId } from './dom-snapshot';

/** Правила интеграции используют уже существующие признаки, не добавляют маркеры приложению. */
export interface ScreenStateOptions {
    readonly root: {
        readonly tagName?: string;
        readonly attribute?: { readonly name: string; readonly value?: string };
    };
    readonly identity: { readonly kind: 'attribute'; readonly name: string } | { readonly kind: 'text' };
    /** Явный признак загрузки на корне экрана, например aria-busy=true. */
    readonly loading?: { readonly name: string; readonly value: string };
}

export interface ScreenState {
    readonly schemaVersion: 1;
    readonly status: `${ScreenStatus}`;
    readonly reason:
        | 'ready'
        | 'loading'
        | 'no-snapshot'
        | 'truncated'
        | 'root-missing'
        | 'root-ambiguous'
        | 'identity-missing';
    readonly key: string | null;
    readonly rootNodeId: DomNodeId | null;
    readonly controls: readonly ControlSnapshot[];
}

export interface ScreenVisit {
    readonly key: string;
    readonly number: number;
    readonly rootNodeId: DomNodeId;
}
