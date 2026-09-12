import {
    ContractError,
    type ElementDescriptor,
    type LegacyScenario as Scenario,
    parseRecording,
    parseScenario,
    readRecording,
    readResolution,
    readScenario,
    readTargetWaitState,
    type Recording,
    type Resolution,
    serializeRecording,
    serializeScenario,
} from '../src/contracts';

function descriptor(id = 'employee', name = 'ФИО'): ElementDescriptor {
    return {
        version: 2,
        id,
        scope: {
            pathname: '/spike/procedure',
            context: [{role: 'form', name: 'Данные сотрудника'}],
        },
        fingerprint: {
            algorithm: 'semantic-features-v1',
            normalization: 'nfc-whitespace-v1',
            features: {
                tag: 'input',
                role: 'textbox',
                accessibleName: name,
                label: name,
                text: null,
                placeholder: null,
                attributes: {type: 'text'},
                context: [],
            },
        },
        locators: [
            {
                id: 'role',
                selector: {kind: 'role', role: 'textbox', name, exact: true},
                recordedMatches: 1,
            },
            {
                id: 'label',
                selector: {kind: 'label', value: name, exact: true},
                recordedMatches: 1,
            },
            {
                id: 'fallback',
                selector: {kind: 'css', value: 'form input'},
                recordedMatches: 1,
            },
        ],
        contextRequired: false,
    };
}

function recording(): Recording {
    return {
        kind: 'training-recording',
        version: 2,
        id: 'recording-1',
        mode: {kind: 'dom-only'},
        valuePolicy: {mode: 'capture', sensitive: 'redact', normalizers: []},
        descriptors: [descriptor()],
        actions: [
            {
                id: 'input-1',
                sequence: 1,
                timeMs: 250,
                kind: 'input',
                targetId: 'employee',
                commit: 'blur',
                evidence: {trigger: 'input', trusted: true},
                value: {status: 'captured', raw: 'Анна'},
            },
        ],
        states: [
            {
                targetId: 'employee',
                timeMs: 0,
                source: 'snapshot',
                connected: true,
                visible: true,
                enabled: true,
                readOnly: false,
                value: {status: 'captured', raw: ''},
            },
            {
                targetId: 'employee',
                timeMs: 251,
                source: 'property-observer',
                connected: true,
                visible: true,
                enabled: true,
                readOnly: false,
                value: {status: 'captured', raw: 'Анна'},
            },
        ],
    };
}

function scenario(): Scenario {
    return {
        kind: 'training-scenario',
        version: 2,
        id: 'scenario-1',
        mode: {kind: 'dom-only'},
        descriptors: [descriptor()],
        startStepId: 'fill',
        completion: {kind: 'visible', targetId: 'employee', expected: true},
        steps: [
            {
                id: 'fill',
                instruction: 'Укажите имя',
                hint: 'Используйте поле «ФИО»',
                optional: false,
                action: {kind: 'input', targetId: 'employee'},
                completion: {
                    kind: 'value',
                    targetId: 'employee',
                    condition: {kind: 'raw-equals', value: 'Анна'},
                },
                branches: [
                    {
                        when: {kind: 'visible', targetId: 'employee', expected: false},
                        nextStepId: 'extra',
                    },
                ],
                nextStepId: 'extra',
            },
            {
                id: 'extra',
                instruction: 'Необязательная проверка',
                hint: null,
                optional: true,
                action: {kind: 'click', targetId: 'employee'},
                completion: {
                    kind: 'all',
                    conditions: [
                        {kind: 'visible', targetId: 'employee', expected: true},
                        {kind: 'pathname', value: '/spike/procedure'},
                    ],
                },
                branches: [],
                nextStepId: null,
            },
        ],
    };
}

function resolved(): Resolution {
    return {
        kind: 'element-resolution',
        version: 2,
        targetId: 'employee',
        status: 'resolved',
        strategy: 'semantic',
        selectedCandidateId: 'candidate-1',
        candidates: [
            {
                id: 'candidate-1',
                summary: {tag: 'input', role: 'textbox', name: 'ФИО'},
                score: 0.9,
                evidence: [
                    {group: 'naming', outcome: 'match', detail: 'Exact accessible name'},
                ],
            },
        ],
        attempts: [{locatorId: 'role', count: 1, outcome: 'accepted'}],
    };
}

describe('v2 persisted contracts', () => {
    it('round-trips recording and scenario without host schema, DOM or object identity', () => {
        const source = recording();
        const result = parseRecording(serializeRecording(source));

        expect(result).toEqual(source);
        expect(result.descriptors[0]).not.toBe(source.descriptors[0]);
        expect(parseScenario(serializeScenario(scenario()))).toEqual(scenario());
    });

    it.each(['', false, true, [], ['Angular', 'TypeScript']])(
        'preserves raw value %j',
        (raw) => {
            const document = recording();
            const action = document.actions[0]!;

            if (action.kind !== 'input') {
                throw new Error('fixture');
            }

            action.value = {status: 'captured', raw};
            expect(parseRecording(serializeRecording(document))).toEqual(document);
        },
    );

    it('preserves a navigation action without a fake target element', () => {
        const document = recording();

        document.actions.push({
            id: 'nav',
            sequence: 3,
            timeMs: 300,
            kind: 'navigation',
            pathname: '/other',
            evidence: {trigger: 'navigation', trusted: null},
        });
        expect(parseRecording(serializeRecording(document)).actions[1]!.kind).toBe(
            'navigation',
        );
    });

    it('keeps property updates in states, with no invented user action', () => {
        const document = recording();

        document.actions = [];
        expect(parseRecording(serializeRecording(document)).actions).toEqual([]);
        expect(document.states[1]!.source).toBe('property-observer');
    });

    it('accepts explicitly named normalization and preserves raw display text', () => {
        const document = recording();

        document.valuePolicy.normalizers = ['decimal-comma-v1'];
        document.states[1]!.value = {
            status: 'captured',
            raw: '1 500,25',
            normalized: {rule: 'decimal-comma-v1', value: 1500.25},
        };
        expect(parseRecording(serializeRecording(document))).toEqual(document);
    });

    it('separates DOM-only and adapter-assisted observations', () => {
        const document = recording();

        document.mode = {
            kind: 'shared-adapter',
            adapterId: 'existing-form-service',
            adapterVersion: '1',
        };
        expect(parseRecording(serializeRecording(document)).mode.kind).toBe(
            'shared-adapter',
        );
        expect(() =>
            readRecording({...document, mode: {kind: 'dom-only', adapterId: 'hidden'}}),
        ).toThrow(ContractError);
    });

    it('rejects sensitive captured values while allowing an explicit redaction', () => {
        const document = recording();

        document.descriptors[0]!.fingerprint.features.attributes.type = 'password';
        expect(() => readRecording(document)).toThrow(/sensitive target/);

        for (const state of document.states) {
            state.value = {status: 'redacted', reason: 'sensitive'};
        }

        const action = document.actions[0]!;

        if (action.kind === 'input') {
            action.value = {status: 'redacted', reason: 'sensitive'};
        }

        expect(parseRecording(serializeRecording(document))).toEqual(document);
    });

    const invalid: Array<[string, (document: Recording) => unknown]> = [
        ['old version', (document) => ({...document, version: 1})],
        ['future version', (document) => ({...document, version: 99})],
        ['unknown property', (document) => ({...document, script: 'return true'})],
        [
            'duplicate descriptor',
            (document) => ({
                ...document,
                descriptors: [...document.descriptors, document.descriptors[0]],
            }),
        ],
        ['missing target', (document) => ({...document, descriptors: []})],
        [
            'unordered actions',
            (document) => ({
                ...document,
                actions: [
                    ...document.actions,
                    {...document.actions[0], id: 'second', sequence: 1},
                ],
            }),
        ],
        [
            'unordered time',
            (document) => ({
                ...document,
                actions: [
                    ...document.actions,
                    {...document.actions[0], id: 'second', sequence: 2, timeMs: 1},
                ],
            }),
        ],
        [
            'fractional sequence',
            (document) => ({
                ...document,
                actions: [{...document.actions[0], sequence: 1.5}],
            }),
        ],
        [
            'duplicate action id',
            (document) => ({
                ...document,
                actions: [...document.actions, {...document.actions[0], sequence: 2}],
            }),
        ],
        [
            'unknown state target',
            (document) => ({
                ...document,
                states: [{...document.states[0], targetId: 'missing'}],
            }),
        ],
        [
            'detached visible node',
            (document) => ({
                ...document,
                states: [{...document.states[0], connected: false}],
            }),
        ],
        [
            'omit policy with captured value',
            (document) => ({
                ...document,
                valuePolicy: {...document.valuePolicy, mode: 'omit'},
            }),
        ],
        [
            'redaction carrying a value',
            (document) => ({
                ...document,
                states: [
                    {
                        ...document.states[0],
                        value: {status: 'redacted', reason: 'sensitive', raw: 'secret'},
                    },
                ],
            }),
        ],
        [
            'normalization not enabled',
            (document) => ({
                ...document,
                states: [
                    {
                        ...document.states[0],
                        value: {
                            status: 'captured',
                            raw: '1',
                            normalized: {rule: 'decimal-comma-v1', value: 1},
                        },
                    },
                ],
            }),
        ],
        [
            'invalid normalized date',
            (document) => ({
                ...document,
                valuePolicy: {...document.valuePolicy, normalizers: ['date-dmy-v1']},
                states: [
                    {
                        ...document.states[0],
                        value: {
                            status: 'captured',
                            raw: '30.02.2027',
                            normalized: {rule: 'date-dmy-v1', value: '2027-02-30'},
                        },
                    },
                ],
            }),
        ],
        [
            'URL instead of pathname',
            (document) => ({
                ...document,
                descriptors: [
                    {
                        ...document.descriptors[0],
                        scope: {pathname: 'https://host/spike', context: []},
                    },
                ],
            }),
        ],
        [
            'nonexact semantic locator',
            (document) => ({
                ...document,
                descriptors: [
                    {
                        ...document.descriptors[0],
                        locators: [
                            {
                                id: 'role',
                                recordedMatches: 1,
                                selector: {
                                    kind: 'role',
                                    role: 'textbox',
                                    name: 'ФИО',
                                    exact: false,
                                },
                            },
                        ],
                    },
                ],
            }),
        ],
        [
            'missing required context',
            (document) => ({
                ...document,
                descriptors: [
                    {
                        ...document.descriptors[0],
                        contextRequired: true,
                        scope: {pathname: '/spike/procedure', context: []},
                    },
                ],
            }),
        ],
        [
            'state used as fingerprint',
            (document) => ({
                ...document,
                descriptors: [
                    {
                        ...document.descriptors[0],
                        fingerprint: {
                            ...document.descriptors[0]!.fingerprint,
                            features: {
                                ...document.descriptors[0]!.fingerprint.features,
                                value: 'Анна',
                            },
                        },
                    },
                ],
            }),
        ],
        [
            'locator marker attribute',
            (document) => ({
                ...document,
                descriptors: [
                    {
                        ...document.descriptors[0],
                        fingerprint: {
                            ...document.descriptors[0]!.fingerprint,
                            features: {
                                ...document.descriptors[0]!.fingerprint.features,
                                attributes: {'data-training-id': 'secret'},
                            },
                        },
                    },
                ],
            }),
        ],
    ];

    it.each(invalid)('rejects %s', (_name, mutate) => {
        expect(() => readRecording(mutate(recording()))).toThrow(ContractError);
    });

    it.each([
        undefined,
        Number.NaN,
        Infinity,
        new Date(),
        new Map(),
        new Set(),
        /test/,
        () => true,
    ])('refuses lossy JSON conversion of %p', (value) => {
        expect(() => serializeRecording({...recording(), extra: value})).toThrow(
            ContractError,
        );
    });
    it('refuses live DOM, cyclic objects and getters without invoking them', () => {
        expect(() =>
            serializeRecording({
                ...recording(),
                element: document.createElement('input'),
            }),
        ).toThrow(/plain JSON/);
        const cyclic: {self?: unknown} = {};

        cyclic.self = cyclic;
        expect(() => serializeRecording({...recording(), extra: cyclic})).toThrow(
            /cyclic/,
        );
        const getter = jest.fn(() => 'unsafe');
        const source = recording();

        Object.defineProperty(source, 'extra', {enumerable: true, get: getter});
        expect(() => serializeRecording(source)).toThrow(/accessor/);
        expect(getter).not.toHaveBeenCalled();
    });
    it('refuses sparse arrays and named properties', () => {
        const sparse: unknown[] = [];

        sparse.length = 1;

        expect(() => readRecording({...recording(), actions: sparse})).toThrow(/sparse/);
        Object.assign(sparse, {extra: 'value'});
        expect(() => readRecording({...recording(), actions: sparse})).toThrow(
            /array property/,
        );
    });
    it('bounds imported JSON and reports syntax errors', () => {
        expect(() => parseRecording('{')).toThrow(/invalid JSON/);
        expect(() => parseRecording(' '.repeat(1000001))).toThrow(/exceeds/);
        expect(() => parseScenario(JSON.stringify({...scenario(), version: 1}))).toThrow(
            /version/,
        );
    });
});

describe('scenario and diagnostic contracts', () => {
    it('rejects dangling step and condition references', () => {
        const document = scenario();

        document.steps[0]!.branches[0]!.nextStepId = 'missing';
        expect(() => readScenario(document)).toThrow(/unknown branch/);
        document.steps[0]!.branches = [];
        document.steps[0]!.completion = {
            kind: 'visible',
            targetId: 'missing',
            expected: true,
        };
        expect(() => readScenario(document)).toThrow(/unknown target/);
    });
    it('rejects arbitrary completion code and empty logical conditions', () => {
        const document = scenario();

        expect(() =>
            readScenario({
                ...document,
                steps: [
                    {
                        ...document.steps[0],
                        completion: {kind: 'javascript', source: 'true'},
                    },
                ],
            }),
        ).toThrow(ContractError);
        document.steps[0]!.completion = {kind: 'all', conditions: []};
        expect(() => readScenario(document)).toThrow(ContractError);
    });
    it('preserves a report without live candidate elements', () => {
        expect(readResolution(JSON.parse(JSON.stringify(resolved())))).toEqual(
            resolved(),
        );
        expect(() =>
            readResolution({...resolved(), element: document.createElement('input')}),
        ).toThrow(ContractError);
        expect(() =>
            readResolution({...resolved(), selectedCandidateId: 'missing'}),
        ).toThrow(/candidate is absent/);
    });
    it('requires multiple candidates for ambiguity and rejects an implicit selected winner', () => {
        const source = resolved();
        const report = {
            kind: source.kind,
            version: 2,
            targetId: source.targetId,
            attempts: [],
            status: 'ambiguous',
            reason: 'near-tie',
            candidates: [
                ...source.candidates,
                {...source.candidates[0], id: 'candidate-2'},
            ],
        };

        expect(readResolution(report).status).toBe('ambiguous');
        expect(() =>
            readResolution({...report, selectedCandidateId: 'candidate-1'}),
        ).toThrow(/unknown field/);
        expect(() => readResolution({...report, candidates: source.candidates})).toThrow(
            /at least two/,
        );
        expect(() =>
            readResolution({
                ...source,
                candidates: [{...source.candidates[0], score: 1.1}],
            }),
        ).toThrow(ContractError);
    });
    it('keeps not-yet-present, timeout and cancellation distinct from broken', () => {
        const base = {kind: 'target-wait', version: 2, targetId: 'employee'};

        expect(
            readTargetWaitState({
                ...base,
                status: 'waiting',
                sinceMs: 1,
                deadlineMs: 3000,
                reason: 'not-yet-present',
            }).status,
        ).toBe('waiting');
        expect(
            readTargetWaitState({...base, status: 'timed-out', deadlineMs: 3000}).status,
        ).toBe('timed-out');
        expect(
            readTargetWaitState({...base, status: 'cancelled', reason: 'reset'}).status,
        ).toBe('cancelled');
        expect(
            readTargetWaitState({
                kind: 'target-wait',
                version: 2,
                status: 'ready',
                resolution: resolved(),
            }).status,
        ).toBe('ready');
        expect(() =>
            readTargetWaitState({
                kind: 'target-wait',
                version: 2,
                status: 'broken',
                resolution: resolved(),
            }),
        ).toThrow(/inconsistent/);
        expect(() =>
            readTargetWaitState({
                ...base,
                status: 'waiting',
                sinceMs: 3001,
                deadlineMs: 3000,
                reason: 'not-stable',
            }),
        ).toThrow(/deadline/);
    });
});
