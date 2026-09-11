export type WireValue = boolean | number | string | null;
export interface ProcedureField {
    key: string;
    kind:
        | 'checkbox'
        | 'date'
        | 'email'
        | 'number'
        | 'radio'
        | 'select'
        | 'switch'
        | 'text'
        | 'textarea';
    label: string;
    required?: boolean;
    readonly?: boolean;
    min?: number;
    default?: WireValue;
    options?: ReadonlyArray<{value: string; label: string}>;
}
export interface ProcedureScreen {
    title: string;
    sections: ReadonlyArray<{
        key: string;
        title: string;
        fields: readonly ProcedureField[];
    }>;
    summary?: ReadonlyArray<{label: string; value: string}>;
    actions: ReadonlyArray<{action: 'back' | 'next'; label: string}>;
}
export interface ProcedureResponse {
    procedureId: string;
    revision: number;
    state: string;
    render: 'append' | 'replace';
    screen?: ProcedureScreen;
    values: Record<string, WireValue>;
    completion?: {title: string; applicationNumber: string};
}
export interface ProcedureAction {
    requestId: string;
    expectedRevision: number;
    action: 'back' | 'next';
    values: Record<string, WireValue>;
}
