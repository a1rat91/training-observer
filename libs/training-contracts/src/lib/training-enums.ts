/** Состояния учебных документов и прохождения. Сериализуемые значения enum сохраняют JSON v1. */
export enum RecordingEventKind {
    Screen = 'screen',
    Value = 'value',
    Unavailable = 'unavailable',
}

export enum TrainingStatus {
    Waiting = 'waiting',
    Active = 'active',
    Blocked = 'blocked',
    Complete = 'complete',
}

export enum MatchStatus {
    Matched = 'matched',
    Missing = 'missing',
    Ambiguous = 'ambiguous',
}
