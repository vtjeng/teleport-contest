// C ref: monmove.c:1874-1909. m_move() must evaluate leppie_avoidance() and
// m_balks_at_approaching() BEFORE calling m_search_items(), because both can
// change `approach` from 1 to -1, and m_search_items()'s finishSearch path
// (monmove.c:1441-1449) only overrides approach when it is -1 (fleeing).
//
// The prior bug placed m_balks_at_approaching() AFTER m_search_items(), so the
// item search always saw approach=1 for a non-fleeing hostile with a launcher,
// and finishSearch never fired. seed0030 diverged at step 50 because the
// gnome fled instead of approaching an item and then shooting.
//
// This test constructs a hostile gnome with a bow and arrows (so
// m_has_launcher_and_ammo() returns true), places it close to the hero, and
// intercepts the searchItems callback to verify that m_search_items receives
// approach=-1, the post-balks value.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    COULD_SEE,
    INVIS,
    ROOM,
    ROWNO,
    STONE,
    W_NONDIGGABLE,
    W_NONPASSWALL,
} from '../js/const.js';
import { m_move } from '../js/monmove.js';
import {
    PM_GNOME,
    monst_globals_init,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    ARROW,
    BOW,
    WEAPON_CLASS,
    objects_globals_init,
} from '../js/objects.js';

// Minimal game state sufficient for m_move to reach its approach/balks/search
// section. The gnome is hostile, not confused, not fleeing, and can see the
// hero. The hero is visible and not displaced.
function makeState() {
    const locations = new Map();
    const uprops = [];
    // Hero is visible (INVIS inactive).
    uprops[INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const state = {
        invent: null,
        moves: 1,
        dungeons: [{ flags: { hellish: false } }],
        astral_level: { dnum: 99, dlevel: 1 },
        go: {},
        level: {
            flags: {
                arboreal: false,
                has_temple: false,
                sokoban_rules: false,
            },
            monlist: null,
            monsters: Array.from({ length: COLNO }, () =>
                Array(ROWNO).fill(null)),
            objects: Array.from({ length: COLNO }, () =>
                Array(ROWNO).fill(null)),
            regions: [],
            rooms: [],
            traps: [],
            worms: [],
            at(x, y) {
                return locations.get(`${x},${y}`) ?? {
                    typ: ROOM, flags: 0, lit: true, wall_info: 0,
                };
            },
        },
        track: { utcnt: 0, utpnt: 0, utrack: [] },
        u: {
            ux: 6, uy: 4,     // Hero at (6,4).
            uinwater: false,
            uprops,
            ustuck: null,
            ualign: { record: 10, type: 0 },
            urooms: [0, 0, 0, 0, 0],
            uz: { dnum: 0, dlevel: 1 },
            // acurr for throw-range calculation: STR=18 gives range 10.
            acurr: { a: [18, 10, 10, 10, 10, 10] },
        },
        youmonst: newMonster(),
    };
    monst_globals_init(state);
    objects_globals_init(state);
    // couldsee(mx, my) reads viz_array[my][mx] & COULD_SEE, so mark the
    // gnome's position visible. This makes m_canseeu() return true.
    state.viz_array = Array.from({ length: ROWNO }, () =>
        new Uint8Array(COLNO));
    // Gnome at (4,4): mark its row/col visible.
    state.viz_array[4][4] = COULD_SEE;
    return { locations, state };
}

// Create a hostile gnome at (4,4) wielding a bow and carrying arrows, so
// m_has_launcher_and_ammo() returns true and m_balks_at_approaching() sets
// approach=-1.
function makeArmedGnome(state) {
    const bow = newObject({
        otyp: BOW,
        oclass: WEAPON_CLASS,
        quan: 1,
    });
    const arrows = newObject({
        otyp: ARROW,
        oclass: WEAPON_CLASS,
        quan: 5,
        nobj: null,
    });
    // Chain: bow -> arrows in minvent.
    bow.nobj = arrows;
    const gnome = newMonster({
        data: state.mons[PM_GNOME],
        mnum: PM_GNOME,
        m_id: 151,
        m_lev: state.mons[PM_GNOME].mlevel,
        mcanmove: true,
        mcansee: true,
        mhp: 10,
        mhpmax: 10,
        mx: 4, my: 4,          // Gnome position.
        mux: 6, muy: 4,        // Apparent hero position (set_apparxy overwrites).
        mflee: false,           // Not fleeing initially: approach starts at 1.
        mpeaceful: false,       // Hostile: m_balks_at_approaching fires.
        mconf: false,           // Not confused: the else block runs.
        minvent: bow,           // Inventory: bow + arrows.
        mw: bow,                // Wielded weapon: the bow.
        // MTSZ = 4 entries; zeroed positions avoid matching any candidate.
        mtrack: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ],
        misc_worn_check: 0,
    });
    // dist2(4,4, 6,4) = 4, which is < 25, so m_balks_at_approaching checks
    // m_has_launcher_and_ammo. The bow+arrows make it return true, and
    // approach becomes -1.
    return gnome;
}

test('m_balks_at_approaching runs before m_search_items: approach is -1',
    async () => {
        // C ref: monmove.c:1874-1878 precede monmove.c:1909. The balks check
        // changes approach from 1 to -1 for a hostile gnome with a launcher,
        // and the item search must see that -1 value.
        const { state } = makeState();
        const gnome = makeArmedGnome(state);
        state.level.monsters[4][4] = gnome;

        let capturedApproach;
        await m_move(gnome, {
            state,
            // rn2 is called by:
            //  - the shouldSee visibility check (rn2(11)): return 0 so
            //    the hero stays visible;
            //  - the peaceful gate (!rn2(10)): return 0 so passesPeacefulGate
            //    is true and the item search gate runs;
            //  - the lined_up inside item-search gate calls lined_up which
            //    does not call rn2 directly.
            random: { rn2: () => 0 },
            finishEating: () => {},
            movePet: () => { throw new Error('gnome is not tame'); },
            resistsTrapEffect: () => false,
            unsupported: (reason) => assert.fail(`unsupported: ${reason}`),
            // Intercept the item search to capture the approach value that
            // m_move passes to it. Before the fix, this was 1 (the pre-balks
            // value). After the fix, it is -1 (post-balks, set by
            // m_has_launcher_and_ammo).
            itemSearchInLine: () => false, // Not in line: getItems = true.
            searchItems(monster, goalX, goalY, approach) {
                capturedApproach = approach;
                // Return a neutral result: no items found, approach unchanged.
                return { goalX, goalY, approach, complete: false };
            },
            // Stop execution after the item search; movement selection is not
            // under test.
            mayCrossRegion: () => false,
            postMonsterMove(subject, oldX, oldY, status) {
                return status;
            },
        });

        // The gnome is hostile, has a bow+arrows, and is close to the hero
        // (dist2=4). m_balks_at_approaching (monmove.c:1878) should have set
        // approach=-1 BEFORE m_search_items was called.
        assert.equal(capturedApproach, -1,
            'm_search_items must receive the post-balks approach (-1), '
            + 'not the pre-balks approach (1)');
    });

test('m_balks_at_approaching does not fire for a distant monster',
    async () => {
        // C ref: monmove.c:1691. m_balks_at_approaching returns oldappr when
        // edist >= 25. A gnome far from the hero keeps approach=1.
        const { state } = makeState();
        // Place hero far away at (20,10) so dist2(4,4, 20,10) = 292 > 25.
        state.u.ux = 20;
        state.u.uy = 10;
        const gnome = makeArmedGnome(state);
        gnome.mux = 20;
        gnome.muy = 10;
        state.level.monsters[4][4] = gnome;

        let capturedApproach;
        await m_move(gnome, {
            state,
            random: { rn2: () => 0 },
            finishEating: () => {},
            movePet: () => { throw new Error('gnome is not tame'); },
            resistsTrapEffect: () => false,
            unsupported: (reason) => assert.fail(`unsupported: ${reason}`),
            itemSearchInLine: () => false,
            searchItems(monster, goalX, goalY, approach) {
                capturedApproach = approach;
                return { goalX, goalY, approach, complete: false };
            },
            mayCrossRegion: () => false,
            postMonsterMove(subject, oldX, oldY, status) {
                return status;
            },
        });

        // The gnome is too far away (dist2=292 >= 25), so
        // m_balks_at_approaching leaves approach unchanged at 1.
        assert.equal(capturedApproach, 1,
            'distant gnome keeps approach=1 because m_balks does not fire');
    });
