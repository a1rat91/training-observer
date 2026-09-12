/** Wire v3 сохраняет логические области; v2 читается отдельно, без автоматического назначения MF. */
import {type AreaDefinition} from '../areas/types';

export interface AreaBindings {
    definitions: AreaDefinition[];
    targets: Array<{targetId: string; areaKey: string}>;
}

type DocumentScope = {version: 2} | {version: 3; areas: AreaBindings};
export type AttributeName = 'alt' | 'autocomplete' | 'href' | 'name' | 'title' | 'type';
export interface IdentityFeatures {
    tag: string;
    role: string | null;
    accessibleName: string | null;
    label: string | null;
    text: string | null;
    placeholder: string | null;
    attributes: Partial<Record<AttributeName, string>>;
    context: Array<{role: string | null; name: string}>;
}
export type Locator =
    | {kind: 'attribute'; name: AttributeName; value: string; exact: true}
    | {kind: 'css'; value: string}
    | {kind: 'label' | 'placeholder' | 'text'; value: string; exact: true}
    | {kind: 'role'; role: string; name: string | null; exact: true};

export interface ElementDescriptor {
    version: 2;
    id: string;
    scope: {pathname: string; context: Array<{role: string | null; name: string}>};
    /** Features stored once; fingerprint is structured evidence, not an opaque hash. */
    fingerprint: {
        algorithm: 'semantic-features-v1';
        normalization: 'nfc-whitespace-v1';
        features: IdentityFeatures;
    };
    locators: Array<{id: string; selector: Locator; recordedMatches: number}>;
    /** Recorded uniqueness is not evidence of identity in another document. */
    contextRequired: boolean;
}

export type Value = string[] | boolean | string;
export type NormalizedValue =
    {rule: 'date-dmy-v1'; value: string} | {rule: 'decimal-comma-v1'; value: number};
export type CapturedValue =
    | {status: 'captured'; raw: Value; normalized?: NormalizedValue}
    | {status: 'omitted'; reason: 'policy'}
    | {status: 'redacted'; reason: 'sensitive'}
    | {status: 'unavailable'; reason: 'detached' | 'unsupported'};
export interface ValuePolicy {
    mode: 'capture' | 'omit';
    sensitive: 'redact';
    normalizers: Array<NormalizedValue['rule']>;
}
export type ObservationMode =
    | {kind: 'dom-only'}
    | {kind: 'shared-adapter'; adapterId: string; adapterVersion: string};
export interface ObservedState {
    targetId: string;
    timeMs: number;
    source: 'mutation' | 'native-event' | 'property-observer' | 'snapshot';
    connected: boolean;
    visible: boolean | null;
    enabled: boolean | null;
    readOnly: boolean | null;
    value: CapturedValue;
}

interface ActionBase {
    id: string;
    sequence: number;
    /** Monotonic offset from this recording's start; never compared across sessions. */
    timeMs: number;
    evidence: {
        trigger: 'change' | 'input' | 'keyboard' | 'navigation' | 'pointer';
        trusted: boolean | null;
    };
}
export type SemanticAction = ActionBase &
    (
        | {
              kind: 'input';
              targetId: string;
              commit: 'blur' | 'change' | 'idle';
              value: CapturedValue;
          }
        | {
              kind: 'select';
              targetId: string;
              commit: 'change' | 'confirmed-selection';
              value: CapturedValue;
          }
        | {kind: 'click'; targetId: string}
        | {kind: 'navigation'; pathname: string}
    );
export interface RecorderDiagnostic {
    timeMs: number;
    code:
        | 'ambiguous-owner'
        | 'capacity-reached'
        | 'composition-cancelled'
        | 'unconfirmed-selection'
        | 'unsupported-control';
    message: string;
}

interface RecordingContent {
    kind: 'training-recording';
    id: string;
    mode: ObservationMode;
    valuePolicy: ValuePolicy;
    descriptors: ElementDescriptor[];
    actions: SemanticAction[];
    /** State updates are not automatically actions or completed steps. */
    states: ObservedState[];
    diagnostics?: RecorderDiagnostic[];
}

export type Recording = DocumentScope & RecordingContent;

export type ExpectedAction =
    | {kind: 'click' | 'input' | 'select'; targetId: string}
    | {kind: 'navigation'; pathname: string};
export type ValueCondition =
    | {kind: 'normalized-equals'; normalized: NormalizedValue}
    | {kind: 'raw-equals'; value: Value};
export type Condition =
    | {kind: 'all' | 'any'; conditions: Condition[]}
    | {kind: 'pathname'; value: string}
    | {kind: 'value'; targetId: string; condition: ValueCondition}
    | {kind: 'visible'; targetId: string; expected: boolean};
export interface ScenarioStep {
    id: string;
    instruction: string;
    hint: string | null;
    optional: boolean;
    action: ExpectedAction;
    completion: Condition;
    /** If multiple conditions match, runtime must report ambiguity, not choose by array order. */
    branches: Array<{when: Condition; nextStepId: string}>;
    /** Taken when no branch matches, or when an optional step is explicitly skipped. */
    nextStepId: string | null;
}

interface ScenarioContent {
    kind: 'training-scenario';
    id: string;
    mode: ObservationMode;
    descriptors: ElementDescriptor[];
    startStepId: string;
    /** Reaching the end of the graph alone never proves scenario completion. */
    completion: Condition;
    steps: ScenarioStep[];
}

export type Scenario = DocumentScope & ScenarioContent;

export type EvidenceGroup = 'attributes' | 'context' | 'naming' | 'role-type';
export interface CandidateEvidence {
    id: string;
    summary: {tag: string; role: string | null; name: string | null};
    /** Scores in [0,1], not calibrated probabilities. Naming features are correlated. */
    score: number;
    evidence: Array<{
        group: EvidenceGroup;
        outcome: 'match' | 'mismatch' | 'missing';
        detail: string;
    }>;
}

interface ResolutionBase {
    kind: 'element-resolution';
    version: 2;
    targetId: string;
    candidates: CandidateEvidence[];
    attempts: Array<{
        locatorId: string;
        count: number;
        outcome: 'accepted' | 'ambiguous' | 'missing' | 'rejected';
    }>;
}
export type Resolution = ResolutionBase &
    (
        | {
              status: 'broken';
              reason:
                  | 'identity-conflict'
                  | 'insufficient-evidence'
                  | 'not-found'
                  | 'scope-mismatch'
                  | 'unsupported';
          }
        | {
              status: 'resolved';
              selectedCandidateId: string;
              strategy: 'css-verified' | 'semantic' | 'similarity';
          }
        | {status: 'ambiguous'; reason: 'duplicate-context' | 'near-tie'}
    );
export type TargetWaitState = {kind: 'target-wait'; version: 2} & (
    | {
          status: 'cancelled';
          targetId: string;
          reason: 'reset' | 'step-changed' | 'stopped' | 'unmounted';
      }
    | {
          status: 'waiting';
          targetId: string;
          sinceMs: number;
          deadlineMs: number;
          reason: 'not-stable' | 'not-yet-present';
      }
    | {status: 'ambiguous'; resolution: Extract<Resolution, {status: 'ambiguous'}>}
    | {status: 'broken'; resolution: Extract<Resolution, {status: 'broken'}>}
    | {status: 'ready'; resolution: Extract<Resolution, {status: 'resolved'}>}
    | {status: 'timed-out'; targetId: string; deadlineMs: number}
);

/** Ephemeral binding; deliberately absent from the persisted recording/scenario. */
export type LiveResolution =
    | {report: Exclude<Resolution, {status: 'resolved'}>; element?: never}
    | {report: Extract<Resolution, {status: 'resolved'}>; element: Element};
