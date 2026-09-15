/** Результат одного обновления runtime. feedback содержит только новые сообщения, а не историю уведомлений. */
import {type TrainingStatus} from '@training-observer/contracts';

export enum FeedbackKind {
    Error = 'error',
    Success = 'success',
}

/** UI выбирает оформление по kind; runtime не зависит от библиотеки уведомлений. */
export interface TrainingFeedback {
    readonly kind: FeedbackKind;
    readonly message: string;
}

export interface TrainingProgress {
    readonly status: `${TrainingStatus}`;
    readonly step: number;
    readonly total: number;
    readonly completedFields: number;
    readonly requiredFields: number;
    readonly feedback: readonly TrainingFeedback[];
    readonly issue: string;
}
