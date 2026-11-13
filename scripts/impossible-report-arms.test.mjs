// C functions that report a bad state through pline.c impossible() and
// carry on. The port used to throw at these points, ending the game where C
// goes on. Each is synchronous here, so the report is recorded with
// note_unported('pline.c impossible') and the function continues as C does.
// No input is known to reach any of them; each test builds the bad state
// directly and pins what C does after the report.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LS_NONE, LS_OBJECT, RANGE_LEVEL } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { notice_mon_on } from '../js/hack.js';
import { record_achievement } from '../js/insight.js';
import {
    del_light_source,
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
    assert.ok(game.unported.has('pline.c impossible'));
});

// C ref: flag.h:234-237 notice_mon_on(). An unpaired resume reports and
// clamps the count to zero.
test('notice_mon_on reports an unpaired resume and clamps to zero', () => {
    const state = freshGame();
    // 0: no notice_mon_off() is outstanding, so the decrement goes to -1.
    state.a11y = { mon_notices_blocked: 0 };
    notice_mon_on(state);
    assert.equal(state.a11y.mon_notices_blocked, 0);
    assert.ok(game.unported.has('pline.c impossible'));
});

// C ref: light.c del_light_source():134-137. A source that is not on the
// list is reported and nothing is deleted.
test('del_light_source reports a missing source and deletes nothing', () => {
    const state = freshGame();
    light_globals_init(state);
    // Radius 3 at <5,5>: an ordinary object source that stays on the list.
    const lamp = { where: 'floor' };
    const kept = new_light_source(5, 5, 3, LS_OBJECT, lamp, state);
    del_light_source(LS_OBJECT, { where: 'floor' }, state);
    assert.equal(state.gl.light_base, kept);
    assert.ok(game.unported.has('pline.c impossible'));
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
    assert.ok(game.unported.has('pline.c impossible'));
});

// C ref: mon.c dmonsfree():2504-2509. A purge count that does not match the
// dead monsters found is reported; the dead are freed and the count reset.
test('dmonsfree reports a count mismatch and still purges', () => {
    const state = freshGame();
    // One dead monster (mhp 0) and one live one; purge_monsters claims 2.
    const live = { mhp: 5, nmon: null };
    const dead = { mhp: 0, nmon: live };
    state.level = { monlist: dead };
    state.iflags = { purge_monsters: 2 };
    assert.equal(dmonsfree(state), 1);
    assert.equal(state.level.monlist, live);
    assert.equal(state.iflags.purge_monsters, 0);
    assert.ok(game.unported.has('pline.c impossible'));
});
