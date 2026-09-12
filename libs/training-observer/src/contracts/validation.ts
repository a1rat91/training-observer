/**
 * Граница JSON-контрактов: строгая проверка Recording, Scenario и диагностических результатов.
 * Алгоритм: проверяет форму и допустимые значения полей, затем ссылки/уникальность и ограничения документа.
 * Parse читает JSON и вызывает validation; serialize валидирует данные перед преобразованием в JSON.
 * Некорректные документы отклоняются через ContractError с путём ошибки; неизвестные поля не игнорируются.
 */
import {
    type AreaBindings,
    type CapturedValue,
    type ElementDescriptor,
    type Recording,
    type Resolution,
    type Scenario,
    type TargetWaitState,
} from './types';

type Check = (value: unknown, path: string) => void;
export class ContractError extends Error {
    constructor(
        public readonly path: string,
        message: string,
    ) {
        super(`${path}: ${message}`);
        this.name = 'ContractError';
    }
}

function fail(path: string, message: string): never {
    throw new ContractError(path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail(path, 'expected object');
    }

    return value as Record<string, unknown>;
}

const text: Check = (value, path) => {
    if (typeof value !== 'string') {
        fail(path, 'expected string');
    }
};

const id: Check = (value, path) => {
    text(value, path);

    if (!(value as string).trim()) {
        fail(path, 'must not be empty');
    }
};

const bool: Check = (value, path) => {
    if (typeof value !== 'boolean') {
        fail(path, 'expected boolean');
    }
};

const number: Check = (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(path, 'expected finite number');
    }
};

const nonnegative: Check = (value, path) => {
    number(value, path);

    if ((value as number) < 0) {
        fail(path, 'must be nonnegative');
    }
};

const count: Check = (value, path) => {
    nonnegative(value, path);

    if (!Number.isInteger(value)) {
        fail(path, 'expected integer');
    }
};

const positive: Check = (value, path) => {
    count(value, path);

    if (value === 0) {
        fail(path, 'must be positive');
    }
};

const score: Check = (value, path) => {
    nonnegative(value, path);

    if ((value as number) > 1) {
        fail(path, 'must be <= 1');
    }
};

const pathname: Check = (value, path) => {
    text(value, path);

    if (!/^\/[^?#]*$/.test(value as string)) {
        fail(path, 'expected pathname without query or hash');
    }
};

const one =
    (...values: readonly unknown[]): Check =>
    (value, path) => {
        if (!values.includes(value)) {
            fail(path, `expected one of ${JSON.stringify(values)}`);
        }
    };

const nullable =
    (check: Check): Check =>
    (value, path) => {
        if (value !== null) {
            check(value, path);
        }
    };

const array =
    (check: Check, minimum = 0, maximum = 10000): Check =>
    (value, path) => {
        if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
            fail(path, `expected array length ${minimum}..${maximum}`);
        }

        value.forEach((entry: unknown, index: number) =>
            check(entry, `${path}[${index}]`),
        );
    };

function object(
    required: Record<string, Check>,
    optional: Record<string, Check> = {},
): Check {
    return (value, path) => {
        const entry = record(value, path);

        for (const key of Object.keys(entry)) {
            if (
                !Object.prototype.hasOwnProperty.call(required, key) &&
                !Object.prototype.hasOwnProperty.call(optional, key)
            ) {
                fail(`${path}.${key}`, 'unknown field');
            }
        }

        for (const [key, check] of Object.entries(required)) {
            check(entry[key], `${path}.${key}`);
        }

        for (const [key, check] of Object.entries(optional)) {
            if (Object.prototype.hasOwnProperty.call(entry, key)) {
                check(entry[key], `${path}.${key}`);
            }
        }
    };
}

function tagged(key: string, variants: Record<string, Check>): Check {
    return (value, path) => {
        const tag = record(value, path)[key];

        if (
            typeof tag !== 'string' ||
            !Object.prototype.hasOwnProperty.call(variants, tag)
        ) {
            fail(`${path}.${key}`, 'unknown discriminator');
        }

        variants[tag]!(value, path);
    };
}

const attributes = object(
    {},
    Object.fromEntries(
        ['name', 'type', 'title', 'alt', 'href', 'autocomplete'].map((key) => [
            key,
            text,
        ]),
    ),
);

const attributeName = one('name', 'type', 'title', 'alt', 'href', 'autocomplete');
const context = array(object({role: nullable(id), name: id}), 0, 12);
const features = object({
    tag: id,
    role: nullable(id),
    accessibleName: nullable(text),
    label: nullable(text),
    text: nullable(text),
    placeholder: nullable(text),
    attributes,
    context,
});

const exactText = (kind: string): Check =>
    object({kind: one(kind), value: id, exact: one(true)});

const locator = tagged('kind', {
    role: object({kind: one('role'), role: id, name: nullable(text), exact: one(true)}),
    label: exactText('label'),
    text: exactText('text'),
    placeholder: exactText('placeholder'),
    attribute: object({
        kind: one('attribute'),
        name: attributeName,
        value: id,
        exact: one(true),
    }),
    css: object({kind: one('css'), value: id}),
});

const descriptor = object({
    version: one(2),
    id,
    scope: object({pathname, context}),
    fingerprint: object({
        algorithm: one('semantic-features-v1'),
        normalization: one('nfc-whitespace-v1'),
        features,
    }),
    locators: array(object({id, selector: locator, recordedMatches: positive}), 1, 32),
    contextRequired: bool,
});

const value: Check = (entry, path) => {
    if (typeof entry === 'string' || typeof entry === 'boolean') {
        return;
    }

    array(text, 0, 1000)(entry, path);
};

const isoDate: Check = (entry, path) => {
    text(entry, path);
    const date = entry as string;

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
    ) {
        fail(path, 'expected valid YYYY-MM-DD');
    }
};

const normalized = tagged('rule', {
    'decimal-comma-v1': object({rule: one('decimal-comma-v1'), value: number}),
    'date-dmy-v1': object({rule: one('date-dmy-v1'), value: isoDate}),
});

const captured = tagged('status', {
    captured: object({status: one('captured'), raw: value}, {normalized}),
    omitted: object({status: one('omitted'), reason: one('policy')}),
    redacted: object({status: one('redacted'), reason: one('sensitive')}),
    unavailable: object({
        status: one('unavailable'),
        reason: one('unsupported', 'detached'),
    }),
});

const mode = tagged('kind', {
    'dom-only': object({kind: one('dom-only')}),
    'shared-adapter': object({
        kind: one('shared-adapter'),
        adapterId: id,
        adapterVersion: id,
    }),
});

const actionBase = {
    id,
    sequence: positive,
    timeMs: nonnegative,
    evidence: object({
        trigger: one('pointer', 'keyboard', 'input', 'change', 'navigation'),
        trusted: nullable(bool),
    }),
};

const action = tagged('kind', {
    click: object({...actionBase, kind: one('click'), targetId: id}),
    input: object({
        ...actionBase,
        kind: one('input'),
        targetId: id,
        commit: one('blur', 'change', 'idle'),
        value: captured,
    }),
    select: object({
        ...actionBase,
        kind: one('select'),
        targetId: id,
        commit: one('change', 'confirmed-selection'),
        value: captured,
    }),
    navigation: object({...actionBase, kind: one('navigation'), pathname}),
});

const state = object({
    targetId: id,
    timeMs: nonnegative,
    source: one('snapshot', 'native-event', 'property-observer', 'mutation'),
    connected: bool,
    visible: nullable(bool),
    enabled: nullable(bool),
    readOnly: nullable(bool),
    value: captured,
});

const hostTag: Check = (value, path) => {
    id(value, path);

    if (!/^[a-z][a-z0-9-]*$/.test(value as string)) {
        fail(path, 'expected a tag name, not a selector');
    }
};

const contextAttributes: Check = (value, path) => {
    const attributes = record(value, path);

    if (Object.keys(attributes).length > 32) {
        fail(path, 'too many context attributes');
    }

    for (const [name, entry] of Object.entries(attributes)) {
        if (!/^[a-z_][\w.:-]*$/i.test(name)) {
            fail(path, 'invalid attribute name');
        }

        text(entry, `${path}.${name}`);
    }
};

const areaBindings = object({
    definitions: array(
        object(
            {key: id, hostTag, observe: bool},
            {context: object({ancestorTag: hostTag, attributes: contextAttributes})},
        ),
        1,
        100,
    ),
    targets: array(object({targetId: id, areaKey: id})),
});

function versioned(shape: (version: 2 | 3) => Check): Check {
    return (value, path) => {
        const version = record(value, path).version;

        one(2, 3)(version, `${path}.version`);
        shape(version as 2 | 3)(value, path);
    };
}

function bindingsValid(areas: AreaBindings, ids: Set<string>): void {
    const keys = unique(
        areas.definitions.map((entry) => entry.key),
        '$.areas.definitions',
    );

    const targets = unique(
        areas.targets.map((entry) => entry.targetId),
        '$.areas.targets',
    );

    for (const [index, entry] of areas.targets.entries()) {
        targetExists(entry.targetId, ids, `$.areas.targets[${index}].targetId`);

        if (!keys.has(entry.areaKey)) {
            fail(`$.areas.targets[${index}].areaKey`, 'unknown area');
        }

        if (
            !areas.definitions.find((definition) => definition.key === entry.areaKey)!
                .observe
        ) {
            fail(`$.areas.targets[${index}].areaKey`, 'target area must be enabled');
        }
    }

    if (targets.size !== ids.size) {
        fail('$.areas.targets', 'every descriptor requires exactly one area');
    }
}

const recordingShape = (version: 2 | 3): Check =>
    object(
        {
            kind: one('training-recording'),
            version: one(version),
            ...(version === 3 ? {areas: areaBindings} : {}),
            id,
            mode,
            valuePolicy: object({
                mode: one('omit', 'capture'),
                sensitive: one('redact'),
                normalizers: array(one('decimal-comma-v1', 'date-dmy-v1'), 0, 2),
            }),
            descriptors: array(descriptor),
            actions: array(action),
            states: array(state),
        },
        {
            diagnostics: array(
                object({
                    timeMs: nonnegative,
                    code: one(
                        'unsupported-control',
                        'ambiguous-owner',
                        'unconfirmed-selection',
                        'composition-cancelled',
                        'capacity-reached',
                    ),
                    message: id,
                }),
                0,
                100,
            ),
        },
    );

const expectedAction = tagged('kind', {
    click: object({kind: one('click'), targetId: id}),
    input: object({kind: one('input'), targetId: id}),
    select: object({kind: one('select'), targetId: id}),
    navigation: object({kind: one('navigation'), pathname}),
});

const valueCondition = tagged('kind', {
    'raw-equals': object({kind: one('raw-equals'), value}),
    'normalized-equals': object({kind: one('normalized-equals'), normalized}),
});

function condition(entry: unknown, path: string): void {
    tagged('kind', {
        visible: object({kind: one('visible'), targetId: id, expected: bool}),
        value: object({kind: one('value'), targetId: id, condition: valueCondition}),
        pathname: object({kind: one('pathname'), value: pathname}),
        all: object({kind: one('all'), conditions: array(condition, 1, 32)}),
        any: object({kind: one('any'), conditions: array(condition, 1, 32)}),
    })(entry, path);
}

const step = object({
    id,
    instruction: id,
    hint: nullable(text),
    optional: bool,
    action: expectedAction,
    completion: condition,
    branches: array(object({when: condition, nextStepId: id}), 0, 32),
    nextStepId: nullable(id),
});

const scenarioShape = (version: 2 | 3): Check =>
    object({
        kind: one('training-scenario'),
        version: one(version),
        ...(version === 3 ? {areas: areaBindings} : {}),
        id,
        mode,
        descriptors: array(descriptor),
        startStepId: id,
        completion: condition,
        steps: array(step, 1, 1000),
    });

const candidate = object({
    id,
    summary: object({tag: id, role: nullable(id), name: nullable(text)}),
    score,
    evidence: array(
        object({
            group: one('naming', 'role-type', 'attributes', 'context'),
            outcome: one('match', 'mismatch', 'missing'),
            detail: id,
        }),
    ),
});

const resolutionBase = {
    kind: one('element-resolution'),
    version: one(2),
    targetId: id,
    candidates: array(candidate, 0, 1000),
    attempts: array(
        object({
            locatorId: id,
            count,
            outcome: one('accepted', 'rejected', 'ambiguous', 'missing'),
        }),
    ),
};

const resolution = tagged('status', {
    resolved: object({
        ...resolutionBase,
        status: one('resolved'),
        selectedCandidateId: id,
        strategy: one('semantic', 'css-verified', 'similarity'),
    }),
    ambiguous: object({
        ...resolutionBase,
        status: one('ambiguous'),
        reason: one('near-tie', 'duplicate-context'),
    }),
    broken: object({
        ...resolutionBase,
        status: one('broken'),
        reason: one(
            'not-found',
            'insufficient-evidence',
            'identity-conflict',
            'scope-mismatch',
            'unsupported',
        ),
    }),
});

const waitBase = {kind: one('target-wait'), version: one(2)};
const waitState = tagged('status', {
    waiting: object({
        ...waitBase,
        status: one('waiting'),
        targetId: id,
        sinceMs: nonnegative,
        deadlineMs: nonnegative,
        reason: one('not-yet-present', 'not-stable'),
    }),
    ready: object({...waitBase, status: one('ready'), resolution}),
    ambiguous: object({...waitBase, status: one('ambiguous'), resolution}),
    broken: object({...waitBase, status: one('broken'), resolution}),
    'timed-out': object({
        ...waitBase,
        status: one('timed-out'),
        targetId: id,
        deadlineMs: nonnegative,
    }),
    cancelled: object({
        ...waitBase,
        status: one('cancelled'),
        targetId: id,
        reason: one('step-changed', 'reset', 'stopped', 'unmounted'),
    }),
});

/** Reject lossy JSON conversion (DOM, Date, Map, functions, accessors, cycles, undefined). */
function jsonOnly(value: unknown): void {
    const active = new Set<object>();
    let nodes = 0;

    function visit(entry: unknown, path: string, depth: number): void {
        if (++nodes > 100000 || depth > 40) {
            fail(path, 'document complexity limit exceeded');
        }

        if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') {
            return;
        }

        if (typeof entry === 'number') {
            number(entry, path);

            return;
        }

        if (typeof entry !== 'object') {
            fail(path, 'not a JSON value');
        }

        if (active.has(entry)) {
            fail(path, 'cyclic reference');
        }

        if (
            !Array.isArray(entry) &&
            Object.getPrototypeOf(entry) !== Object.prototype &&
            Object.getPrototypeOf(entry) !== null
        ) {
            fail(path, 'expected plain JSON object');
        }

        active.add(entry);

        if (Array.isArray(entry) && Object.keys(entry).length !== entry.length) {
            fail(path, 'sparse or decorated array');
        }

        for (const key of Reflect.ownKeys(entry)) {
            if (Array.isArray(entry) && key === 'length') {
                continue;
            }

            if (typeof key !== 'string') {
                fail(path, 'symbol key is not JSON');
            }

            if (Array.isArray(entry) && !/^(?:0|[1-9]\d*)$/.test(key)) {
                fail(path, 'named array property is not JSON');
            }

            const property = Object.getOwnPropertyDescriptor(entry, key)!;

            if (!('value' in property) || !property.enumerable) {
                fail(`${path}.${key}`, 'accessor or hidden property is not JSON');
            }

            visit(property.value, `${path}.${key}`, depth + 1);
        }

        active.delete(entry);
    }

    visit(value, '$', 0);
}

function unique(ids: readonly string[], path: string): Set<string> {
    const result = new Set(ids);

    if (result.size !== ids.length) {
        fail(path, 'duplicate id');
    }

    return result;
}

function descriptorsValid(descriptors: ElementDescriptor[]): Set<string> {
    const ids = unique(
        descriptors.map((entry) => entry.id),
        '$.descriptors',
    );

    descriptors.forEach((entry, index) => {
        unique(
            entry.locators.map((item) => item.id),
            `$.descriptors[${index}].locators`,
        );

        if (
            entry.contextRequired &&
            !entry.scope.context.length &&
            !entry.fingerprint.features.context.length
        ) {
            fail(`$.descriptors[${index}]`, 'required context is absent');
        }
    });

    return ids;
}

function targetExists(targetId: string, ids: Set<string>, path: string): void {
    if (!ids.has(targetId)) {
        fail(path, `unknown target ${targetId}`);
    }
}

function read<T>(value: unknown, shape: Check, check: (typed: T) => void): T {
    jsonOnly(value);
    shape(value, '$');
    const typed = value as T;

    check(typed);

    return typed;
}

function checkValue(value: CapturedValue, document: Recording, targetId: string): void {
    if (value.status !== 'captured') {
        return;
    }

    const attributes = document.descriptors.find((entry) => entry.id === targetId)!
        .fingerprint.features.attributes;

    if (
        ['file', 'password'].includes(attributes.type ?? '') ||
        /current-password|new-password|one-time-code/.test(attributes.autocomplete ?? '')
    ) {
        fail('$.value', 'sensitive target requires redaction');
    }

    if (document.valuePolicy.mode !== 'capture') {
        fail('$.valuePolicy', 'captured value contradicts omit policy');
    }

    if (
        value.normalized &&
        (typeof value.raw !== 'string' ||
            !document.valuePolicy.normalizers.includes(value.normalized.rule))
    ) {
        fail(
            '$.valuePolicy.normalizers',
            'normalization requires text and an enabled rule',
        );
    }
}

export function readRecording(value: unknown): Recording {
    return read<Recording>(value, versioned(recordingShape), (document) => {
        const ids = descriptorsValid(document.descriptors);

        if (document.version === 3) {
            bindingsValid(document.areas, ids);
        }

        unique(
            document.actions.map((entry) => entry.id),
            '$.actions',
        );
        unique(document.valuePolicy.normalizers, '$.valuePolicy.normalizers');
        let sequence = 0;
        let time = 0;

        document.actions.forEach((entry, index) => {
            if (entry.sequence <= sequence || entry.timeMs < time) {
                fail(
                    `$.actions[${index}]`,
                    'actions must be ordered by sequence and monotonic time',
                );
            }

            sequence = entry.sequence;
            time = entry.timeMs;

            if (entry.kind !== 'navigation') {
                targetExists(entry.targetId, ids, `$.actions[${index}].targetId`);
            }

            if ('value' in entry) {
                checkValue(entry.value, document, entry.targetId);
            }
        });
        time = 0;
        document.states.forEach((entry, index) => {
            targetExists(entry.targetId, ids, `$.states[${index}].targetId`);

            if (entry.timeMs < time) {
                fail(`$.states[${index}]`, 'state observations must be time-ordered');
            }

            time = entry.timeMs;

            if (!entry.connected && entry.visible === true) {
                fail(`$.states[${index}]`, 'detached element cannot be visible');
            }

            checkValue(entry.value, document, entry.targetId);
        });
    });
}
export function readScenario(value: unknown): Scenario {
    return read<Scenario>(value, versioned(scenarioShape), (document) => {
        const ids = descriptorsValid(document.descriptors);

        if (document.version === 3) {
            bindingsValid(document.areas, ids);
        }

        const steps = unique(
            document.steps.map((entry) => entry.id),
            '$.steps',
        );

        if (!steps.has(document.startStepId)) {
            fail('$.startStepId', 'unknown start step');
        }

        const checkCondition = (entry: Scenario['steps'][number]['completion']): void => {
            if ('targetId' in entry) {
                targetExists(entry.targetId, ids, '$.steps.completion');
            }

            if ('conditions' in entry) {
                entry.conditions.forEach(checkCondition);
            }
        };

        checkCondition(document.completion);

        for (const entry of document.steps) {
            if ('targetId' in entry.action) {
                targetExists(entry.action.targetId, ids, '$.steps.action');
            }

            checkCondition(entry.completion);

            if (entry.nextStepId !== null && !steps.has(entry.nextStepId)) {
                fail('$.steps.nextStepId', 'unknown next step');
            }

            for (const branch of entry.branches) {
                checkCondition(branch.when);

                if (!steps.has(branch.nextStepId)) {
                    fail('$.steps.branches', 'unknown branch step');
                }
            }
        }
    });
}
export function readResolution(value: unknown): Resolution {
    return read<Resolution>(value, resolution, (report) => {
        const ids = unique(
            report.candidates.map((entry) => entry.id),
            '$.candidates',
        );

        if (report.status === 'resolved' && !ids.has(report.selectedCandidateId)) {
            fail('$.selectedCandidateId', 'candidate is absent');
        }

        if (report.status === 'ambiguous' && ids.size < 2) {
            fail('$.candidates', 'ambiguity requires at least two candidates');
        }
    });
}
export function readTargetWaitState(value: unknown): TargetWaitState {
    return read<TargetWaitState>(value, waitState, (state) => {
        if (state.status === 'waiting' && state.deadlineMs < state.sinceMs) {
            fail('$.deadlineMs', 'deadline precedes start');
        }

        if ('resolution' in state) {
            const report = readResolution(state.resolution);
            const expected = state.status === 'ready' ? 'resolved' : state.status;

            if (report.status !== expected) {
                fail('$.resolution.status', 'inconsistent wait state');
            }
        }
    });
}

function parse<T>(textValue: string, reader: (value: unknown) => T): T {
    if (textValue.length > 1000000) {
        fail('$', 'JSON text exceeds 1,000,000 characters');
    }

    let value: unknown;

    try {
        value = JSON.parse(textValue);
    } catch {
        fail('$', 'invalid JSON');
    }

    return reader(value);
}

export function parseRecording(textValue: string): Recording {
    return parse(textValue, readRecording);
}
export function parseScenario(textValue: string): Scenario {
    return parse(textValue, readScenario);
}
export function serializeRecording(value: unknown): string {
    const textValue = JSON.stringify(readRecording(value));

    parseRecording(textValue);

    return textValue;
}
export function serializeScenario(value: unknown): string {
    const textValue = JSON.stringify(readScenario(value));

    parseScenario(textValue);

    return textValue;
}
