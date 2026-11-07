// Source-pinned check for muse.c find_defensive()'s wand-of-digging test,
// `!(levl[x][y].wall_info & W_NONDIGGABLE)` (muse.c:671). rm.h overlays
// wall_info on rm.flags, so on a monster's floor square that bit is whatever
// else the square keeps there: a temple altar's AM_SHRINE (0x08) equals
// W_NONDIGGABLE, and C's fleeing monster on a shrine does not pick its wand of
// digging. No recording is cheap here: the setup needs a wounded monster that
// carries a charged wand of digging and stands on a temple altar.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ALTAR, AM_LAWFUL, AM_SHRINE, ROOM } from '../js/const.js';
import { monst_globals_init, PM_GOBLIN } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { find_defensive } from '../js/muse.js';
import { newObject } from '../js/obj.js';
import { objects_globals_init, WAN_DIGGING } from '../js/objects.js';

function stateWithSquare(square) {
    const state = {};
    monst_globals_init(state);
    objects_globals_init(state);
    state.u = {
        ulevel: 1, uprops: [], uswallow: false, ustuck: null, ux: 11, uy: 10,
        uz: { dnum: 0, dlevel: 3 },
    };
    state.dungeons = [{ num_dunlevs: 25 }];
    state.level = {
        at: (x, y) => (x === 10 && y === 10 ? square : { typ: ROOM, flags: 0 }),
        monsters: Array.from({ length: 80 }, () => Array(21).fill(null)),
        objects: Array.from({ length: 80 }, () => Array(21).fill(null)),
        traps: [],
        flags: {},
    };
    return state;
}

function woundedDigger(state) {
    const wand = newObject({
        otyp: WAN_DIGGING,
        oclass: state.objects[WAN_DIGGING].oc_class,
        owt: state.objects[WAN_DIGGING].oc_weight,
        quan: 1,
        spe: 4,
    });
    // One of eight hit points is below find_defensive()'s one-fifth
    // threshold, so the monster looks for a way to flee.
    return newMonster({
        data: state.mons[PM_GOBLIN], mnum: PM_GOBLIN, mx: 10, my: 10,
        mcansee: true, mhp: 1, mhpmax: 8, minvent: wand,
        mux: state.u.ux, muy: state.u.uy,
    });
}

test('a fleeing monster digs down from an ordinary floor square', () => {
    const state = stateWithSquare({ typ: ROOM, flags: 0 });
    assert.equal(
        find_defensive(woundedDigger(state), false, { state })?.kind,
        'digging wand',
    );
});

test('a temple altar reads as nondiggable through the shared flags byte', () => {
    // A lawful shrine: alignment bits plus AM_SHRINE, as mkroom.c mktemple()
    // leaves a temple's altar.
    const state = stateWithSquare({ typ: ALTAR, flags: AM_LAWFUL | AM_SHRINE });
    assert.notEqual(
        find_defensive(woundedDigger(state), false, { state })?.kind,
        'digging wand',
    );
});
