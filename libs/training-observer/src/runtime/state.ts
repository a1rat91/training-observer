/** Общие фазы сеанса и JSON snapshots для интеграции без UI. XState владеет lifecycle-фазой. */
import {createMachine} from 'xstate';

import {type AreaRegistry} from '../areas';
import {type Resolution} from '../contracts';
import {type ResolverOptions} from '../resolution';

export interface ExpectationSnapshot {
    id: string;
    instruction: string;
    hint: string | null;
    optional: boolean;
    status:
        | 'ambiguous'
        | 'blocked'
        | 'confirming'
        | 'editing'
        | 'inactive'
        | 'mismatch'
        | 'ready'
        | 'satisfied'
        | 'skipped'
        | 'waiting';
}
export const machine = createMachine({
    id: 'training',
    initial: 'waiting',
    states: {
        waiting: {},
        ready: {},
        confirming: {},
        ambiguous: {},
        broken: {},
        timedOut: {},
        finalizing: {},
        completed: {type: 'final'},
        stopped: {type: 'final'},
    },
    on: {
        WAIT: '.waiting',
        READY: '.ready',
        CONFIRM: '.confirming',
        AMBIGUOUS: '.ambiguous',
        BROKEN: '.broken',
        TIMEOUT: '.timedOut',
        FINALIZE: '.finalizing',
        COMPLETE: '.completed',
        STOP: '.stopped',
    },
});
export type RuntimeStatus =
    | 'ambiguous'
    | 'broken'
    | 'completed'
    | 'confirming'
    | 'finalizing'
    | 'ready'
    | 'stopped'
    | 'timedOut'
    | 'waiting';
export interface RuntimeSnapshot {
    status: RuntimeStatus;
    stepId: string | null;
    instruction: string;
    hint: string | null;
    optional: boolean;
    completedSteps: number;
    message: string;
    resolution: Resolution | null;
    uncommittedInput: boolean;
    groupId?: string;
    groupTitle?: string;
    expectations?: ExpectationSnapshot[];
    transitions?: Array<{id: string; instruction: string; ready: boolean}>;
}
/** Одно сообщение на проверенную попытку. Не содержит введённых значений или DOM-ссылок. */
export interface RuntimeFeedback {
    sessionId: string;
    groupId: string;
    jobId: string;
    attemptId: string;
    outcome: 'allowed' | 'error' | 'success';
    message: string;
    choiceGroupId?: string;
    variantId?: string;
}
export interface RuntimeOptions extends ResolverOptions {
    onFeedback?(event: RuntimeFeedback): void;
    areas?: AreaRegistry;
    timeoutMs?: number;
    onUpdate?(snapshot: RuntimeSnapshot): void;
    /** Test fixtures only, never enabled in the learner page. */
    acceptUntrustedEvents?: boolean;
}
