import {expect, test} from '@jest/globals';
import {SelectionEvidence} from '../../libs/training-observer/src/lib/observation/selection-evidence';
const control = (status = 'open', selected = true, displayValue = 'Анна') => ({
    id: 'a',
    hostNodeId: 'host',
    kind: 'combobox',
    state: {redacted: false},
    choice: {
        displayValue,
        selection: {
            status: selected ? 'observed' : 'unknown',
            labels: selected ? ['Анна'] : [],
        },
        popup: {status, relation: 'aria-controls', referencedIds: ['list'], busy: false},
    },
});
test('retains previously observed selection on close without mutating raw snapshots', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    const closed = control('closed', false);
    const result = e.confirm(closed);
    expect(result.choice.selection.status).toBe('observed');
    expect(result.choice.selection.evidence).toBe('previous-snapshot');
    expect(closed.choice.selection.status).toBe('unknown');
});
test('display text and unselected options never prove a first selection', () => {
    const e = new SelectionEvidence();
    e.observe([control('open', false)]);
    expect(e.confirm(control('closed', false)).choice.selection.status).toBe('unknown');
});
test('a new input event invalidates proof even when the same text is typed again', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.invalidate('a');
    expect(e.confirm(control('closed', false)).choice.selection.status).toBe('unknown');
});
test('query different from the selected option and a silently changed value invalidate proof', () => {
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.observe([control('closed', false, 'Борис')]);
    expect(e.confirm(control('closed', false)).choice.selection.status).toBe('unknown');
    e.observe([control('open', true, 'Борис')]);
    expect(e.confirm(control('closed', false, 'Борис')).choice.selection.status).toBe(
        'unknown',
    );
});
test('an open list with no selection, loading, redaction and unknown ownership clear proof', () => {
    const cases = [
        control('open', false),
        {...control(), state: {redacted: true}},
        {
            ...control(),
            choice: {...control().choice, popup: {...control().choice.popup, busy: true}},
        },
        control('unresolved', false),
    ];
    for (const current of cases) {
        const e = new SelectionEvidence();
        e.observe([control()]);
        e.observe([current]);
        expect(e.confirm(control('closed', false)).choice.selection.status).toBe(
            'unknown',
        );
    }
});
test('proof cannot cross popup/host replacement, removal or session reset', () => {
    const cases = [
        {...control('closed', false), hostNodeId: 'other'},
        {
            ...control('closed', false),
            choice: {
                ...control('closed', false).choice,
                popup: {
                    ...control().choice.popup,
                    status: 'closed',
                    referencedIds: ['other'],
                },
            },
        },
    ];
    for (const current of cases) {
        const e = new SelectionEvidence();
        e.observe([control()]);
        e.observe([current]);
        expect(e.confirm(control('closed', false)).choice.selection.status).toBe(
            'unknown',
        );
    }
    const e = new SelectionEvidence();
    e.observe([control()]);
    e.observe([]);
    expect(e.confirm(control('closed', false)).choice.selection.status).toBe('unknown');
    e.observe([control()]);
    e.clear();
    expect(e.confirm(control('closed', false)).choice.selection.status).toBe('unknown');
});
