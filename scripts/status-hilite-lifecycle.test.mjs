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
import { HUNGRY, NOT_HUNGRY } from '../js/const.js';

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
    assert.equal(game.program_state.gameover, 0);
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

// A Ranger whose 26-byte name is 16 + strlen("Tenderfoot"): botl.c
// bot_via_windowport() cuts the shown name to BOTL_NSIZ (16) characters, so
// get_hilite()'s txtstr, which skips strlen(svp.plname) + 5 bytes (2536-2538),
// is empty, while blstats[][BL_TITLE].val (1007) is the whole title.
async function longNameTitleGame(rules) {
    // Seed, clock and name are independent of every recorded session; the
    // single 's' leaves the game at a live command prompt.
    await runSegment({
        seed: 4418203,
        datetime: '20300517102233',
        nethackrc: 'OPTIONS=name:Lkjhgfdsamnbvcxzpoiuytrewq,role:Ranger,'
            + 'race:human,gender:female,align:chaotic\n'
            + 'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,statushilites:3\n'
            + rules.map(rule => `OPTIONS=hilite_status:${rule}\n`).join(''),
        moves: 's',
    });
    return STATUS_FIELDS.find(row => row.key === 'title').fld;
}

test('a long name whose title text is empty still takes the title rule',
    async () => {
    const fld = await longNameTitleGame(['title/always/bright-blue']);
    assert.equal(game.plname.length, 26);
    // eval_notify_windowport_field() calls get_hilite() because the title's
    // val is not empty (botl.c 1590); BL_TH_ALWAYS_HILITE ignores txtstr.
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'always');
});

test('a rank change with a long name is a title change', async () => {
    const fld = await longNameTitleGame(['title/changed/green']);
    assert.equal(game.gb.status_hilite_rule[0][fld], null);
    // Experience level 3 makes the Ranger a Lookout. compare_blstats()
    // compares the whole val, which changed, although txtstr is empty both
    // before and after.
    game.u.ulevel = 3;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed');
});

test('an expired change highlight on an empty field keeps its rule', async () => {
    // An independent Tourist with a temporary hunger rule; statushilites:1
    // makes a stamped timer expire one turn on.
    await runSegment({
        seed: 7730914,
        datetime: '20300517102233',
        nethackrc: 'OPTIONS=name:Ines,role:Tourist,race:human,'
            + 'gender:female,align:neutral\n'
            + 'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,statushilites:1\n'
            + 'OPTIONS=hilite_status:hunger/changed/red\n',
        moves: 's',
    });
    const fld = STATUS_FIELDS.find(row => row.key === 'hunger').fld;
    // Hungry, then not hungry again: the second change has an empty val
    // ("" for NOT_HUNGRY, botl.c 1101-1102), but chg is nonzero, so
    // get_hilite() still picks the temporary rule.
    game.u.uhs = HUNGRY;
    game.disp.botl = true;
    await bot();
    status_eval_next_unhilite(game);
    game.u.uhs = NOT_HUNGRY;
    game.disp.botl = true;
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed');
    status_eval_next_unhilite(game);
    const stamped = game.gb.status_hilite_times[0][fld];
    assert.equal(stamped, game.moves + 1);
    // Two turns on, hilite_reset_needed() resets the field. With chg 0 and
    // an empty val, eval_notify_windowport_field() skips get_hilite()
    // (botl.c 1590), so both banks keep the temporary rule and the next
    // status_eval_next_unhilite() stamps a new timer.
    game.moves += 2;
    status_eval_next_unhilite(game);
    assert.equal(game.disp.botl, true);
    await bot();
    assert.equal(game.gb.status_hilite_rule[0][fld]?.behavior, 'changed');
    assert.equal(game.gb.status_hilite_rule[1][fld]?.behavior, 'changed');
    assert.equal(game.gb.status_hilite_times[0][fld], 0);
    status_eval_next_unhilite(game);
    assert.equal(game.gb.status_hilite_times[0][fld], game.moves + 1);
});
