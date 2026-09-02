import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    MMOVE_NOTHING,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SHOPBASE,
} from '../js/const.js';
import { shk_move, UnsupportedShopError } from '../js/shk.js';
import { m_move } from '../js/monmove.js';

// A shopkeeper at its guard position in a shop it owns, with no bill,
// no robbery, no debit, peaceful, and not following.  This is the
// stationary return-0 path of C's shk_move() at shk.c:4976-4979.
function makeStationaryShopkeeper(overrides = {}) {
    const roomno = ROOMOFFSET;
    return {
        data: {
            mflags2: 0,
            mflags3: 0,
            mmove: 12,
        },
        isshk: true,
        isgd: false,
        ispriest: false,
        mtame: false,
        mcanmove: true,
        mcansee: true,
        mconf: false,
        meating: 0,
        mflee: false,
        mhp: 20,
        mhpmax: 20,
        minvis: false,
        mpeaceful: true,
        msleeping: false,
        mstun: false,
        mstrategy: 0,
        mtrapped: false,
        // Shopkeeper is at its guard position (3, 5).
        mx: 3,
        my: 5,
        mux: 10,
        muy: 10,
        mextra: {
            eshk: {
                shoproom: roomno,
                // C: ESHK(shkp)->shk is the guard position.
                shk: { x: 3, y: 5 },
                shoplevel: { dnum: 0, dlevel: 1 },
                following: false,
                robbed: 0,
                billct: 0,
                debit: 0,
            },
        },
        ...overrides,
    };
}

// Minimal initialized level that places the shopkeeper in a shop.  The
// monster grid is needed once shk_move() reaches priest.c:move_special().
function makeShopState({ ux = 10, uy = 10 } = {}) {
    const roomno = ROOMOFFSET;
    const room = {
        resident: null, // set below
        rtype: SHOPBASE,
    };
    const locations = Array.from({ length: COLNO }, () =>
        Array.from({ length: ROWNO }, () => ({
            edge: false,
            roomno,
            typ: ROOM,
        })));
    return {
        u: {
            ux,
            uy,
            uz: { dnum: 0, dlevel: 1 },
        },
        level: {
            locations,
            monsters: Array.from({ length: COLNO }, () =>
                Array(ROWNO).fill(null)),
            rooms: [room],
            at(x, y) { return locations[x]?.[y] ?? null; },
        },
    };
}

test('shk_move returns 0 for a stationary shopkeeper at guard position', () => {
    // C ref: shk.c:4976-4979.  A peaceful shopkeeper at its guard position
    // (GDIST == 0 < 3) with no bill, robbery, or debit returns 0 (didn't move).
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;

    const result = shk_move(shkp, state);

    // shk_move returns 0: the shopkeeper did not move.
    assert.equal(result, 0);
});

test('shk_move refuses an angry shopkeeper', () => {
    // C ref: shk.c:4897-4901.  An angry shopkeeper (mpeaceful === false)
    // calls mattacku(), which is not ported.  Keep the hero within dist2 < 3
    // so this close-combat branch is reached before move_special().
    const shkp = makeStationaryShopkeeper({ mpeaceful: false });
    const state = makeShopState({ ux: 4, uy: 5 });
    state.level.rooms[0].resident = shkp;

    assert.throws(
        () => shk_move(shkp, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('close combat'),
    );
});

test('shk_move refuses a following shopkeeper', () => {
    // C ref: shk.c:4903-4931.  A following shopkeeper would talk to the hero
    const shkp = makeStationaryShopkeeper();
    shkp.mextra.eshk.following = true;
    // C checks following speech only while the hero is within dist2 < 3.
    const state = makeShopState({ ux: 4, uy: 5 });
    state.level.rooms[0].resident = shkp;

    assert.throws(
        () => shk_move(shkp, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('following'),
    );
});

test('shk_move moves an indebted shopkeeper toward its guard', () => {
    // C ref: shk.c:4976-4993.  A debit prevents the stationary return at
    // GDIST < 3, so the keeper reaches move_special() and takes a step toward
    // its guard position.
    const shkp = makeStationaryShopkeeper();
    // Move the shopkeeper away from its guard position so GDIST >= 3.
    shkp.mx = 10;
    shkp.my = 10;
    shkp.mextra.eshk.debit = 100;
    const state = makeShopState({ ux: 20, uy: 20 });
    state.level.rooms[0].resident = shkp;
    // m_at() is part of move_special()'s initialized-level contract.
    state.level.monsters[shkp.mx][shkp.my] = shkp;

    assert.equal(shk_move(shkp, state, { planning: true }), 1);
    assert.deepEqual([shkp.mx, shkp.my], [9, 9]);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[9][9], shkp);
});

test('shk_fixes_damage is a no-op when level has no damagelist', () => {
    // C ref: shk.c:4558-4561.  find_damage() walks level.damagelist; when the
    // list is absent (null/undefined), it returns null and shk_fixes_damage
    // returns immediately.  Verifying indirectly through shk_move: the
    // shopkeeper passes through shk_fixes_damage without throwing.
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;
    // No damagelist on the level -- the default.
    assert.equal(state.level.damagelist, undefined);

    // shk_move calls shk_fixes_damage internally; it should not throw.
    assert.equal(shk_move(shkp, state), 0);
});

test('shk_fixes_damage refuses when damagelist exists', () => {
    // C ref: shk.c:4558-4576.  When find_damage() finds repairable damage,
    // C whispers an incantation and repairs it.  This port refuses rather
    // than implementing the repair path.
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;
    // Simulate existing damage on the level.
    state.level.damagelist = { next: null, where: { x: 4, y: 5 } };

    assert.throws(
        () => shk_move(shkp, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('damage'),
    );
});

test('m_move dispatches isshk monsters to shk_move, returns MMOVE_NOTHING', async () => {
    // C ref: monmove.c:1806-1827.  When m_move() encounters an isshk monster,
    // it calls shk_move() and returns through postmov().  The stationary case
    // (shk_move returns 0) passes MMOVE_NOTHING to postmov(), which returns
    // MMOVE_NOTHING.
    const shkp = makeStationaryShopkeeper({ mtrapped: false });
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;

    // m_move needs several injected operations.
    let postmovCalled = false;
    const env = {
        state,
        random: {
            d: () => assert.fail('unexpected d()'),
            rn1: () => assert.fail('unexpected rn1()'),
            rn2: () => assert.fail('unexpected rn2()'),
            rnd: () => assert.fail('unexpected rnd()'),
            rne: () => assert.fail('unexpected rne()'),
            rnl: () => assert.fail('unexpected rnl()'),
            rnz: () => assert.fail('unexpected rnz()'),
        },
        resistsTrapEffect: () => assert.fail('unexpected resistsTrapEffect'),
        finishEating: () => assert.fail('unexpected finishEating'),
        movePet: () => assert.fail('unexpected movePet for shopkeeper'),
        unsupported: (what) => assert.fail(`unexpected refusal: ${what}`),
        // Substitute postmov to verify it receives MMOVE_NOTHING.
        postMonsterMove: async (monster, omx, omy, status) => {
            postmovCalled = true;
            // The stationary shopkeeper passes MMOVE_NOTHING.
            assert.equal(status, MMOVE_NOTHING,
                'shopkeeper returning 0 from shk_move should pass MMOVE_NOTHING');
            return status;
        },
    };

    const result = await m_move(shkp, env);

    assert.equal(result, MMOVE_NOTHING);
    assert.ok(postmovCalled, 'postmov must be called for the stationary shk');
});
