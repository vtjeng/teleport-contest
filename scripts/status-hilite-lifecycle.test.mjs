import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUS_FIELDS } from '../js/status_field_data.js';
import { status_eval_next_unhilite } from '../js/display.js';

const xpField = STATUS_FIELDS.find(row => row.key === 'experience-level').fld;
const banks = values => [Array(27).fill(values), Array(27).fill(values)];

test('temporary status rule expiry follows elapsed moves and multi holds', () => {
    const rule = { behavior: 'changed' };
    const state = {
        iflags: { hilite_delta: 3 },
        gb: {
            status_hilite_rule: banks(null),
            status_hilite_times: banks(4),
            status_hilite_chg: Array(27).fill(false),
        },
        moves: 5,
        multi: 0,
        disp: { botl: false },
    };
    state.gb.status_hilite_rule[0][xpField] = rule;
    state.gb.status_hilite_rule[1][xpField] = rule;
    state.gb.status_hilite_times[0][xpField] = 4;
    state.gb.status_hilite_times[1][xpField] = 4;

    status_eval_next_unhilite(state);
    assert.equal(state.disp.botl, true, 'the t+1 action requests status reevaluation');

    state.disp.botl = false;
    state.multi = 1;
    status_eval_next_unhilite(state);
    assert.equal(state.disp.botl, false, 'multi suspends temporary highlight expiry');
});

test('a changed-field event stamps both timer banks and requests a refresh', () => {
    const rule = { behavior: 'changed' };
    const state = {
        iflags: { hilite_delta: 3 },
        gb: {
            status_hilite_rule: banks(null),
            status_hilite_times: banks(0),
            status_hilite_chg: Array(27).fill(false),
        },
        moves: 12,
        multi: 0,
        disp: { botl: false },
    };
    state.gb.status_hilite_rule[0][xpField] = rule;
    state.gb.status_hilite_chg[xpField] = true;

    status_eval_next_unhilite(state);
    assert.equal(state.gb.status_hilite_times[0][xpField], 15);
    assert.equal(state.gb.status_hilite_times[1][xpField], 15);
    assert.equal(state.gb.status_hilite_chg[xpField], false);
    assert.equal(state.disp.botl, true);
});
