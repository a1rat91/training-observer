import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createProcedureService} from './service.mjs';
import {createProcedureServer} from './server.mjs';

function setup(profile = 'normal') {
    const service = createProcedureService();
    let current = service.create(profile).body;
    let sequence = 0;
    return {
        service,
        get current() {
            return current;
        },
        request(values = {}, action = 'next') {
            return {requestId: `r-${++sequence}`, expectedRevision: current.revision, action, values};
        },
        send(request) {
            const result = service.action(current.procedureId, request);
            if (result.status === 200) current = result.body;
            return result;
        },
    };
}
const identity = (trainingKind = 'internal') => ({employee: 'Анна', email: 'anna@example.test', trainingKind});
const internal = {course: 'angular', attendance: 'online', mentor: true, comment: ''};
const external = {
    provider: 'Учебный центр',
    cost: 150000,
    startDate: '2027-02-15',
    justification: 'Обучение необходимо для разработки внутренних приложений',
};

test('internal path, immutable identity, append/replace, confirmation and completion', () => {
    const run = setup();
    assert.equal(run.current.revision, 1);
    assert.equal(run.send(run.request(identity())).body.render, 'append');
    assert.equal(run.current.screen.sections.length, 2);
    assert.equal(run.current.values.mentor, false);
    const review = run.send(run.request({...internal, employee: 'Подмена'})).body;
    assert.equal(review.values.employee, 'Анна');
    assert.equal(review.render, 'replace');
    assert.equal(review.state, 'review');
    assert.equal(run.send(run.request({confirmed: false})).status, 422);
    assert.equal(run.current.revision, 3);
    assert.equal(run.send(run.request({confirmed: true})).body.state, 'completed');
    assert.equal(run.current.revision, 4);
    assert.match(run.current.completion.applicationNumber, /^EDU-/);
    assert.equal(run.send(run.request()).status, 409);
});

test('server business rule returns 422 without advancing; corrected values succeed', () => {
    const run = setup();
    run.send(run.request(identity('external')));
    const invalid = run.send(run.request({...external, justification: ''}));
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.revision, 2);
    assert.equal(invalid.body.error.fieldErrors[0].key, 'justification');
    assert.equal(run.send(run.request(external)).body.state, 'review');
});

test('back retains accepted values; switching branches clears old details', () => {
    const run = setup();
    run.send(run.request(identity('external')));
    run.send(run.request(external));
    run.send(run.request({}, 'back'));
    assert.equal(run.current.values.provider, external.provider);
    run.send(run.request({}, 'back'));
    assert.equal(run.current.state, 'identity');
    run.send(run.request(identity('internal')));
    assert.equal(run.current.state, 'details-internal');
    assert.equal(run.current.values.provider, undefined);
    assert.equal(run.current.values.mentor, false);
});

test('idempotent retry precedes revision validation; changed payload and stale revision reject', () => {
    const run = setup();
    const request = run.request(identity());
    const first = run.send(request);
    assert.deepEqual(run.send(request), first);
    assert.deepEqual(
        run.send({...request, values: {trainingKind: 'internal', email: 'anna@example.test', employee: 'Анна'}}),
        first,
    );
    assert.equal(run.send({...request, values: identity('external')}).status, 409);
    assert.equal(run.send({...request, requestId: 'another'}).status, 409);
    assert.equal(run.current.revision, 2);
});

for (const profile of ['fail-once', 'lost-response']) {
    test(`${profile}: same request recovers exactly one transition`, () => {
        const run = setup(profile);
        const request = run.request(identity());
        assert.equal(run.send(request).status, 503);
        assert.equal(run.send(request).body.revision, 2);
        assert.equal(run.send(request).body.revision, 2);
    });
}

test('required/email/enum/date/number types are checked on server', () => {
    const run = setup();
    assert.equal(
        run.send(run.request({...identity(), employee: ' ', email: 'bad', trainingKind: 'unknown'})).body.error
            .fieldErrors.length,
        3,
    );
    run.send(run.request(identity('external')));
    const invalid = run.send(run.request({...external, cost: '150000', startDate: '2027-02-30'}));
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.error.fieldErrors.some((item) => item.key === 'startDate'));
    assert.ok(invalid.body.error.fieldErrors.some((item) => item.key === 'cost'));
});

test('HTTP fixture exposes real create/action requests and rejects foreign origins', async () => {
    const server = createProcedureServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const create = await fetch(`${base}/api/procedures`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', Origin: 'http://localhost:4200'},
            body: '{}',
        });
        assert.equal(create.status, 201);
        const first = await create.json();
        const next = await fetch(`${base}/api/procedures/${first.procedureId}/actions`, {
            method: 'POST',
            body: JSON.stringify({requestId: 'http-1', expectedRevision: 1, action: 'next', values: identity()}),
        });
        assert.equal((await next.json()).render, 'append');
        const rejected = await fetch(`${base}/api/procedures`, {
            method: 'POST',
            headers: {Origin: 'https://unrelated.example'},
            body: '{}',
        });
        assert.equal(rejected.status, 403);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test('validation failures retain request identity; correction uses a new requestId', () => {
    const run = setup();
    const request = run.request({...identity(), email: 'bad'});
    const rejected = run.send(request);
    assert.equal(rejected.status, 422);
    assert.deepEqual(run.send(request), rejected);
    assert.equal(run.send({...request, values: identity()}).status, 409);
    assert.equal(run.send(run.request(identity())).status, 200);
});
