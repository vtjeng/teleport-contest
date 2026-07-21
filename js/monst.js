// Monster instance storage and level placement.
// C refs: include/monst.h struct monst, decl.c zeromonst, rm.h m_at(), and
// steed.c place_monster(). Species records remain in monsters.js.

import { isok, MON_FLOOR } from './const.js';
import { game } from './gstate.js';

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

// C ref: steed.c place_monster(). The exceptional <0,0> vault-guard parking
// spot is retained; ordinary live monsters must occupy an empty valid square.
// This updates only the coordinate index and the monster position/state.
// makemon() owns creation-time monlist linkage; relocation callers clear the
// old coordinate before placing again.
export function place_monster(monster, x, y, state = game) {
    const parkedGuard = x === 0 && y === 0 && monster?.isgd;
    if (!monster || typeof monster !== 'object')
        throw new TypeError('place_monster requires a monster instance');
    if (!isok(x, y) && !parkedGuard)
        throw new RangeError(`place_monster: off-map location <${x},${y}>`);
    if (monster.mhp < 1 && !parkedGuard)
        throw new Error('place_monster: cannot place a dead monster');

    const grid = monsterGrid(state);
    if (grid[x][y])
        throw new Error(`place_monster: occupied location <${x},${y}>`);
    monster.mx = x;
    monster.my = y;
    grid[x][y] = monster;
    monster.mstate = MON_FLOOR;
    return monster;
}

// C ref: rm.h remove_monster(). This clears only the coordinate index. Monster
// fields, nmon, and level.monlist remain unchanged for lifecycle code to own.
export function remove_monster(x, y, state = game) {
    const grid = monsterGrid(state);
    const monster = grid[x]?.[y] ?? null;
    if (grid[x]) grid[x][y] = null;
    return monster;
}
