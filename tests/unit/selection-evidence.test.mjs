import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelectionEvidence } from '../../libs/training-observer/src/lib/observation/selection-evidence.ts';
const control = (status = 'open', selected = true, displayValue = 'Анна') => ({
    id: 'a',
    hostNodeId: 'host',
    kind: 'combobox',
    state: { redacted: false },
    choice: {
        displayValue,
        selection: { status: selected ? 'observed' : 'unknown', labels: selected ? ['Анна'] : [] },
        popup: { status, relation: 'aria-controls', referencedIds: ['list'], busy: false },
    },
});
test('retains previously observed selection on close without mutating raw snapshots', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    const closed = control('closed', false);
    const result = e.confirm(closed);
    assert.equal(result.choice.selection.status, 'observed');
    assert.equal(result.choice.selection.evidence, 'previous-snapshot');
    assert.equal(closed.choice.selection.status, 'unknown');
});
test('display text and unselected options never prove a first selection', () => {
    const e = new SelectionEvidence();
    e.observe([control('open', false)]);
    assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
});
test('a new input event invalidates proof even when the same text is typed again', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.invalidate('a');
    assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
});
test('query different from the selected option and a silently changed value invalidate proof', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.observe([control('closed', false, 'Борис')]);
    assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
    e.observe([control('open', true, 'Борис')]);
    assert.equal(e.confirm(control('closed', false, 'Борис')).choice.selection.status, 'unknown');
});
test('an open list with no selection, loading, redaction and unknown ownership clear proof', () => {
    const cases = [
        control('open', false),
        { ...control(), state: { redacted: true } },
        { ...control(), choice: { ...control().choice, popup: { ...control().choice.popup, busy: true } } },
        control('unresolved', false),
    ];
    for (const current of cases) {
        const e = new SelectionEvidence();
        e.observe([control()]);
        e.observe([current]);
        assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
    }
});
test('proof cannot cross popup/host replacement, removal or session reset', () => {
    const cases = [
        { ...control('closed', false), hostNodeId: 'other' },
        {
            ...control('closed', false),
            choice: {
                ...control('closed', false).choice,
                popup: { ...control().choice.popup, status: 'closed', referencedIds: ['other'] },
            },
        },
    ];
    for (const current of cases) {
        const e = new SelectionEvidence();
        e.observe([control()]);
        e.observe([current]);
        assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
    }
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.observe([]);
    assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
    e.observe([control()]);
    e.clear();
    assert.equal(e.confirm(control('closed', false)).choice.selection.status, 'unknown');
});
