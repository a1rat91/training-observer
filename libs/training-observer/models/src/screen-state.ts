/** Наблюдаемая область: идентичность, готовность и контролы. Ожиданий обучения и DOM-ссылок нет. */
import {type ControlSnapshot} from './control-snapshot';
import {type DomNodeId} from './dom-snapshot';
import {type ScreenIdentityKind, type ScreenStatus} from './observation-enums';

/** Признаки существующего элемента в снимке; это не CSS-селектор и не требование новой разметки. */
export interface ScreenElementSelector {
    readonly tagName?: string;
    readonly attribute?: {readonly name: string; readonly value?: string};
}

export type ScreenIdentitySource = {
    /** Единственный видимый потомок корня. Без element идентичность читается с самого корня. */
    readonly element?: ScreenElementSelector;
} & (
    | {readonly kind: `${ScreenIdentityKind.Attribute}`; readonly name: string}
    | {readonly kind: `${ScreenIdentityKind.Text}`}
);

/** Правила интеграции используют уже существующие признаки, не добавляют маркеры приложению. */
export interface ScreenStateOptions {
    readonly root: ScreenElementSelector;
    readonly identity: ScreenIdentitySource;
    /** Явный признак загрузки на корне экрана, например aria-busy=true. */
    readonly loading?: {readonly name: string; readonly value: string};
    /** Положительный признак готовности на корне. Отсутствие или другое значение означает ожидание. */
    readonly ready?: {readonly name: string; readonly value: string};
}

export interface ScreenState {
    readonly schemaVersion: 1;
    readonly status: `${ScreenStatus}`;
    readonly reason:
        | 'identity-ambiguous'
        | 'identity-element-missing'
        | 'identity-missing'
        | 'loading'
        | 'no-snapshot'
        | 'not-ready'
        | 'ready'
        | 'root-ambiguous'
        | 'root-missing'
        | 'truncated';
    readonly key: string | null;
    readonly rootNodeId: DomNodeId | null;
    readonly controls: readonly ControlSnapshot[];
}

export interface ScreenVisit {
    readonly key: string;
    readonly number: number;
    readonly rootNodeId: DomNodeId;
}
