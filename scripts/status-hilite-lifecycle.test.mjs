import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STATUS_FIELDS } from '../js/status_field_data.js';
import { init_blstats, status_eval_next_unhilite, status_initialize } from '../js/display.js';
import { finishTerminatedSegment, runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';

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

test('a changed event clears from both banks when highlight duration is off',
    () => {
    const field = xpField;
    const state = {
        iflags: { hilite_delta: 0 },
        gb: {
            status_hilite_rule: banks(null),
            status_hilite_times: banks(12),
            status_hilite_chg: Array(27).fill(false),
        },
        moves: 12,
        multi: 0,
        disp: { botl: false },
    };
    state.gb.status_hilite_rule[0][field] = { behavior: 'changed' };
    state.gb.status_hilite_chg[field] = true;

    status_eval_next_unhilite(state);

    assert.equal(state.gb.status_hilite_times[0][field], 0);
    assert.equal(state.gb.status_hilite_times[1][field], 0);
    assert.equal(state.gb.status_hilite_chg[field], false);
    assert.equal(state.disp.botl, true);
});

test('status initialization creates both typed banks and reassessment preserves them', () => {
    const rules = [{ field: 'experience-level', behavior: 'changed' }];
    const state = {
        gb: {}, iflags: { status_hilites: rules }, gu: {}, disp: {},
        flags: { time: false },
    };
    status_initialize(state, false);
    const xp = STATUS_FIELDS.find(row => row.key === 'experience-level');
    assert.equal(state.gb.blinit, true);
    for (const field of STATUS_FIELDS) {
        for (const bank of [0, 1]) {
            assert.equal(state.gb.status_hilite_value[bank][field.fld], 0);
            assert.equal(state.gb.status_hilite_compare_value[bank][field.fld], 0);
            assert.equal(state.gb.status_hilite_type[bank][field.fld], field.type);
            assert.equal(state.gb.status_hilite_rule[bank][field.fld], null);
        }
    }
    assert.equal(state.gb.status_hilite_value[0][xp.fld], 0);
    const time = STATUS_FIELDS.find(row => row.key === 'time');
    assert.equal(state.gb.status_hilite_enabled[time.fld], false);
    assert.deepEqual(state.iflags.status_hilites, rules,
        'one-time bank initialization preserves configured thresholds');
    assert.equal(init_blstats(state), false, 'the static initializer runs once');

    state.gb.status_hilite_value[0][xp.fld] = 9;
    state.flags.time = true;
    state.gu.update_all = false;
    state.disp.botlx = false;
    status_initialize(state);
    assert.equal(state.gb.status_hilite_value[0][xp.fld], 9);
    assert.equal(state.gu.update_all, true);
    assert.equal(state.disp.botlx, true);
    assert.equal(state.gb.status_hilite_enabled[time.fld], true);
});

test('terminal final capture precedes status cleanup; panic and live boundaries retain state', async () => {
    const state = {
        program_state: { gameover: true },
        iflags: { status_hilites: [{ field: 'time' }] },
        gb: { status_hilite_rule: banks({ style: 'red' }),
            status_hilite_times: banks(17), status_hilite_value: banks(4) },
        _renderedStatusLayouts: [{ text: 'final' }],
    };
    const events = [];
    state._preNhgetchHook = async () => {
        events.push('capture');
        assert.equal(state.gb.status_hilite_rule[0][0].style, 'red');
    };
    assert.equal(await finishTerminatedSegment(state), true);
    events.push('finished');
    assert.deepEqual(events, ['capture', 'finished']);
    assert.equal(state.gb.status_hilite_rule[0][0], null);
    assert.equal(state.gb.status_hilite_times[0][0], 17,
        'status_finish leaves timer members alone');
    assert.equal(state.gb.status_hilite_value[0][0], 4,
        'status_finish leaves raw-value members alone');
    assert.deepEqual(state.iflags.status_hilites, []);
    assert.deepEqual(state._renderedStatusLayouts, []);

    const panicState = {
        program_state: { gameover: true, panicking: true },
        gb: { status_hilite_rule: banks({ style: 'blue' }) },
    };
    assert.equal(await finishTerminatedSegment(panicState), true);
    assert.equal(panicState.gb.status_hilite_rule[0][0].style, 'blue');
    const liveState = { program_state: { gameover: false } };
    assert.equal(await finishTerminatedSegment(liveState), false);

    const disclosureState = {
        program_state: { gameover: 1, in_really_done: true },
        iflags: { status_hilites: [{ field: 'time' }] },
        gb: { status_hilite_rule: banks({ style: 'green' }),
            status_hilite_times: banks(21) },
        _renderedStatusLayouts: [{ text: 'disclosure' }],
    };
    let disclosureCaptures = 0;
    disclosureState._preNhgetchHook = async () => { disclosureCaptures++; };
    assert.equal(await finishTerminatedSegment(disclosureState), false);
    assert.equal(disclosureCaptures, 0);
    assert.equal(disclosureState.gb.status_hilite_rule[0][0].style, 'green');
    assert.equal(disclosureState.gb.status_hilite_times[0][0], 21);
    assert.equal(disclosureState.iflags.status_hilites.length, 1);
    assert.equal(disclosureState._renderedStatusLayouts[0].text, 'disclosure');
});

test('really-done wait-synch boundary retains status state before termination', async () => {
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/end.c/really-done-wait-synch.session.json', import.meta.url,
    ), 'utf8'));
    const result = await runSegment(recording.segments[0]);
    assert.equal(Boolean(game.program_state?.gameover), true);
    assert.equal(Boolean(game.program_state?.in_really_done), true,
        'replay exhaustion stopped inside really_done rather than nh_terminate');
    assert.ok(result.getScreens().length > 0, 'the wait boundary was captured');
    assert.ok((game.gb?.status_hilite_rule ?? []).length > 0);
    assert.ok(game._renderedStatusLayouts.length > 0,
        'partial disclosure preserves rendered status state');
});
