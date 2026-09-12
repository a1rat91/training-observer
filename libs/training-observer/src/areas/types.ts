/**
 * Контракты областей: конфигурация содержит существующий host-tag и необязательный контекст предка.
 * Snapshot не содержит DOM-ссылок. Поколение меняется при смене экземпляра, статуса или политики;
 * потребитель использует его для отклонения отложенных событий предыдущей области.
 */
export interface AreaDefinition {
    readonly key: string;
    readonly hostTag: string;
    readonly context?: {
        readonly ancestorTag: string;
        readonly attributes: Readonly<Record<string, string>>;
    };
    readonly observe: boolean;
}

export interface AreaSnapshot {
    readonly key: string;
    readonly status: 'ambiguous' | 'conflict' | 'missing' | 'resolved';
    readonly generation: number;
    readonly matches: number;
    readonly observe: boolean;
}

export type AreaOwner =
    | {readonly status: 'ambiguous'; readonly keys: readonly string[]}
    | {readonly status: 'excluded'; readonly area: AreaSnapshot}
    | {readonly status: 'outside'}
    | {readonly status: 'owned'; readonly area: AreaSnapshot};
