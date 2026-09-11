import {
    type CandidateEvidence,
    type ElementDescriptor,
    type IdentityFeatures,
    type LiveResolution,
    type Locator,
    type Resolution,
} from '../contracts';
import {CONTROLS, features, flags, normalize, OBSERVABLES} from '../dom/identity';

export interface ResolverOptions {
    includeStatic?: boolean;
    requireEnabled?: boolean;
    /** Explicit shell route pairs. No wildcard or automatic pathname relaxation. */
    routePairs?: ReadonlyArray<{recorded: string; current: string}>;
    threshold?: number;
    margin?: number;
    maxCandidates?: number;
}

interface Candidate {
    element: Element;
    features: IdentityFeatures;
    report: CandidateEvidence;
    eligible: boolean;
    compatible: boolean;
}

/** Token Dice, deterministic evidence strength, never a calibrated probability. */
export function namingSimilarity(left: string | null, right: string | null): number {
    const tokens = (value: string | null): Set<string> =>
        new Set(
            normalize(value)
                .toLowerCase()
                .match(/[\p{L}\p{N}]+/gu) ?? [],
        );

    const a = tokens(left),
        b = tokens(right);

    if (!a.size || !b.size) {
        return 0;
    }

    const normalizedLeft = normalize(left).toLowerCase();
    const normalizedRight = normalize(right).toLowerCase();

    if (normalizedLeft === normalizedRight) {
        return 1;
    }

    const intersection = Array.from(a).filter((token) => b.has(token)).length;

    // A bag of words loses ordering, repetition and punctuation (including +/-).
    // Never treat a changed string with the same bag as an exact identity match.
    if (a.size === b.size && intersection === a.size) {
        return 0;
    }

    const critical = (values: Set<string>): string =>
        Array.from(values)
            .filter(
                (token) =>
                    /\d/u.test(token) ||
                    ['no', 'not', 'without', 'без', 'не', 'нет'].includes(token),
            )
            .sort()
            .join('|');

    return critical(a) === critical(b) ? (2 * intersection) / (a.size + b.size) : 0;
}

function name(value: IdentityFeatures): string | null {
    return value.accessibleName || value.label || value.text || value.placeholder;
}

function contextMatches(
    expected: IdentityFeatures['context'],
    actual: IdentityFeatures['context'],
): boolean {
    return expected.every((entry) =>
        actual.some(
            (candidate) => candidate.role === entry.role && candidate.name === entry.name,
        ),
    );
}

function evidenceOutcome(
    match: boolean,
    exists: boolean,
): 'match' | 'mismatch' | 'missing' {
    if (match) {
        return 'match';
    }

    return exists ? 'mismatch' : 'missing';
}

function attemptOutcome(count: number): Resolution['attempts'][number]['outcome'] {
    if (count > 1) {
        return 'ambiguous';
    }

    return count ? 'rejected' : 'missing';
}

function score(
    expected: IdentityFeatures,
    actual: IdentityFeatures,
    id: string,
): CandidateEvidence & {compatible: boolean} {
    const evidence: CandidateEvidence['evidence'] = [];
    const expectedType = expected.attributes.type || 'text';
    const actualType = actual.attributes.type || 'text';
    const compatible =
        expected.role === actual.role &&
        (expected.role !== null || expected.tag === actual.tag) &&
        (expected.tag !== 'input' ||
            actual.tag !== 'input' ||
            expectedType === actualType);

    evidence.push({
        group: 'role-type',
        outcome: compatible ? 'match' : 'mismatch',
        detail: compatible
            ? 'Compatible semantic role and input type'
            : 'Role/type conflict',
    });
    const actualName = name(actual),
        expectedName = name(expected);

    const naming = namingSimilarity(expectedName, actualName);

    evidence.push({
        group: 'naming',
        outcome: evidenceOutcome(naming === 1, !!actualName),
        detail: `Correlated accessibleName/label/text/placeholder counted once: ${naming.toFixed(4)}`,
    });
    const keys = ['name', 'href'] as const;
    const known = keys.filter((key) => !!expected.attributes[key]);
    const conflict = known.some(
        (key) =>
            !!actual.attributes[key] &&
            actual.attributes[key] !== expected.attributes[key],
    );

    const attributes = known.length
        ? known.filter((key) => actual.attributes[key] === expected.attributes[key])
              .length / known.length
        : 0;

    evidence.push({
        group: 'attributes',
        outcome: evidenceOutcome(!conflict && attributes === 1, conflict),
        detail: conflict
            ? 'Existing name/href changed: identity conflict'
            : `Independent name/href evidence: ${attributes.toFixed(4)}`,
    });
    const context =
        expected.context.length > 0 && contextMatches(expected.context, actual.context);

    evidence.push({
        group: 'context',
        outcome: evidenceOutcome(context, actual.context.length > 0),
        detail: context
            ? 'Recorded semantic context retained'
            : 'Recorded context missing or changed',
    });
    // Type, tag, generic attributes, CSS and position do not earn identity points.
    const weight =
        (expectedName ? 0.7 : 0) +
        (expected.context.length ? 0.2 : 0) +
        (known.length ? 0.1 : 0);

    const enoughIdentity = expectedName
        ? naming >= (attributes === 1 ? 0.75 : 0.9)
        : attributes === 1;

    const value =
        compatible && !conflict && enoughIdentity && weight
            ? (0.7 * naming + 0.2 * Number(context) + 0.1 * attributes) / weight
            : 0;

    return {
        id,
        summary: {tag: actual.tag, role: actual.role, name: actualName},
        score: Math.min(1, value),
        evidence,
        compatible: compatible && !conflict,
    };
}

function matches(locator: Locator, candidate: Candidate, root: Element): boolean {
    const identity = candidate.features;

    switch (locator.kind) {
        case 'attribute':
            return identity.attributes[locator.name] === locator.value;
        case 'css':
            return Array.from(root.querySelectorAll(locator.value)).includes(
                candidate.element,
            );
        case 'label':
        case 'placeholder':
        case 'text':
            return identity[locator.kind] === locator.value;
        case 'role':
            return (
                identity.role === locator.role && identity.accessibleName === locator.name
            );
    }
}

function visible(element: Element, root: Element): boolean {
    if (!flags(element).visible || element.closest('[inert]')) {
        return false;
    }

    for (
        let parent = element.parentElement;
        parent && root.contains(parent);
        parent = parent.parentElement
    ) {
        if (
            parent.matches('details:not([open])') &&
            !parent.querySelector(':scope > summary')?.contains(element)
        ) {
            return false;
        }
    }

    return true;
}

export class ElementResolver {
    private readonly includeStatic: boolean;
    private readonly requireEnabled: boolean;
    private readonly threshold: number;
    private readonly margin: number;
    private readonly maxCandidates: number;
    private readonly routePairs: ReadonlyArray<{recorded: string; current: string}>;

    constructor(options: ResolverOptions = {}) {
        this.includeStatic = options.includeStatic ?? false;
        this.requireEnabled = options.requireEnabled ?? true;
        this.threshold = options.threshold ?? 0.9;
        this.margin = options.margin ?? 0.12;
        this.maxCandidates = options.maxCandidates ?? 2000;
        this.routePairs = (options.routePairs ?? []).map((pair) => ({...pair}));

        if (
            !Number.isFinite(this.threshold) ||
            this.threshold <= 0 ||
            this.threshold > 1 ||
            !Number.isFinite(this.margin) ||
            this.margin <= 0 ||
            this.margin > 1 ||
            !Number.isInteger(this.maxCandidates) ||
            this.maxCandidates < 1
        ) {
            throw new Error('Invalid resolver limits');
        }
    }

    /** Accepts a v2 descriptor from the validated recording/scenario boundary. No retained DOM references. */
    public resolve(descriptor: ElementDescriptor, root: Element): LiveResolution {
        const base = {
            kind: 'element-resolution' as const,
            version: 2 as const,
            targetId: descriptor.id,
            candidates: [] as CandidateEvidence[],
            attempts: [] as Resolution['attempts'],
        };

        const broken = (
            reason: Extract<Resolution, {status: 'broken'}>['reason'],
        ): LiveResolution => ({report: {...base, status: 'broken', reason}});

        if (
            descriptor.version !== 2 ||
            descriptor.fingerprint.algorithm !== 'semantic-features-v1' ||
            descriptor.fingerprint.normalization !== 'nfc-whitespace-v1'
        ) {
            return broken('unsupported');
        }

        const pathname = root.ownerDocument.location?.pathname;

        if (
            pathname !== descriptor.scope.pathname &&
            !this.routePairs.some(
                (pair) =>
                    pair.recorded === descriptor.scope.pathname &&
                    pair.current === pathname,
            )
        ) {
            return broken('scope-mismatch');
        }

        if (!root.isConnected) {
            return broken('not-found');
        }

        const elements = Array.from(
            root.querySelectorAll(this.includeStatic ? OBSERVABLES : CONTROLS),
        );

        if (elements.length > this.maxCandidates) {
            return broken('unsupported');
        }

        const pool: Candidate[] = elements
            .filter((element) => visible(element, root))
            .map((element, index) => {
                const identity = features(element, root);
                const {compatible, ...report} = score(
                    descriptor.fingerprint.features,
                    identity,
                    `candidate-${index + 1}`,
                );

                return {
                    element,
                    features: identity,
                    report,
                    compatible,
                    eligible: !this.requireEnabled || flags(element).enabled,
                };
            });
        // Scope is a boundary: moving across named business contexts is not an automatic repair.
        const scope = descriptor.scope.context;

        if (descriptor.contextRequired && !scope.length) {
            return broken('insufficient-evidence');
        }

        const scoped = pool.filter((candidate) =>
            contextMatches(scope, candidate.features.context),
        );

        const sorted = [...scoped].sort((a, b) => b.report.score - a.report.score);

        base.candidates = sorted.slice(0, 5).map((candidate) => candidate.report);
        const found = new Map<string, Candidate[]>();
        const locators = [...descriptor.locators].sort(
            (a, b) =>
                Number(a.selector.kind === 'css') - Number(b.selector.kind === 'css'),
        );

        for (const locator of locators) {
            try {
                const candidates = scoped.filter((candidate) =>
                    matches(locator.selector, candidate, root),
                );

                found.set(locator.id, candidates);
                base.attempts.push({
                    locatorId: locator.id,
                    count: candidates.length,
                    outcome: attemptOutcome(candidates.length),
                });
            } catch {
                base.attempts.push({
                    locatorId: locator.id,
                    count: 0,
                    outcome: 'rejected',
                });
            }
        }

        if (!pool.length) {
            return broken('not-found');
        }

        if (!scoped.length) {
            return broken(scope.length ? 'scope-mismatch' : 'not-found');
        }

        const best = sorted[0]!;

        if (best.report.score < this.threshold) {
            return broken(
                scoped.some(
                    (candidate) =>
                        !candidate.compatible &&
                        name(candidate.features) ===
                            name(descriptor.fingerprint.features),
                )
                    ? 'identity-conflict'
                    : 'insufficient-evidence',
            );
        }

        const second = sorted[1];

        // Include disabled competing candidates; availability never resolves an identity tie.
        if (second && best.report.score - second.report.score < this.margin) {
            return {
                report: {
                    ...base,
                    status: 'ambiguous',
                    reason: scope.length ? 'duplicate-context' : 'near-tie',
                },
            };
        }

        if (!best.eligible) {
            return broken('insufficient-evidence');
        }

        const accepted = locators.find((locator) => {
            const candidates = found.get(locator.id);

            return candidates?.length === 1 && candidates[0] === best;
        });

        if (accepted) {
            base.attempts.find((attempt) => attempt.locatorId === accepted.id)!.outcome =
                'accepted';
        }

        let strategy: Extract<Resolution, {status: 'resolved'}>['strategy'] =
            'similarity';

        if (accepted) {
            strategy = accepted.selector.kind === 'css' ? 'css-verified' : 'semantic';
        }

        return {
            report: {
                ...base,
                status: 'resolved',
                selectedCandidateId: best.report.id,
                strategy,
            },
            element: best.element,
        };
    }
}
