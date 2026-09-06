// Pin the pure functions ported from muse.c and the callees they need.
// Expected values are read from the C source, not from the JavaScript output.
//
// C ref: muse.c m_use_healing() (337-360), m_next2m() (420-437),
// necrophiliac() (2691-2705), find_defensive() (489-509);
// o_init.c objdescr_is() (352-364), do_name.c monverbself() (1221-1252).

import assert from 'node:assert/strict';
import test from 'node:test';

import * as M from '../js/monsters.js';
import * as O from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { objdescr_is, init_objects } from '../js/o_init.js';
import { monverbself } from '../js/do_name.js';
import { m_carrying } from '../js/mon.js';
import { m_next2m, find_defensive, necrophiliac } from '../js/muse.js';
import { monst_globals_init } from '../js/monsters.js';
import { roles } from '../js/roles.js';

// Build a minimal state with initialized objects so OBJ_DESCR resolves.
// rn2 = () => 0 gives deterministic first-in-class descriptions.
function makeState() {
    const archeologist = roles.find((role) => role.filecode === 'Arc');
    const state = {
        context: { ident: 2 },
        flags: { implicit_uncursed: true, initalign: 0 },
        iflags: { override_ID: false },
        program_state: { gameover: false },
        u: { uprops: [] },
        urole: { ...archeologist },
    };
    O.objects_globals_init(state);
    // Zero choices deterministically initialize every randomized description.
    init_objects(state, () => 0);
    monst_globals_init(state);
    return state;
}

// Build a linked inventory list from an array of otyp values.
function makeInventory(otypList, state) {
    let head = null;
    for (let i = otypList.length - 1; i >= 0; --i) {
        const obj = newObject({
            otyp: otypList[i],
            oclass: state.objects[otypList[i]].oc_class,
            quan: 1,
            nobj: head,
        });
        head = obj;
    }
    return head;
}

// ---------- objdescr_is ----------

test('objdescr_is returns true for a milky potion', () => {
    // C ref: o_init.c objdescr_is() (352-364). The milky potion is the
    // potion whose randomized description is "milky". In C, the milky
    // description belongs to one of the shuffled POTION_CLASS entries;
    // objdescr_is checks OBJ_DESCR(objects[obj->otyp]) against the given
    // string.
    const state = makeState();
    // Find which otyp got the "milky" description after shuffling.
    let milkyOtyp = null;
    for (let i = 0; i < state.objects.length; ++i) {
        if (O.OBJ_DESCR(state.objects[i], state) === 'milky') {
            milkyOtyp = i;
            break;
        }
    }
    assert.notEqual(milkyOtyp, null,
        'some potion should have the milky description');
    const obj = newObject({ otyp: milkyOtyp, oclass: O.POTION_CLASS });
    assert.equal(objdescr_is(obj, 'milky', state), true);
    assert.equal(objdescr_is(obj, 'smoky', state), false);
});

test('objdescr_is returns false for null obj', () => {
    // C ref: o_init.c objdescr_is() (354-357). A null obj returns FALSE
    // (after an impossible() call in C).
    const state = makeState();
    assert.equal(objdescr_is(null, 'milky', state), false);
});

test('objdescr_is returns false when the object has no description', () => {
    // C ref: o_init.c objdescr_is() (360-361). Objects whose oc_descr is
    // null cannot match any description string.
    const state = makeState();
    // A short sword (WEAPON_CLASS) has no randomized description.
    // Its OBJ_DESCR is null.
    const obj = newObject({ otyp: O.SHORT_SWORD, oclass: O.WEAPON_CLASS });
    assert.equal(O.OBJ_DESCR(state.objects[O.SHORT_SWORD], state), null);
    assert.equal(objdescr_is(obj, 'short sword', state), false);
});

// ---------- m_use_healing (via m_carrying) ----------

test('m_use_healing equivalent: m_carrying finds potions in priority order', () => {
    // C ref: muse.c m_use_healing() (337-360). The function checks potions
    // in order: POT_FULL_HEALING, POT_EXTRA_HEALING, POT_HEALING. The first
    // match wins.
    const state = makeState();

    // Monster carries all three healing potions.
    const monster = {
        minvent: makeInventory([
            O.POT_HEALING,
            O.POT_EXTRA_HEALING,
            O.POT_FULL_HEALING,
        ], state),
    };

    // m_carrying finds the FIRST inventory item matching the otyp, so it
    // returns the first POT_FULL_HEALING in inventory order.
    const full = m_carrying(monster, O.POT_FULL_HEALING, state);
    assert.notEqual(full, null, 'should find full healing');
    assert.equal(full.otyp, O.POT_FULL_HEALING);

    // If only regular healing is present:
    const monster2 = {
        minvent: makeInventory([O.POT_HEALING], state),
    };
    const regular = m_carrying(monster2, O.POT_FULL_HEALING, state);
    assert.equal(regular, null, 'no full healing in inventory');
    const found = m_carrying(monster2, O.POT_HEALING, state);
    assert.notEqual(found, null);
    assert.equal(found.otyp, O.POT_HEALING);
});

test('m_use_healing equivalent: empty inventory yields null for all types', () => {
    // C ref: muse.c m_use_healing() returns FALSE when no healing potion
    // is carried.
    const state = makeState();
    const monster = { minvent: null };
    assert.equal(m_carrying(monster, O.POT_FULL_HEALING, state), null);
    assert.equal(m_carrying(monster, O.POT_EXTRA_HEALING, state), null);
    assert.equal(m_carrying(monster, O.POT_HEALING, state), null);
});

// ---------- monverbself ----------

test('monverbself produces "Foo zaps itself" for a neuter monster', () => {
    // C ref: do_name.c monverbself() (1221-1252). For a neuter monster
    // ("itself"), vtense("itself", "zap") returns "zaps" (singular), and
    // since "zap" != "zaps", the plural path is skipped.
    // Result: "Monname zaps itself".
    const state = makeState();
    // A minimal monster object that pronoun_gender returns neuter (2) for.
    // pronoun_gender uses mon->data->msound, gender(), canspotmon(), and
    // Hallucination. For a non-hallucinating hero who can spot the monster,
    // a neuter species (like a gas spore, which is neuter) returns 2.
    const mon = {
        data: state.mons[M.PM_GAS_SPORE],
        m_ap_type: 0,
        cham: M.NON_PM,
        mname: '',
        mx: 1, my: 1,
        minvis: false,
        mundetected: false,
        mhp: 1, mhpmax: 1,
        m_id: 99,
        meverseen: true,
        isshk: false,
        ispriest: false,
        isminion: false,
        mpeaceful: false,
        mconf: false,
        mstun: false,
        mflee: false,
        mcan: false,
        mblinded: false,
        mcansee: true,
        misc_worn_check: 0,
    };
    // The hero is not hallucinating and not blind, and can spot the monster.
    state.u = {
        uprops: [],
        ux: 1, uy: 1,
        uroleplay: {},
    };
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    // canSpotMonster always returns true (the monster is visible).
    const env = { canSpotMonster: () => true };
    const result = monverbself(
        mon, 'The gas spore', 'zap', null, state, env);
    assert.equal(result, 'The gas spore zaps itself');
});

test('monverbself includes othertext when provided', () => {
    // C ref: do_name.c monverbself() (1245-1246). When othertext is non-null
    // and non-empty, it is inserted between the verb and the reflexive.
    const state = makeState();
    const mon = {
        data: state.mons[M.PM_KOBOLD],
        m_ap_type: 0,
        cham: M.NON_PM,
        mname: '',
        mx: 1, my: 1,
        minvis: false,
        mundetected: false,
        mhp: 1, mhpmax: 1,
        m_id: 100,
        meverseen: true,
        isshk: false,
        ispriest: false,
        isminion: false,
        mpeaceful: false,
        mconf: false,
        mstun: false,
        mflee: false,
        mcan: false,
        mblinded: false,
        mcansee: true,
        misc_worn_check: 0,
    };
    state.u = {
        uprops: [],
        ux: 1, uy: 1,
        uroleplay: {},
    };
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    // kobold is male; pronoun_gender returns 0 → "himself"
    // vtense("himself", "play") → "plays" (singular), different from "play"
    // → not plural path
    const env = { canSpotMonster: () => true };
    const result = monverbself(
        mon, 'The kobold', 'play', 'a horn directed at', state, env);
    assert.equal(result, 'The kobold plays a horn directed at himself');
});

// ---------- m_next2m ----------

// Build a minimal state whose level.monsters grid supports m_at().
// COLNO = 80, ROWNO = 21 (const.js). The grid is state.level.monsters[x][y].
function makeMonsterGrid() {
    const COLNO = 80;
    const ROWNO = 21;
    const grid = [];
    for (let x = 0; x < COLNO; x++) {
        grid[x] = new Array(ROWNO).fill(null);
    }
    return { level: { monsters: grid } };
}

function placeMonster(state, mon, x, y) {
    mon.mx = x;
    mon.my = y;
    state.level.monsters[x][y] = mon;
}

test('m_next2m returns false for a dead monster', () => {
    // C ref: muse.c m_next2m() (427). DEADMONSTER(mtmp) checks mtmp->mhp < 1.
    // A dead monster (mhp = 0) short-circuits to FALSE regardless of neighbors.
    const state = makeMonsterGrid();
    const dead = { mhp: 0, mx: 5, my: 5 };
    placeMonster(state, dead, 5, 5);
    // Place a neighbor to confirm the dead check takes priority.
    const neighbor = { mhp: 1, mx: 5, my: 6 };
    placeMonster(state, neighbor, 5, 6);
    assert.equal(m_next2m(dead, state), false);
});

test('m_next2m returns false for an off-map monster', () => {
    // C ref: muse.c m_next2m() (427). mon_offmap() returns true when
    // mstate is not MON_FLOOR. A migrating monster is off-map.
    const state = makeMonsterGrid();
    // MON_FLOOR is 0 (the default). Any non-zero mstate means off-map.
    const migrating = { mhp: 1, mx: 5, my: 5, mstate: 1 };
    assert.equal(m_next2m(migrating, state), false);
});

test('m_next2m returns false for a monster alone on the map', () => {
    // C ref: muse.c m_next2m() (429-435). The 3x3 scan around (mx,my)
    // finds no m2 that differs from mtmp, so the function returns FALSE.
    const state = makeMonsterGrid();
    const loner = { mhp: 1, mx: 10, my: 10 };
    placeMonster(state, loner, 10, 10);
    assert.equal(m_next2m(loner, state), false);
});

test('m_next2m returns true when an adjacent monster exists', () => {
    // C ref: muse.c m_next2m() (432-433). m_at(x,y) finds m2 != mtmp,
    // so the function returns TRUE. The neighbor is one square east.
    const state = makeMonsterGrid();
    const mtmp = { mhp: 1, mx: 10, my: 10 };
    placeMonster(state, mtmp, 10, 10);
    const adjacent = { mhp: 1, mx: 11, my: 10 };
    placeMonster(state, adjacent, 11, 10);
    assert.equal(m_next2m(mtmp, state), true);
});

test('m_next2m returns true for a diagonal neighbor', () => {
    // C ref: muse.c m_next2m() (429-434). The scan covers the full 3x3
    // area, including diagonals. A monster at (mx+1, my+1) is adjacent.
    const state = makeMonsterGrid();
    const mtmp = { mhp: 1, mx: 10, my: 10 };
    placeMonster(state, mtmp, 10, 10);
    const diagonal = { mhp: 1, mx: 11, my: 11 };
    placeMonster(state, diagonal, 11, 11);
    assert.equal(m_next2m(mtmp, state), true);
});

test('m_next2m returns false for a monster two squares away', () => {
    // C ref: muse.c m_next2m() (429-434). The scan covers only mx-1..mx+1
    // and my-1..my+1. A monster two squares away is outside that range.
    const state = makeMonsterGrid();
    const mtmp = { mhp: 1, mx: 10, my: 10 };
    placeMonster(state, mtmp, 10, 10);
    const distant = { mhp: 1, mx: 12, my: 10 };
    placeMonster(state, distant, 12, 10);
    assert.equal(m_next2m(mtmp, state), false);
});

test('m_next2m handles map edge without error', () => {
    // C ref: muse.c m_next2m() (431). isok(x,y) rejects coordinates
    // outside [1..COLNO-1] x [0..ROWNO-1]. A monster at position (1,0)
    // has some out-of-bounds neighbors that isok skips.
    const state = makeMonsterGrid();
    const corner = { mhp: 1, mx: 1, my: 0 };
    placeMonster(state, corner, 1, 0);
    // No neighbor: returns false without throwing.
    assert.equal(m_next2m(corner, state), false);
    // Add a neighbor within bounds.
    const neighbor = { mhp: 1, mx: 2, my: 0 };
    placeMonster(state, neighbor, 2, 0);
    assert.equal(m_next2m(corner, state), true);
});

// ---------- necrophiliac ----------
// C ref: muse.c necrophiliac() (2691-2705). The function is inside #if 0 in
// the C source (dead code). It walks an object list, returning true when any
// item is a CORPSE whose species touch-petrifies (or any_corpse is set), and
// recurses into containers via Has_contents / cobj.

test('necrophiliac returns false for an empty list', () => {
    // C ref: muse.c necrophiliac() (2693). A null objlist falls through
    // the while loop and returns FALSE.
    const state = makeState();
    assert.equal(necrophiliac(null, true, state), false);
});

test('necrophiliac returns true for a cockatrice corpse with any_corpse=false', () => {
    // C ref: muse.c necrophiliac() (2694-2696). CORPSE with
    // touch_petrifies(&mons[corpsenm]) == true satisfies the check when
    // any_corpse is false. PM_COCKATRICE (10) is a petrifier.
    const state = makeState();
    const corpse = {
        otyp: O.CORPSE,
        corpsenm: M.PM_COCKATRICE,
        cobj: null,
        nobj: null,
    };
    assert.equal(necrophiliac(corpse, false, state), true);
});

test('necrophiliac returns false for a non-petrifier corpse with any_corpse=false', () => {
    // C ref: muse.c necrophiliac() (2694-2696). A CORPSE whose species
    // does not touch-petrify (e.g. PM_NEWT) fails the check when
    // any_corpse is false. The function continues to the next item and
    // returns FALSE at the end of the list.
    const state = makeState();
    const corpse = {
        otyp: O.CORPSE,
        corpsenm: M.PM_NEWT,
        cobj: null,
        nobj: null,
    };
    assert.equal(necrophiliac(corpse, false, state), false);
});

test('necrophiliac returns true for any corpse when any_corpse=true', () => {
    // C ref: muse.c necrophiliac() (2695). When any_corpse is TRUE, any
    // CORPSE matches regardless of species. PM_NEWT does not
    // touch-petrify, but the any_corpse flag short-circuits the check.
    const state = makeState();
    const corpse = {
        otyp: O.CORPSE,
        corpsenm: M.PM_NEWT,
        cobj: null,
        nobj: null,
    };
    assert.equal(necrophiliac(corpse, true, state), true);
});

test('necrophiliac skips non-corpse objects', () => {
    // C ref: muse.c necrophiliac() (2694). Only objects with otyp == CORPSE
    // are checked. A short sword is not a corpse and is skipped.
    const state = makeState();
    const sword = {
        otyp: O.SHORT_SWORD,
        corpsenm: 0,
        cobj: null,
        nobj: null,
    };
    assert.equal(necrophiliac(sword, true, state), false);
});

test('necrophiliac recurses into containers', () => {
    // C ref: muse.c necrophiliac() (2697-2698). When Has_contents(obj) is
    // true (obj.cobj != null), the function recurses with obj.cobj and
    // any_corpse=FALSE. A petrifier corpse inside a bag is found.
    const state = makeState();
    const innerCorpse = {
        otyp: O.CORPSE,
        corpsenm: M.PM_CHICKATRICE, // PM_CHICKATRICE (9) touch-petrifies
        cobj: null,
        nobj: null,
    };
    const bag = {
        otyp: O.SACK,
        corpsenm: 0,
        cobj: innerCorpse, // Has_contents is true because cobj != null
        nobj: null,
    };
    assert.equal(necrophiliac(bag, false, state), true);
});

test('necrophiliac container recursion uses any_corpse=false', () => {
    // C ref: muse.c necrophiliac() (2697). The recursive call passes FALSE
    // for any_corpse, so a non-petrifier corpse inside a container does not
    // match even when the outer call had any_corpse=TRUE.
    const state = makeState();
    const innerCorpse = {
        otyp: O.CORPSE,
        corpsenm: M.PM_NEWT,
        cobj: null,
        nobj: null,
    };
    const bag = {
        otyp: O.SACK,
        corpsenm: 0,
        cobj: innerCorpse,
        nobj: null,
    };
    // The outer call with any_corpse=true does not match the bag (not a
    // CORPSE), and the recursive call uses any_corpse=false, so the newt
    // corpse inside does not match either.
    assert.equal(necrophiliac(bag, true, state), false);
});

test('necrophiliac follows nobj links through a list', () => {
    // C ref: muse.c necrophiliac() (2699). After checking one item, the
    // function advances to objlist->nobj. A petrifier corpse later in the
    // chain is found.
    const state = makeState();
    const secondItem = {
        otyp: O.CORPSE,
        corpsenm: M.PM_COCKATRICE,
        cobj: null,
        nobj: null,
    };
    const firstItem = {
        otyp: O.SHORT_SWORD,
        corpsenm: 0,
        cobj: null,
        nobj: secondItem,
    };
    assert.equal(necrophiliac(firstItem, false, state), true);
});

// ---------- find_defensive: lizard corpse selection ----------

// Build a minimal monster with the properties find_defensive reads.
// data.mflags1 must include M1_HUMANOID (bit 0x80000) to pass nohands().
// dist2(mx,my,mux,muy) must be <= 25 for the function's distance check.
function makeMonster(overrides = {}) {
    const defaultData = {
        mflags1: 0x80000, /* M1_HUMANOID: has hands */
        mflags2: 0,
        mlet: 0,
        pmidx: 0,
    };
    return {
        data: { ...defaultData, ...overrides.data },
        mx: 5, my: 5, mux: 5, muy: 5,
        mconf: 0, mstun: 0, mcansee: 1,
        mhp: 10, mhpmax: 10,
        mpeaceful: false,
        minvent: null,
        ...overrides,
    };
}

test('find_defensive selects lizard corpse for a confused monster', () => {
    // C ref: muse.c find_defensive() (490-497). A confused monster carrying
    // a lizard corpse selects MUSE_LIZARD_CORPSE immediately.
    const state = makeState();
    state.u.ux = 5; state.u.uy = 5;

    const lizardCorpse = newObject({
        otyp: O.CORPSE,
        oclass: O.FOOD_CLASS,
        corpsenm: M.PM_LIZARD,
        quan: 1,
        nobj: null,
    });

    const monster = makeMonster({
        mconf: 1,
        minvent: lizardCorpse,
    });

    const result = find_defensive(monster, false, { state });
    assert.equal(result.kind, 'lizard corpse',
        'confused monster with lizard corpse should select it');
    assert.equal(result.object, lizardCorpse);
});

test('find_defensive selects lizard tin for a stunned monster that can open tins', () => {
    // C ref: muse.c find_defensive() (498-506). A stunned monster with a
    // lizard tin and a tin opener selects the tin when rn2(3) is nonzero.
    const state = makeState();
    state.u.ux = 5; state.u.uy = 5;

    const tinOpener = newObject({
        otyp: O.TIN_OPENER,
        oclass: O.TOOL_CLASS,
        quan: 1,
        nobj: null,
    });
    const lizardTin = newObject({
        otyp: O.TIN,
        oclass: O.FOOD_CLASS,
        corpsenm: M.PM_LIZARD,
        quan: 1,
        nobj: tinOpener,
    });

    const monster = makeMonster({
        mstun: 1,
        minvent: lizardTin,
    });

    // rn2(3) returning 1 (nonzero) means the monster can open the tin.
    const result = find_defensive(monster, false, {
        state,
        random: { rn2: () => 1 },
    });
    assert.equal(result.kind, 'lizard corpse',
        'stunned monster with lizard tin and tin opener should select it');
    assert.equal(result.object, lizardTin);
});

test('find_defensive skips lizard tin when rn2(3) returns 0', () => {
    // C ref: muse.c find_defensive() (505). When rn2(3) returns 0, the
    // confused/stunned monster fails to open the tin.
    const state = makeState();
    state.u.ux = 5; state.u.uy = 5;

    const tinOpener = newObject({
        otyp: O.TIN_OPENER,
        oclass: O.TOOL_CLASS,
        quan: 1,
        nobj: null,
    });
    const lizardTin = newObject({
        otyp: O.TIN,
        oclass: O.FOOD_CLASS,
        corpsenm: M.PM_LIZARD,
        quan: 1,
        nobj: tinOpener,
    });

    const monster = makeMonster({
        mconf: 1,
        minvent: lizardTin,
    });

    // rn2(3) returning 0 means the monster fails to open the tin.
    const result = find_defensive(monster, false, {
        state,
        random: { rn2: () => 0 },
    });
    // With rn2(3)=0, no lizard corpse found, so fall through.
    assert.notEqual(result?.kind, 'lizard corpse',
        'rn2(3)=0 should prevent lizard tin selection');
});

test('find_defensive prefers unicorn horn over lizard corpse when both available', () => {
    // C ref: muse.c find_defensive() (475-487 then 489-509). The unicorn
    // horn check comes first, so a confused monster with both a unicorn horn
    // and a lizard corpse selects the horn.
    const state = makeState();
    state.u.ux = 5; state.u.uy = 5;

    const lizardCorpse = newObject({
        otyp: O.CORPSE,
        oclass: O.FOOD_CLASS,
        corpsenm: M.PM_LIZARD,
        quan: 1,
        nobj: null,
    });
    const horn = newObject({
        otyp: O.UNICORN_HORN,
        oclass: O.WEAPON_CLASS,
        cursed: false,
        quan: 1,
        nobj: lizardCorpse,
    });

    const monster = makeMonster({
        mstun: 1,
        minvent: horn,
    });

    const result = find_defensive(monster, false, { state });
    assert.equal(result.kind, 'unicorn horn',
        'unicorn horn should be preferred over lizard corpse');
});
