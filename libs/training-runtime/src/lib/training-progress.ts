/** Результат одного обновления runtime. feedback содержит только новые сообщения, а не историю уведомлений. */
import {type TrainingStatus} from '@training-observer/contracts';

export interface TrainingProgress {
    readonly status: `${TrainingStatus}`;
    readonly step: number;
    readonly total: number;
    readonly completedFields: number;
    readonly requiredFields: number;
    readonly feedback: readonly string[];
    readonly issue: string;
}
