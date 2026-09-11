export type LocatorCandidate =
    | {kind: 'attribute'; name: string; value: string}
    | {kind: 'css'; value: string}
    | {kind: 'label' | 'placeholder' | 'text'; value: string}
    | {kind: 'role'; role: string; name: string; context?: string};

export interface Fingerprint {
    tag: string;
    role: string;
    accessibleName: string;
    text: string;
    label: string;
    placeholder: string;
    attributes: Record<string, string>;
    context: string[];
}

export interface ElementDescriptor extends Fingerprint {
    version: 1;
    page: string;
    locators: LocatorCandidate[];
    cssFallback?: string;
    fingerprint: Fingerprint;
    /** Duplicates at recording time need a preserved semantic context later. */
    requiresContext: boolean;
}

export interface CandidateScore {
    element: Element;
    score: number;
    identity: number;
    context: number;
    evidence: string[];
}

export interface Resolution {
    status: 'ambiguous' | 'broken' | 'resolved';
    element?: Element;
    strategy?: LocatorCandidate['kind'] | 'similarity';
    reason: string;
    candidates: CandidateScore[];
    attempts: Array<{kind: LocatorCandidate['kind']; count: number}>;
}

export type SemanticAction =
    | {
          kind: 'click' | 'input' | 'select';
          descriptor: ElementDescriptor;
          value?: string[] | boolean | string;
          redacted?: boolean;
          timestamp: number;
      }
    | {kind: 'navigation'; url: string; timestamp: number};

export interface ObservationOptions {
    excludedRoots?: readonly Element[];
}
