import {elements, fingerprint, normalize} from './dom';
import {
    type CandidateScore,
    type ElementDescriptor,
    type Fingerprint,
    type LocatorCandidate,
    type ObservationOptions,
    type Resolution,
} from './model';

/** Token Dice. A deterministic similarity, NOT a calibrated probability. */
export function similarity(a: string, b: string): number {
    if (!a || !b) {
        return 0;
    }

    if (a === b) {
        return 1;
    }

    const tokens = (value: string): Set<string> =>
        new Set(
            normalize(value)
                .toLowerCase()
                .match(/[\p{L}\p{N}]+/gu) ?? [],
        );

    const left = tokens(a),
        right = tokens(b);

    return !left.size || !right.size
        ? 0
        : (2 * [...left].filter((token) => right.has(token)).length) /
              (left.size + right.size);
}

export function scoreFingerprint(
    expected: Fingerprint,
    actual: Fingerprint,
): Omit<CandidateScore, 'element'> {
    if (
        expected.role !== actual.role ||
        (expected.attributes['type'] ?? '') !== (actual.attributes['type'] ?? '')
    ) {
        return {score: 0, identity: 0, context: 0, evidence: ['incompatible role/type']};
    }

    const evidence: string[] = [];
    const pairs: Array<[string, string, string]> = [
        ['accessibleName', expected.accessibleName, actual.accessibleName],
        ['text', expected.text, actual.text],
        ['label', expected.label, actual.label],
        ['placeholder', expected.placeholder, actual.placeholder],
        ...['name', 'href', 'alt', 'title'].map(
            (key) =>
                [key, expected.attributes[key] ?? '', actual.attributes[key] ?? ''] as [
                    string,
                    string,
                    string,
                ],
        ),
    ];
    // Correlated name/label/text count once, not as three independent votes.
    const identity = Math.max(
        0,
        ...pairs.map(([key, a, b]) => {
            const score = ['href', 'name'].includes(key)
                ? Number(!!a && a === b)
                : similarity(a, b);

            if (score) {
                evidence.push(`${key}:${score.toFixed(3)}`);
            }

            return score;
        }),
    );

    const context = expected.context.length
        ? Number(actual.context.includes(expected.context[0]!))
        : 0;

    const denominator = expected.context.length ? 100 : 80;
    const score =
        (20 +
            5 * Number(expected.tag === actual.tag) +
            5 +
            50 * identity +
            20 * context) /
        denominator;

    if (context) {
        evidence.push('semantic context');
    }

    return {score, identity, context, evidence};
}

function matches(locator: LocatorCandidate, element: Element, fp: Fingerprint): boolean {
    switch (locator.kind) {
        case 'attribute':
            return fp.attributes[locator.name] === locator.value;
        case 'label':
            return fp.label === locator.value;
        case 'placeholder':
            return fp.placeholder === locator.value;
        case 'role':
            return (
                fp.role === locator.role &&
                fp.accessibleName === locator.name &&
                (!locator.context || fp.context.includes(locator.context))
            );
        case 'text':
            return fp.text === locator.value;
        case 'css':
            try {
                return element.matches(locator.value);
            } catch {
                return false;
            }
    }
}

export class ElementResolver {
    constructor(
        private readonly options: ObservationOptions & {
            threshold?: number;
            margin?: number;
        } = {},
    ) {}

    public resolve(descriptor: ElementDescriptor, root: Document | Element): Resolution {
        const attempts: Resolution['attempts'] = [];
        const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;

        if (descriptor.version !== 1 || descriptor.page !== doc.location.pathname) {
            return {
                status: 'broken',
                reason: 'Unsupported descriptor version or different route',
                candidates: [],
                attempts,
            };
        }

        const pool = elements(root, this.options).map((element) => ({
            element,
            fp: fingerprint(element, root),
        }));

        const uniqueMatches: Array<{kind: LocatorCandidate['kind']; element: Element}> =
            [];

        for (const locator of descriptor.locators) {
            const found = pool.filter(({element, fp}) => matches(locator, element, fp));

            attempts.push({kind: locator.kind, count: found.length});

            if (found.length === 1) {
                uniqueMatches.push({kind: locator.kind, element: found[0]!.element});
            }
        }

        const candidates = pool
            .map(({element, fp}) => ({
                element,
                ...scoreFingerprint(descriptor.fingerprint, fp),
            }))
            .filter(
                (candidate) =>
                    candidate.identity >= 0.65 &&
                    (!descriptor.requiresContext || candidate.context === 1),
            )
            .sort((a, b) => b.score - a.score);

        const best = candidates[0],
            second = candidates[1];

        if (!best || best.score < (this.options.threshold ?? 0.8)) {
            return {
                status: 'broken',
                reason: 'Insufficient identity evidence or lost required context',
                candidates: candidates.slice(0, 5),
                attempts,
            };
        }

        if (second && best.score - second.score < (this.options.margin ?? 0.12)) {
            return {
                status: 'ambiguous',
                reason: 'Top candidates are too close; DOM order cannot break a tie',
                candidates: candidates.slice(0, 5),
                attempts,
            };
        }

        const strategy =
            uniqueMatches.find((match) => match.element === best.element)?.kind ??
            'similarity';

        return {
            status: 'resolved',
            element: best.element,
            strategy,
            reason: 'Identity threshold and separation passed',
            candidates: candidates.slice(0, 5),
            attempts,
        };
    }
}
