import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STATUS_FIELDS } from '../js/status_field_data.js';
import {
    bot, init_blstats, status_eval_next_unhilite, status_initialize,
} from '../js/display.js';
import { nh_terminate } from '../js/end.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { isTerminated } from '../js/rng.js';
import { expectTerminated } from './expect-terminated.mjs';

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

test('nh_terminate takes the final capture before status cleanup; panic retains state', async () => {
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
    await expectTerminated(() => nh_terminate(state));
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
    await expectTerminated(() => nh_terminate(panicState));
    assert.equal(panicState.gb.status_hilite_rule[0][0].style, 'blue');
});

test('a live segment that runs out of input takes no final capture and retains status state',
    async () => {
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/end.c/really-done-wait-synch.session.json', import.meta.url,
    ), 'utf8'));
    // Three keys (the recording's '.#r') end the replay at a live command
    // prompt, long before its death: one capture per key read, plus the
    // first wait at start-up, and no final capture after exhaustion.
    const result = await runSegment({ ...recording.segments[0], moves: '.#r' });
    assert.equal(result.getInputExhausted(), true);
    assert.equal(isTerminated(), false);
    assert.equal(game.program_state?.gameover, undefined);
    assert.equal(result.getRngSlices().length, 4);
    assert.ok((game.gb?.status_hilite_rule ?? []).length > 0,
        'status_finish() did not run');
    assert.ok(game._renderedStatusLayouts.length > 0,
        'the rendered status lines are kept');
});

test('really-done wait-synch boundary retains status state before termination', async () => {
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/end.c/really-done-wait-synch.session.json', import.meta.url,
    ), 'utf8'));
    const result = await runSegment(recording.segments[0]);
    assert.equal(Boolean(game.program_state?.gameover), true);
    assert.equal(isTerminated(), false,
        'replay exhaustion stopped inside really_done rather than nh_terminate');
    assert.ok(result.getScreens().length > 0, 'the wait boundary was captured');
    assert.ok((game.gb?.status_hilite_rule ?? []).length > 0);
    assert.ok(game._renderedStatusLayouts.length > 0,
        'partial disclosure preserves rendered status state');
});

// botl.c eval_notify_windowport_field() (1574-1581) tests a temporary
// highlight's timer only when the field is unchanged (`!chg && curr->time`),
// and get_hilite() picks the rule from the change direction alone. A change
// therefore leaves an expired timer in place until
// status_eval_next_unhilite() restamps it at the end of the turn, and a
// second bot() before then finds the timer expired and drops the highlight.
// moveloop()'s haze decay (timeout.c nh_timeout()) followed by a hunger or
// "full of energy" message reaches this order in play.
async function acHiliteGame() {
    // An independent debug-mode Priest whose only status rule is a temporary
    // AC highlight; statushilites:1 makes a stamped timer expire one turn on.
    // The single space dismisses the welcome message and leaves the game at
    // a live command prompt.
    await runSegment({
        seed: 6620417,
        datetime: '20260903120000',
        nethackrc: 'OPTIONS=name:Ac,role:Priest,race:human,gender:male,'
            + 'align:lawful,playmode:debug\n'
            + 'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,statushilites:1\n'
            + 'OPTIONS=hilite_status:armor-class/changed/red\n',
        moves: ' ',
    });
    const fld = STATUS_FIELDS.find(row => row.key === 'armor-class').fld;
    // First change: stamp the AC timer at the current turn (moves + 1).
    game.u.uac -= 1;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed');
    status_eval_next_unhilite(game);
    const stamped = game.gb.status_hilite_times[0][fld];
    assert.equal(stamped, game.moves + 1);
    // Five turns pass inside a multi-turn command: multi keeps
    // hilite_reset_needed() false, so the expired timer stays in place.
    game.multi = 5;
    game.moves += 5;
    status_eval_next_unhilite(game);
    assert.equal(game.gb.status_hilite_times[0][fld], stamped);
    return { fld, stamped };
}

test('a second bot() after a change drops a temporary highlight whose timer expired',
    async () => {
    const { fld, stamped } = await acHiliteGame();
    // The count ran out before the change, as in a counted search that
    // ends on the turn the haze decays.
    game.multi = 0;
    game.u.uac += 2;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed',
        'the change itself selects the temporary rule');
    assert.equal(game.gb.status_hilite_times[0][fld], stamped,
        'a changed field keeps its old timer');
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld], null,
        'the unchanged field with an expired timer loses its highlight');
    assert.equal(game.gb.status_hilite_times[0][fld], 0);
});

test('a change during multi keeps no highlight past a later bot() with multi clear',
    async () => {
    const { fld } = await acHiliteGame();
    // The change comes while the command still repeats; the interruption
    // (interrupt_multi()'s nomul(0)) precedes the second bot().
    game.u.uac += 2;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed');
    game.multi = 0;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld], null);
});
