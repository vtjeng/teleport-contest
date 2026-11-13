// Monster instance storage and level placement.
// C refs: include/monst.h struct monst, decl.c zeromonst, rm.h m_at(), and
// steed.c place_monster(). Species records remain in monsters.js.

import { MON_FLOOR } from './const.js';
import { isok } from './cmd_isok.js';
import { describe_level } from './display.js';
import { minimal_monnam } from './do_name.js';
import { impossible_printer } from './pline.js';
import { ImpossibleCall, finish_steps } from './source_steps.js';
import { game } from './gstate.js';
import { update_monster_region } from './region.js';

// C ref: decl.c cg.zeromonst and include/monst.h struct monst.
export function newMonster(overrides = {}) {
    const monster = {
        nmon: null,
        data: null,
        m_id: 0,
        mnum: 0,
        cham: 0,
        movement: 0,
        m_lev: 0,
        malign: 0,
        mx: 0,
        my: 0,
        mux: 0,
        muy: 0,
        mtrack: Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
        mhp: 0,
        mhpmax: 0,
        mappearance: 0,
        m_ap_type: 0,
        mtame: 0,
        mintrinsics: 0,
        mextrinsics: 0,
        seen_resistance: 0,
        mspec_used: 0,
        female: false,
        minvis: false,
        invis_blkd: false,
        perminvis: false,
        mcan: false,
        mburied: false,
        mundetected: false,
        mcansee: false,
        mspeed: 0,
        permspeed: 0,
        mrevived: false,
        mcloned: false,
        mavenge: false,
        mflee: false,
        mfleetim: 0,
        msleeping: false,
        mblinded: 0,
        mstun: false,
        mfrozen: 0,
        mcanmove: false,
        mconf: false,
        mpeaceful: false,
        mtrapped: false,
        mleashed: false,
        isshk: false,
        isminion: false,
        isgd: false,
        ispriest: false,
        iswiz: false,
        wormno: 0,
        mtemplit: false,
        meverseen: false,
        mspotted: false,
        mwandexp: false,
        mgenmklev: false,
        mstrategy: 0,
        mgoal: { x: 0, y: 0 },
        mtrapseen: 0,
        mlstmv: 0,
        mstate: MON_FLOOR,
        migflags: 0,
        mspare1: 0,
        minvent: null,
        mw: null,
        misc_worn_check: 0,
        weapon_check: 0,
        meating: 0,
        mextra: null,
    };
    Object.assign(monster, overrides);
    return monster;
}

function monsterGrid(state) {
    const grid = state.level?.monsters;
    if (!Array.isArray(grid))
        throw new Error('monster placement requires an initialized level');
    return grid;
}

// C ref: rm.h m_at().
export function m_at(x, y, state = game) {
    return monsterGrid(state)[x]?.[y] ?? null;
}

// C ref: steed.c place_monster() (897-933), written once as
// place_monster_steps() (js/source_steps.js). Off the map, the monster is
// put at <0,0>; a steed not being dismounted, or a dead monster other than a
// parked vault guard, is not placed; an occupied square is overwritten, the
// occupant staying on the monster list. Each case first reports through
// impossible(), which C prints in the middle of the function.
function* place_monster_steps(mon, x, y, state) {
    if (!isok(x, y) && (x !== 0 || y !== 0 || !mon.isgd)) {
        yield new ImpossibleCall(`trying to place ${minimal_monnam(mon, true, state)}`
            + ` at <${x},${y}> mstate:${(mon.mstate >>> 0).toString(16)}`
            + ` on ${describe_level(0, state)}`);
        x = y = 0;
    }
    if ((mon === state.u?.usteed && !state.in_steed_dismounting)
        /* special case is for convoluted vault guard handling */
        || (mon.mhp < 1 && !(mon.isgd && x === 0 && y === 0))) {
        yield new ImpossibleCall(`placing ${mon === state.u?.usteed
            ? 'steed' : 'defunct monster'} onto map, mstate:${
            (mon.mstate >>> 0).toString(16)}, on ${describe_level(0, state)}?`);
        return;
    }
    const grid = monsterGrid(state);
    const othermon = grid[x][y];
    if (othermon) {
        const monnm = minimal_monnam(mon, false, state);
        const othnm = mon !== othermon
            ? minimal_monnam(othermon, true, state) : 'itself';
        yield new ImpossibleCall(`placing ${monnm} over ${othnm} at <${x},${y}>,`
            + ` mstates:${(othermon.mstate >>> 0).toString(16)}`
            + ` ${(mon.mstate >>> 0).toString(16)} on ${describe_level(0, state)}?`);
    }
    mon.mx = x;
    mon.my = y;
    grid[x][y] = mon;
    mon.mstate = MON_FLOOR;
}

// place_monster() for a caller that cannot wait: gap_impossible() records
// each report as unported and the placement goes on as in C. C returns
// nothing; the port returns the monster for its callers' convenience.
export function place_monster(monster, x, y, state = game) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('place_monster requires a monster instance');
    finish_steps(place_monster_steps(monster, x, y, state));
    return monster;
}

// place_monster() for a caller that can wait, which awaits the result: it
// prints each impossible() report where C's place_monster() makes it.
export function place_monster_async(monster, x, y, state = game, env = {}) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('place_monster requires a monster instance');
    return finish_steps(place_monster_steps(monster, x, y, state),
        impossible_printer(state, env));
}

// C ref: rm.h remove_monster(). This clears only the coordinate index. Monster
// fields, nmon, and level.monlist remain unchanged for lifecycle code to own.
export function remove_monster(x, y, state = game) {
    const grid = monsterGrid(state);
    const monster = grid[x]?.[y] ?? null;
    if (grid[x]) grid[x][y] = null;
    return monster;
}

// C ref: monmove.c mon_track_clear().
export function mon_track_clear(monster) {
    if (!Array.isArray(monster?.mtrack))
        throw new TypeError('mon_track_clear requires monster tracking state');
    for (const coordinate of monster.mtrack) {
        coordinate.x = 0;
        coordinate.y = 0;
    }
}

// C refs: teleport.c rloc_to_core(); mon.c mon_track_clear(). This is the
// placement-state core shared by source-faithful relocation callers. It owns
// the source-mandated region-cache update; display, trap, and shop effects
// remain with the higher-level callers.
export function relocate_monster(monster, x, y, state = game) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('relocate_monster requires a monster instance');
    if (monster.mx && m_at(monster.mx, monster.my, state) !== monster) {
        throw new Error(
            `relocate_monster: monster is not at <${monster.mx},${monster.my}>`,
        );
    }
    // teleport.c rloc_to_core() returns before mon_track_clear() when the
    // requested destination is the monster's already-indexed square.
    if (x === monster.mx && y === monster.my) return monster;
    // rloc_to_core() picks the monster up only `if (oldx)`. A monster arriving
    // from gm.mydogs or gm.migrating_mons has mx == 0 and occupies no square,
    // so there is nothing to remove.
    if (monster.mx) remove_monster(monster.mx, monster.my, state);
    mon_track_clear(monster);
    place_monster(monster, x, y, state);
    update_monster_region(monster, state);
    return monster;
}
