import {
    type CapturedValue,
    type Condition,
    type Scenario,
    type ValueCondition,
} from '../contracts';
import {readValue} from '../recording/dom';
import {ElementResolver, type ResolverOptions} from '../resolution';

export type Truth = 'false' | 'true' | 'unknown';
export function valueMatches(value: CapturedValue, condition: ValueCondition): boolean {
    if (value.status !== 'captured') {
        return false;
    }

    return condition.kind === 'raw-equals'
        ? JSON.stringify(value.raw) === JSON.stringify(condition.value)
        : value.normalized?.rule === condition.normalized.rule &&
              value.normalized.value === condition.normalized.value;
}

function combine(kind: 'all' | 'any', values: Truth[]): Truth {
    if (kind === 'all' && values.includes('false')) {
        return 'false';
    }

    if (kind === 'any' && values.includes('true')) {
        return 'true';
    }

    if (values.includes('unknown')) {
        return 'unknown';
    }

    return kind === 'all' ? 'true' : 'false';
}

/** Validate the event's committed value, not a subsequent programmatic replacement. */
export function actionValueMatches(
    condition: Condition,
    targetId: string,
    value: CapturedValue,
): boolean {
    if (condition.kind === 'value' && condition.targetId === targetId) {
        return valueMatches(value, condition.condition);
    }

    if (condition.kind === 'all') {
        return condition.conditions.every((item) =>
            actionValueMatches(item, targetId, value),
        );
    }

    return condition.kind === 'any'
        ? condition.conditions.some((item) => actionValueMatches(item, targetId, value))
        : true;
}
export class Conditions {
    private readonly resolver: ElementResolver;

    constructor(
        private readonly scenario: Scenario,
        private readonly root: Element,
        private readonly options: ResolverOptions = {},
    ) {
        this.resolver = new ElementResolver({
            ...options,
            requireEnabled: false,
            includeStatic: true,
        });
    }

    public pathname(path: string): boolean {
        const current = this.root.ownerDocument.location.pathname;

        return (
            current === path ||
            !!this.options.routePairs?.some(
                (pair) => pair.recorded === path && pair.current === current,
            )
        );
    }

    public evaluate(
        condition: Condition,
        committed?: {targetId: string; value: CapturedValue},
    ): Truth {
        if (!this.root.isConnected) {
            return 'unknown';
        }

        if ('conditions' in condition) {
            return combine(
                condition.kind,
                condition.conditions.map((item) => this.evaluate(item, committed)),
            );
        }

        if (condition.kind === 'pathname') {
            return this.pathname(condition.value) ? 'true' : 'false';
        }

        if (condition.kind === 'value' && committed?.targetId === condition.targetId) {
            return valueMatches(committed.value, condition.condition) ? 'true' : 'false';
        }

        const descriptor = this.scenario.descriptors.find(
            (item) => item.id === condition.targetId,
        )!;

        if (!this.pathname(descriptor.scope.pathname)) {
            return 'unknown';
        }

        const result = this.resolver.resolve(descriptor, this.root);

        if (result.report.status !== 'resolved' || !result.element) {
            if (
                condition.kind === 'visible' &&
                result.report.status === 'broken' &&
                ['not-found', 'scope-mismatch'].includes(result.report.reason)
            ) {
                return condition.expected ? 'false' : 'true';
            }

            return 'unknown';
        }

        if (condition.kind === 'visible') {
            return condition.expected ? 'true' : 'false';
        }

        const value = readValue(result.element, {
            mode: 'capture',
            sensitive: 'redact',
            normalizers: ['decimal-comma-v1', 'date-dmy-v1'],
        });

        if (value.status !== 'captured') {
            return 'unknown';
        }

        return valueMatches(value, condition.condition) ? 'true' : 'false';
    }
}
