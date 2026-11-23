// C functions that report a bad state through pline.c impossible() and
// carry on. The port used to throw at these points, ending the game where C
// goes on. Each is synchronous here, so the report is recorded with
// note_unported('pline.c impossible'), or queued with sync_impossible() for
// the next output to print, and the function continues as C does;
// del_light_source() also has an async form that prints the report. Each
// test builds the bad state directly and pins what C does after the report.

import { takeQueuedReports } from './queued-reports.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { LS_NONE, LS_OBJECT, RANGE_LEVEL } from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import { notice_mon_on } from '../js/hack.js';
import { record_achievement } from '../js/insight.js';
import {
    del_light_source,
    del_light_source_async,
    light_globals_init,
    light_sources_in_range,
    new_light_source,
} from '../js/light.js';
import { dmonsfree } from '../js/makemon_create.js';

function freshGame() {
    const state = resetGame();
    state.unported = new Set();
    return state;
}

// C ref: insight.c record_achievement():2414-2419. The achievement number
// N_ACH and above is out of range: C reports and records nothing.
test('record_achievement reports an out-of-range number and records nothing', () => {
    const state = freshGame();
    // 99 is above N_ACH (the list's size), the `achidx >= N_ACH` arm.
    state.u = { uachieved: [0, 0, 0] };
    record_achievement(99, state);
    assert.deepEqual(state.u.uachieved, [0, 0, 0]);
    assert.deepEqual(takeQueuedReports(state),
        ['Achievement #99 is out of range.']);
});

// C ref: flag.h:234-237 notice_mon_on(). An unpaired resume reports and
// clamps the count to zero.
test('notice_mon_on reports an unpaired resume and clamps to zero', () => {
    const state = freshGame();
    // 0: no notice_mon_off() is outstanding, so the decrement goes to -1.
    state.a11y = { mon_notices_blocked: 0 };
    notice_mon_on(state);
    assert.equal(state.a11y.mon_notices_blocked, 0);
    assert.deepEqual(takeQueuedReports(state), ['mon_notices_blocked<0']);
});

// C ref: light.c del_light_source():134-137. A source that is not on the
// list is reported and nothing is deleted. The synchronous form queues the
// report for the next message; del_light_source_async() prints it, as rehumanize() does
// for a yellow light that died inside polymon()
// (recordings/light.c/rehumanize-before-hero-light-eye.session.json).
test('del_light_source reports a missing source and deletes nothing', async () => {
    const state = freshGame();
    light_globals_init(state);
    // Radius 3 at <5,5>: an ordinary object source that stays on the list.
    const lamp = { where: 'floor' };
    const kept = new_light_source(5, 5, 3, LS_OBJECT, lamp, state);
    del_light_source(LS_OBJECT, { where: 'floor' }, state);
    assert.equal(state.gl.light_base, kept);
    assert.deepEqual(
        state._glyphUpdateNotices.filter((notice) => notice.impossible)
            .map((notice) => notice.message),
        ['del_light_source: not found type=1, id=<ptr>']);
    state._glyphUpdateNotices = [];

    const lines = [];
    const sink = async (text) => { lines.push(text); };
    await del_light_source_async(LS_OBJECT, { where: 'floor' }, state,
        { message: sink, urgentMessage: sink });
    assert.equal(state.gl.light_base, kept);
    // type=1 is LS_OBJECT; alloc.c fmt_ptr() prints a non-null pointer as
    // <ptr> under patch 007. Nothing is worth saving in a fresh game, so the
    // second line has no "Saving and reloading" clause.
    assert.deepEqual(lines, [
        'del_light_source: not found type=1, id=<ptr>',
        'Program in disorder!',
        'Please report these messages to devteam@nethack.org.',
    ]);
});

// C ref: light.c del_light_source():108-111, 134-137. LS_NONE is reported,
// then searched for with a zero id; no source has that type, so the search
// fails and C reports that too.
test('del_light_source reports type none, then the failed search', async () => {
    const state = freshGame();
    light_globals_init(state);
    // Radius 2 at <3,3>: a source of another type, which the search skips.
    const kept = new_light_source(3, 3, 2, LS_OBJECT, { where: 'floor' }, state);
    const lines = [];
    const sink = async (text) => { lines.push(text); };
    await del_light_source_async(LS_NONE, {}, state,
        { message: sink, urgentMessage: sink });
    assert.equal(state.gl.light_base, kept);
    assert.deepEqual(lines.filter((line) => line.startsWith('del_light_source')), [
        'del_light_source:type=none',
        'del_light_source: not found type=0, id=<ptr>',
    ]);
});

// C ref: light.c maybe_write_ls():587-592. A source of neither mobile type
// is reported and treated as local (is_global = 0), so the level's range
// keeps it.
test('maybe_write_ls reports a bad source type and treats it as local', () => {
    const state = freshGame();
    light_globals_init(state);
    // LS_NONE is neither LS_OBJECT nor LS_MONSTER, the switch's default.
    const odd = { next: null, type: LS_NONE, id: { mx: 1 } };
    state.gl.light_base = odd;
    assert.deepEqual(light_sources_in_range(RANGE_LEVEL, state), [odd]);
    // The report waits on the notice queue for the next output
    // (js/source_steps.js sync_impossible()).
    assert.deepEqual(
        state._glyphUpdateNotices.filter((notice) => notice.impossible)
            .map((notice) => notice.message),
        // LS_NONE is 0 and RANGE_LEVEL is 0 (light.c:592's format).
        ['maybe_write_ls: bad type (0) [range=0]'],
    );
});

// C ref: mon.c dmonsfree():2504-2509. A purge count that does not match the
// dead monsters found is reported; the dead are freed and the count reset.
test('dmonsfree reports a count mismatch and still purges', () => {
    const state = freshGame();
    // One dead monster (mhp 0) and one live one; purge_monsters claims 2.
    const live = { mhp: 5, nmon: null };
    const dead = { mhp: 0, nmon: live };
    // `at` answers no square: the report's queue entry records the map.
    state.level = { monlist: dead, at: () => undefined };
    state.iflags = { purge_monsters: 2 };
    // describe_level() in the report reads the hero's level: the first
    // level of a one-dungeon game.
    state.u = { uz: { dnum: 0, dlevel: 1 } };
    state.dungeons = [{ depth_start: 1, num_dunlevs: 5, dname: 'The Dungeons of Doom' }];
    assert.equal(dmonsfree(state), 1);
    assert.equal(state.level.monlist, live);
    assert.equal(state.iflags.purge_monsters, 0);
    const reports = takeQueuedReports(state);
    assert.equal(reports.length, 1);
    // One dead monster was removed where the count claimed two.
    assert.match(reports[0],
        /^dmonsfree: 1 removed doesn't match 2 pending on .+$/u);
});
