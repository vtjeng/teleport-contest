import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO,
    D_BROKEN,
    D_CLOSED,
    DOOR,
    MMOVE_NOTHING,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    REPAIR_DELAY,
    SHOPBASE,
} from '../js/const.js';
import {
    after_shk_move,
    find_damage,
    fix_shop_damage,
    repairable_damage,
    shk_impaired,
    shk_move,
    UnsupportedShopError,
} from '../js/shk.js';
import { m_move } from '../js/monmove.js';
import { monst_globals_init, PM_SHOPKEEPER } from '../js/monsters.js';

const SHK_C_SOURCE = readFileSync('nethack-c/upstream/src/shk.c', 'utf8');
const SHK_JS_SOURCE = readFileSync('js/shk.js', 'utf8');

// C's special shopkeeper form has the full fixed-size permonst attack array.
const TEST_MONSTERS = monst_globals_init({});

// A shopkeeper at its guard position in a shop it owns, with no bill,
// no robbery, no debit, peaceful, and not following.  This is the
// stationary return-0 path of C's shk_move() at shk.c:4976-4979.
function makeStationaryShopkeeper(overrides = {}) {
    const roomno = ROOMOFFSET;
    return {
        data: TEST_MONSTERS[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER,
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
        mons: TEST_MONSTERS,
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

test('shk_move returns 0 for a stationary shopkeeper at guard position', async () => {
    // C ref: shk.c:4976-4979.  A peaceful shopkeeper at its guard position
    // (GDIST == 0 < 3) with no bill, robbery, or debit returns 0 (didn't move).
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;

    const result = await shk_move(shkp, state);

    // shk_move returns 0: the shopkeeper did not move.
    assert.equal(result, 0);
});

test('after_shk_move resets the sentinel before checking the hero room', async () => {
    const shopkeeper = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms.push({ rtype: ROOM });
    state.level.at(10, 10).roomno = ROOMOFFSET + 1;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.u.urooms = [0, 0, 0, 0, 0];
    state.u.ushops = [0, 0, 0, 0, 0];
    shopkeeper.mextra.eshk.bill = [{ price: 5, bquan: 1 }];
    shopkeeper.mextra.eshk.bill_p = -1000;

    await after_shk_move(shopkeeper, state);

    assert.deepEqual(shopkeeper.mextra.eshk.bill_p, [{ price: 5, bquan: 1 }]);
    assert.equal(state.u.urooms[0], ROOMOFFSET + 1,
        'the source check updates the hero room state');
    const cStart = SHK_C_SOURCE.indexOf('after_shk_move(struct monst *shkp)');
    const cEnd = SHK_C_SOURCE.indexOf('\n}', cStart);
    const cFunction = SHK_C_SOURCE.slice(cStart, cEnd);
    assert.match(cFunction,
        /eshkp->bill_p = &eshkp->bill\[0\];[\s\S]*?check_special_room\(FALSE\);/u);
    const jsStart = SHK_JS_SOURCE.indexOf('export function after_shk_move(');
    const jsEnd = SHK_JS_SOURCE.indexOf('// C ref: shk.c is_fshk()', jsStart);
    const jsFunction = SHK_JS_SOURCE.slice(jsStart, jsEnd);
    assert.match(jsFunction,
        /extension\.bill_p = extension\.bill \?\? \[\];[\s\S]*?await check_special_room\(false, state,/u);
});

test('shk_move completes adjacent angry combat before returning zero', async () => {
    // shk.c:4897-4901 consumes no result but completes mattacku first.
    // Cardinal adjacency also admits the grid-bug polymorph form.
    const shkp = makeStationaryShopkeeper({ mpeaceful: false });
    const state = makeShopState({ ux: 4, uy: 5 });
    state.level.rooms[0].resident = shkp;
    const order = [];
    let finishAttack;
    const attackPending = new Promise(resolve => { finishAttack = resolve; });
    const result = shk_move(shkp, state, {
        attackHero: async (subject, env) => {
            assert.equal(subject, shkp);
            assert.equal(env.state, state);
            await attackPending;
            order.push('attack completed');
            return 1; // C discards the monster-death result at this call site.
        },
    });
    let settled = false;
    result.then(() => { settled = true; });
    assert.deepEqual(order, []);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'shk_move waits while mattacku is pending');
    finishAttack();
    assert.equal(await result, 0);
    assert.equal(settled, true);
    assert.deepEqual(order, ['attack completed']);
});

test('shk_move refuses a following shopkeeper', async () => {
    // C ref: shk.c:4903-4931.  A following shopkeeper would talk to the hero
    const shkp = makeStationaryShopkeeper();
    shkp.mextra.eshk.following = true;
    // C checks following speech only while the hero is within dist2 < 3.
    const state = makeShopState({ ux: 4, uy: 5 });
    state.level.rooms[0].resident = shkp;

    await assert.rejects(
        () => shk_move(shkp, state),
        (err) => err instanceof UnsupportedShopError
            && err.message.includes('following'),
    );
});

test('shk_move moves an indebted shopkeeper toward its guard', async () => {
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

    assert.equal(await shk_move(shkp, state, { planning: true }), 1);
    assert.deepEqual([shkp.mx, shkp.my], [9, 9]);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[9][9], shkp);
});

test('shk_fixes_damage is a no-op when level has no damagelist', async () => {
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
    assert.equal(await shk_move(shkp, state), 0);
});

test('shk_fixes_damage leaves newly recorded damage until REPAIR_DELAY', async () => {
    // C ref: shk.c:4465 and 4558-4576. This fresh record is one turn old,
    // below the source's five-turn repair delay, so shk_move must leave it.
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState({ ux: 3, uy: 5 });
    state.level.rooms[0].resident = shkp;
    const damage = {
        when: 0, // The new record was made at the start of this fixture.
        place: { x: 4, y: 5 },
        cost: 400, // A standard shop-door repair record.
        typ: ROOM,
        flags: 0,
        next: null,
    };
    state.moves = 1;
    state.level.damagelist = damage;

    assert.equal(shk_impaired(shkp, state), false);
    assert.equal(repairable_damage(damage, shkp, state), false);
    assert.equal(find_damage(shkp, state), null);
    await shk_move(shkp, state, {
        random: {
            rnd: () => 0, // Deterministic fallback if movement reaches it.
            rn2: () => 0, // This fixture should not depend on global RNG.
        },
    });
    assert.equal(state.level.damagelist, damage);
});

test('find_damage selects the first record after its source repair delay', () => {
    // C ref: shk.c:4454-4506. ROOM damage skips terrain occupancy checks;
    // the keeper owns this shop square, and five elapsed turns make it ready.
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;
    state.moves = REPAIR_DELAY;
    const damage = {
        when: 0, // This record is exactly REPAIR_DELAY turns old.
        place: { x: 4, y: 5 },
        cost: 400, // A standard shop-door repair record.
        typ: ROOM,
        flags: 0,
        next: null,
    };
    state.level.damagelist = damage;

    assert.equal(repairable_damage(damage, shkp, state), true);
    assert.equal(find_damage(shkp, state), damage);
    shkp.mextra.eshk.following = true;
    assert.equal(shk_impaired(shkp, state), true);
    assert.equal(find_damage(shkp, state), null);
});

test('fix_shop_damage silently restores and discards eligible terrain damage', async () => {
    // The catch-up path repairs a previously damaged door before gameplay
    // resumes; this fixture isolates the C catchup=TRUE branch.
    const sourceStart = SHK_C_SOURCE.indexOf('\nfix_shop_damage(void)');
    assert.ok(sourceStart >= 0, 'C fix_shop_damage definition is present');
    const source = SHK_C_SOURCE.slice(sourceStart);
    assert.match(source, /repair_damage\(shkp, damg, TRUE\)/u);
    assert.match(source, /discard_damage_struct\(damg\)/u);
    const shkp = makeStationaryShopkeeper();
    const state = makeShopState();
    state.level.rooms[0].resident = shkp;
    state.level.monlist = shkp;
    state.moves = REPAIR_DELAY;
    const location = state.level.at(4, 5);
    location.typ = DOOR;
    location.flags = D_BROKEN;
    location.doormask = D_BROKEN;
    const damage = {
        when: 0, // Exactly REPAIR_DELAY turns have elapsed.
        place: { x: 4, y: 5 },
        cost: 400, // The door damage record from the C path.
        typ: DOOR,
        flags: 0,
        next: null,
    };
    state.level.damagelist = damage;

    await fix_shop_damage(state);

    assert.equal(location.typ, DOOR);
    assert.equal(location.flags, D_CLOSED);
    assert.equal(location.doormask, D_CLOSED);
    assert.equal(state.level.damagelist, null);
    assert.equal(damage.next, null);
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
