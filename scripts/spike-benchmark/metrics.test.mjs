import assert from 'node:assert/strict';
import test from 'node:test';
import {classify, csv, percentile, summarize} from './metrics.mjs';

test('a unique positional hit on an indistinguishable/disabled target is a false accept', () => {
    assert.equal(classify({count: 1, same: true, eligible: false}), 'wrong');
    assert.equal(classify({count: 1, same: false, eligible: true}), 'wrong');
    assert.equal(classify({count: 2, same: true, eligible: true}), 'ambiguous');
});
test('recovery, precision and false accepts retain separate denominators and errors', () => {
    const result = summarize([
        {expected: 'eligible', outcome: 'correct', durationMs: 1},
        {expected: 'eligible', outcome: 'broken', durationMs: 2},
        {expected: 'eligible', outcome: 'generation-error'},
        {expected: 'removed', outcome: 'wrong', durationMs: 3},
        {expected: 'duplicate', outcome: 'ambiguous', durationMs: 4},
    ]);
    assert.equal(result.recovery, 1 / 3);
    assert.equal(result.precision, 0.5);
    assert.equal(result.falseAccepts, 1);
    assert.equal(result.negative, 2);
    assert.equal(result.generationErrors, 1);
    assert.equal(result.resolveP95Ms, 4);
    assert.equal(summarize([]).precision, null);
});
test('CSV escapes quotes and reports missing latency separately', () => {
    assert.ok(csv([{error: 'bad,"query"'}]).includes('"bad,""query"""'));
    assert.equal(percentile([undefined, 10, 20], 0.95), 20);
    assert.equal(percentile([], 0.5), null);
});
