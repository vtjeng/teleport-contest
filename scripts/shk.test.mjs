import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BUFSZ,
    HUNGRY,
    HALLUC,
    HALLUC_RES,
    MS_HUMANOID,
    MS_SELL,
    MAXNROFROOMS,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    OBJ_ONBILL,
    PLINE_SPEECH,
    PLINE_VERBALIZE,
    ROOMOFFSET,
    SHARED,
    SHOPBASE,
    TT_PIT,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    COIN_CLASS,
    objects_globals_init,
    POT_WATER,
    DIAMOND,
    RUBY,
    DART,
    CORPSE,
    CHAIN_MAIL,
    FOOD_RATION,
    BAG_OF_TRICKS,
    MAGIC_LAMP,
    MAGIC_MARKER,
    OIL_LAMP,
    POT_HEALING,
    SPE_NOVEL,
    SPBOOK_CLASS,
    TOOL_CLASS,
    PICK_AXE,
    TALLOW_CANDLE,
    WAN_SLEEP,
    SACK,
    LEASH,
    STRANGE_OBJECT,
    WEAPON_CLASS,
} from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    append_price_quote,
    addupbill,
    add_damage,
    contained_gold,
    clear_no_charge_pets,
    costly_adjacent,
    check_unpaid_usage,
    angry_shk_exists,
    get_cost,
    cost_per_charge,
    get_pricing_units,
    getprice,
    gem_learned,
    inside_shop,
    find_objowner,
    hot_pursuit,
    inhishop,
    make_happy_shk,
    is_unpaid,
    oid_price_adjustment,
    onshopbill,
    pick_pick,
    record_price_quote,
    restshk,
    same_price,
    shop_debt,
    shkgone,
    shop_keeper,
    shopdig,
    Shk_Your,
    shk_your,
    u_entered_shop,
} from '../js/shk.js';
import { hidden_gold } from '../js/vault.js';
import {
    monst_globals_init,
    PM_GOBLIN,
    PM_MEDUSA,
    PM_ORACLE,
    PM_ROGUE,
    PM_SHOPKEEPER,
    PM_TOURIST,
    PM_WATCHMAN,
} from '../js/monsters.js';

const C_SHK = readFileSync('nethack-c/upstream/src/shk.c', 'utf8');
const C_HACK = readFileSync('nethack-c/upstream/include/hack.h', 'utf8');
const JS_SHK = readFileSync('js/shk.js', 'utf8');
const C_DIG = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
const JS_DIG = readFileSync('js/dig.js', 'utf8');
const C_TRAP = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const JS_TRAP = readFileSync('js/trap.js', 'utf8');

function sourceBody(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} is present`);
    return source.slice(start);
}

test('addupbill sums exactly the active bill entries', () => {
    // C ref: shk.c addupbill() (496-507).  billct bounds the pointer walk;
    // entries after it must not contribute.
    const shopkeeper = {
        mextra: {
            eshk: {
                billct: 3,
                bill_p: [
                    { price: 7, bquan: 2 },
                    { price: 11, bquan: 1 },
                    { price: 3, bquan: 5 },
                    { price: 99, bquan: 9 },
                ],
            },
        },
    };
    assert.equal(addupbill(shopkeeper), 40);
    shopkeeper.mextra.eshk.billct = 0;
    assert.equal(addupbill(shopkeeper), 0);
});

test('shop_debt includes only the active bill entries', () => {
    const eshk = {
        debit: 5,
        billct: 2,
        bill_p: [
            // The first bill line costs 7 and covers two objects.
            { price: 7, bquan: 2 },
            // The second active line costs 11 for one object.
            { price: 11, bquan: 1 },
            // This inactive line must not contribute to the debt.
            { price: 99, bquan: 9 },
        ],
    };
    assert.equal(shop_debt(eshk), 30);
});

function billShopkeeper(roomno, bill, next = null) {
    return {
        mhp: 10,
        mcanmove: true,
        isshk: true,
        mpeaceful: true,
        nmon: next,
        mextra: {
            eshk: {
                shoproom: roomno,
                shoplevel: { dnum: 0, dlevel: 1 },
                billct: bill.length,
                bill_p: bill,
                surcharge: false,
            },
        },
    };
}

test('shop_keeper applies the anger surcharge once to active bill entries', () => {
    // shk.c shop_keeper():1060-1062 calls rile_shk(), whose :1374 formula
    // rounds up a third. Prices 1, 3, and 4 cover both rounding boundaries;
    // the fourth entry is inactive and must remain unchanged.
    const bill = [{ price: 1 }, { price: 3 }, { price: 4 }, { price: 9 }];
    const keeper = billShopkeeper(ROOMOFFSET, bill);
    keeper.mpeaceful = false;
    keeper.mextra.eshk.billct = 3;
    const state = { level: { rooms: [{ resident: keeper }] } };

    assert.equal(shop_keeper(ROOMOFFSET, state), keeper);
    assert.equal(keeper.mextra.eshk.surcharge, true);
    assert.deepEqual(bill.map((entry) => entry.price), [2, 4, 6, 9]);
    assert.equal(shop_keeper(ROOMOFFSET, state), keeper);
    assert.deepEqual(bill.map((entry) => entry.price), [2, 4, 6, 9]);
});

test('hot_pursuit angers the keeper and clears floor and pet no-charge flags', () => {
    const cBody = C_SHK.match(
        /void\s+hot_pursuit\(struct monst \*shkp\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cBody, 'the whole C hot_pursuit definition is present');
    assert.match(cBody, /if \(!shkp->isshk\)\s*return;/u);
    assert.match(
        cBody,
        /rile_shk\(shkp\);\s*\(void\) strncpy\(ESHK\(shkp\)->customer,\s*svp\.plname, PL_NSIZ\);\s*ESHK\(shkp\)->following = 1;/u,
    );
    assert.match(
        cBody,
        /clear_no_charge\(\(struct monst \*\) NULL, fobj\);\s*clear_no_charge_pets\(shkp\);/u,
    );
    const jsCaller = JS_SHK.slice(
        JS_SHK.indexOf('export async function stolen_value('),
        JS_SHK.indexOf('// C ref: shk.c onshopbill()'),
    );
    assert.match(
        jsCaller,
        /hot_pursuit\(shkp, state\);\s*await angry_guards\(false, \{ state \}\);/u,
    );
    assert.doesNotMatch(jsCaller, /note_unported\('shk\.c hot_pursuit'\)/u);

    // These active bill prices exercise C's one-time rounded-up-third surcharge.
    const bill = [{ price: 1 }, { price: 3 }, { price: 4 }];
    const keeper = billShopkeeper(ROOMOFFSET, bill);
    keeper.mextra.eshk.surcharge = false;
    keeper.mextra.eshk.customer = '';
    keeper.mextra.eshk.following = false;

    // This nested floor object verifies that hot_pursuit clears the whole fobj tree.
    const contained = {
        where: OBJ_CONTAINED,
        no_charge: true,
        cobj: null,
        nobj: null,
    };
    const floorItem = {
        where: OBJ_FLOOR,
        no_charge: true,
        cobj: contained,
        nobj: null,
    };
    // C clears pet inventories only for tame monsters in fmon.
    const petItem = { where: OBJ_MINVENT, no_charge: true, cobj: null, nobj: null };
    const pet = { mtame: true, minvent: petItem, nmon: null };
    const wildItem = { where: OBJ_MINVENT, no_charge: true, cobj: null, nobj: null };
    const wild = { mtame: false, minvent: wildItem, nmon: null };
    pet.nmon = wild;
    // The short name stays within C's PL_NSIZ buffer and copies without truncation.
    const state = {
        plname: 'Aster',
        level: { objlist: floorItem, monlist: pet },
    };

    hot_pursuit(keeper, state);

    assert.equal(keeper.mpeaceful, false);
    assert.equal(keeper.mextra.eshk.surcharge, true);
    assert.deepEqual(bill.map((entry) => entry.price), [2, 4, 6]);
    assert.equal(keeper.mextra.eshk.customer, 'Aster');
    assert.equal(keeper.mextra.eshk.following, true);
    assert.equal(floorItem.no_charge, false);
    assert.equal(contained.no_charge, false);
    assert.equal(petItem.no_charge, false);
    assert.equal(wildItem.no_charge, true);

    // C returns before any pursuit state changes for a non-shopkeeper.
    const nonKeeper = { isshk: false, mpeaceful: true };
    hot_pursuit(nonKeeper, state);
    assert.equal(nonKeeper.mpeaceful, true);
});

test('make_angry_shk clears net debt with credit and chooses its message before hot pursuit', async () => {
    const recipe = JSON.parse(readFileSync(
        'recipes/do.c/dodrop-in-generated-shop-cancel-9701133.session.json',
        'utf8',
    ));
    await runSegment(recipe.segments[0]);
    const roomNo = game.level.at(game.u.ux, game.u.uy).roomno;
    const keeper = shop_keeper(roomNo, game);
    assert.ok(keeper?.isshk && keeper.mextra?.eshk);
    const { make_angry_shk } = await import('../js/shk.js');
    assert.equal(typeof make_angry_shk, 'function');

    const eshk = keeper.mextra.eshk;
    eshk.billct = 0;
    eshk.bill_p = [];
    eshk.debit = 2;
    eshk.loan = 1;
    eshk.credit = 7;
    eshk.robbed = 3;
    eshk.following = false;
    eshk.surcharge = false;
    keeper.mpeaceful = true;
    const messages = [];
    const peacefulAtMessage = [];
    await make_angry_shk(keeper, keeper.mx, keeper.my, game, {
        message: async (line) => {
            messages.push(line);
            peacefulAtMessage.push(keeper.mpeaceful);
        },
    });
    assert.equal(eshk.robbed, 0,
        'bill + debit + loan - credit is clamped at zero');
    assert.equal(eshk.debit, 0);
    assert.equal(eshk.loan, 0);
    assert.equal(eshk.credit, 0);
    assert.equal(eshk.following, true);
    assert.equal(eshk.customer, game.plname);
    assert.equal(keeper.mpeaceful, false);
    assert.equal(peacefulAtMessage[0], true,
        'the message is formatted before hot_pursuit changes peacefulness');
    assert.match(messages[0], /gets angry!$/u);

    messages.length = 0;
    peacefulAtMessage.length = 0;
    eshk.billct = 0;
    eshk.debit = 0;
    eshk.loan = 0;
    eshk.credit = 0;
    eshk.robbed = 0;
    keeper.mpeaceful = false;
    await make_angry_shk(keeper, keeper.mx, keeper.my, game, {
        message: async (line) => {
            messages.push(line);
            peacefulAtMessage.push(keeper.mpeaceful);
        },
    });
    assert.match(messages[0], /is furious!$/u,
        'a keeper already angry before hot_pursuit gets the furious wording');
    assert.deepEqual(peacefulAtMessage, [false]);
});

test('shk_move keeps C distu avoidance threshold in squared-distance units', () => {
    const cBody = C_SHK.match(
        /shk_move\(struct monst \*shkp\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cBody, 'the C shk_move definition is present');
    assert.match(cBody, /avoid = \(\*u\.ushops && distu\(gtx, gty\) > 8\);/u);
    assert.match(
        C_HACK,
        /#define distu\(xx, yy\) dist2\(\(coordxy\) \(xx\), \(coordxy\) \(yy\), u\.ux, u\.uy\)/u,
    );

    const jsBody = sourceBody(JS_SHK, 'export async function shk_move(');
    assert.match(
        jsBody,
        /dist2\(gtx, gty, hero\.ux, hero\.uy\) > 8/u,
    );
    assert.doesNotMatch(
        jsBody,
        /dist2\(gtx, gty, hero\.ux, hero\.uy\) > 64/u,
    );
});

test('nested shop identity reaches keeper and deserted-shop handling', async () => {
    // C stores subrooms after MAXNROFROOMS; this shop identity exercises the
    // nested-room resolver in inside_shop(), shop_keeper(), and the
    // u_entered_shop() -> deserted_shop() production path.
    const state = {
        level: new GameMap(),
        u: {
            // These adjacent positions model entering from outside at a
            // normal interior square in the child shop.
            ux: 12, uy: 6, ux0: 10, uy0: 6,
            ushops: [0, 0, 0, 0, 0],
        },
    };
    // C allocates subrooms after MAXNROFROOMS; offset three avoids colliding
    // with the ordinary room indices in this synthetic fixture.
    const roomIndex = MAXNROFROOMS + 3;
    const roomno = roomIndex + ROOMOFFSET;
    const subroom = {
        roomnoidx: roomIndex,
        // SHOPBASE + 1 selects a concrete shop type for C's shop test.
        rtype: SHOPBASE + 1,
        // This rectangle contains (12, 6), the hero's fixture square.
        lx: 12, hx: 13, ly: 6, hy: 7,
    };
    const parent = {
        roomnoidx: 0,
        rtype: 0,
        nsubrooms: 1,
        sbrooms: [subroom],
    };
    state.level.rooms = [parent];
    state.level.at(12, 6).roomno = roomno;
    const keeper = billShopkeeper(roomno, []);
    keeper.mpeaceful = true;
    subroom.resident = keeper;

    assert.match(C_SHK, /#define IS_SHOP\(x\) \(svr\.rooms\[x\]\.rtype >= SHOPBASE\)/u);
    assert.match(
        sourceBody(C_SHK, 'inside_shop(coordxy x, coordxy y)'),
        /rno = levl\[x\]\[y\]\.roomno;\s*if \(\(rno < ROOMOFFSET\)\s*\|\| levl\[x\]\[y\]\.edge \|\| !IS_SHOP\(rno - ROOMOFFSET\)\)/u,
    );
    assert.equal(inside_shop(12, 6, state), roomno);
    assert.equal(shop_keeper(roomno, state), keeper);

    // Removing the resident reaches deserted_shop() through the same entry
    // helper; the message proves it read the child room's coordinates.
    subroom.resident = null;
    const messages = [];
    await u_entered_shop([roomno], state, {
        message: async (text) => messages.push(text),
    });
    assert.deepEqual(messages, ['This shop is deserted.']);
});

test('restshk pacifies a ghostly keeper for a different customer', () => {
    // shk.c restshk():303-304 calls pacify_shk(TRUE); :1355-1356 subtracts
    // a rounded-up quarter. These are the surcharged 1, 3, and 4 prices from
    // the preceding test, so the restored bill returns to those values.
    const bill = [{ price: 2 }, { price: 4 }, { price: 6 }];
    const keeper = billShopkeeper(ROOMOFFSET, bill);
    keeper.mpeaceful = false;
    keeper.mextra.eshk.surcharge = true;
    keeper.mextra.eshk.customer = 'Former';
    keeper.mextra.eshk.bill = bill;
    const state = {
        plname: 'Current',
        // A later dungeon depth exercises restshk's home-level assignment.
        u: { uz: { dnum: 0, dlevel: 2 } },
    };
    restshk(keeper, true, state);
    assert.equal(keeper.mpeaceful, true);
    assert.equal(keeper.mextra.eshk.surcharge, false);
    assert.equal(keeper.mextra.eshk.bill_p, bill);
    assert.deepEqual(bill.map((entry) => entry.price), [1, 3, 4]);
    assert.deepEqual(keeper.mextra.eshk.shoplevel, state.u.uz);
});

function ownershipShopkeeper(roomno, bill, next = null) {
    const shopkeeper = billShopkeeper(roomno, bill, next);
    shopkeeper.mx = 5;
    shopkeeper.my = 6;
    return shopkeeper;
}

test('find_objowner checks every bill and falls back to the first room keeper', () => {
    const billed = { o_id: 111, unpaid: true, where: OBJ_ONBILL };
    const roomObject = { o_id: 112, unpaid: true, where: OBJ_FLOOR };
    const first = ownershipShopkeeper(ROOMOFFSET, []);
    const second = ownershipShopkeeper(ROOMOFFSET + 1, [
        { bo_id: billed.o_id, price: 12, bquan: 1 },
    ]);
    first.nmon = second;
    const state = {
        u: { uz: { dnum: 0, dlevel: 1 } },
        level: {
            monlist: first,
            rooms: [
                { rtype: SHOPBASE, resident: first },
                { rtype: SHOPBASE, resident: second },
            ],
            at: () => ({ roomno: ROOMOFFSET, edge: false }),
        },
    };

    // Used-up objects ignore their stale coordinates and search all bills.
    assert.equal(find_objowner(billed, 99, 99, state), second);
    // A floor object uses the room walk and retains the first keeper when no
    // bill matches it.
    assert.equal(find_objowner(roomObject, 4, 5, state), first);
});

test('onshopbill preserves the silent onbill boolean contract', () => {
    const object = { o_id: 113, unpaid: true };
    const shopkeeper = ownershipShopkeeper(ROOMOFFSET, [
        { bo_id: object.o_id, price: 8, bquan: 1 },
    ]);
    assert.equal(onshopbill(object, shopkeeper, true), true);
    assert.equal(
        onshopbill({ o_id: 114, unpaid: false }, shopkeeper, true), false,
    );
});

test('costly_adjacent keeps only tended shop edges and the free spot', () => {
    const shopkeeper = ownershipShopkeeper(ROOMOFFSET, []);
    shopkeeper.mextra.eshk.shk = { x: 5, y: 6 };
    const state = {
        u: { uz: { dnum: 0, dlevel: 1 } },
        level: {
            rooms: [{ rtype: SHOPBASE, resident: shopkeeper }],
            at: (x, y) => ({
                roomno: ROOMOFFSET,
                edge: x === 4 && y === 5,
            }),
        },
    };

    assert.equal(costly_adjacent(shopkeeper, 4, 5, state), true);
    assert.equal(costly_adjacent(shopkeeper, 5, 6, state), true);
    assert.equal(costly_adjacent(shopkeeper, 7, 8, state), false);
    assert.equal(costly_adjacent(null, 4, 5, state), false);
});

test('is_unpaid includes unpaid objects nested inside containers', () => {
    const paid = { unpaid: false, cobj: null };
    const unpaid = { unpaid: true, cobj: null };
    const inner = { unpaid: false, cobj: unpaid, nobj: null };
    const outer = { unpaid: false, cobj: inner };

    assert.equal(is_unpaid(paid), false);
    assert.equal(is_unpaid(unpaid), true);
    assert.equal(is_unpaid(outer), true);
});

test('same_price requires one shopkeeper and one quoted price', () => {
    const first = { o_id: 101, unpaid: true };
    const second = { o_id: 102, unpaid: true };
    const other = { o_id: 103, unpaid: true };
    const firstShopkeeper = billShopkeeper(ROOMOFFSET, [
        // Both first objects quote 12, the same price required for merging.
        { bo_id: first.o_id, price: 12, bquan: 1 },
        { bo_id: second.o_id, price: 12, bquan: 1 },
    ]);
    const secondShopkeeper = billShopkeeper(ROOMOFFSET + 1, [
        // This object belongs to a different shopkeeper despite its price.
        { bo_id: other.o_id, price: 12, bquan: 1 },
    ]);
    firstShopkeeper.nmon = secondShopkeeper;
    const state = {
        level: { monlist: firstShopkeeper },
    };

    assert.equal(same_price(first, second, state), true);
    assert.equal(same_price(first, other, state), false);
    firstShopkeeper.mextra.eshk.bill_p[1].price = 13;
    assert.equal(same_price(first, second, state), false);
});

function pickState(shopkeeper) {
    const state = {};
    objects_globals_init(state);
    // A zero-valued initializer keeps this source-pinned test deterministic.
    init_objects(state, () => 0);
    state.flags = { female: false };
    state.moves = 100001;
    state.gp = { pline_flags: 0 };
    state.u = {
        ushops: [ROOMOFFSET],
        uz: { dnum: 0, dlevel: 1 },
        uprops: {},
        uroleplay: {},
    };
    state.youmonst = { data: {} };
    state.level = {
        rooms: [{ rtype: SHOPBASE, resident: shopkeeper }],
        at: () => ({ roomno: ROOMOFFSET, edge: false }),
    };
    shopkeeper.mx = 2;
    shopkeeper.my = 2;
    return state;
}

test('cost_per_charge follows the complete shk.c item-rate formula', () => {
    const keeper = ownershipShopkeeper(ROOMOFFSET, []);
    const state = pickState(keeper);
    assert.equal(cost_per_charge(keeper, {
        otyp: MAGIC_LAMP, oclass: TOOL_CLASS, spe: 1, dknown: true,
    }, false, state), Math.trunc(state.objects[OIL_LAMP].oc_cost));
    const marker = {
        otyp: MAGIC_MARKER, oclass: TOOL_CLASS, spe: 50,
        dknown: true,
    };
    const markerPrice = get_cost(marker, keeper, state);
    assert.equal(cost_per_charge(keeper, marker, false, state),
        Math.trunc(markerPrice / 2));

    const bag = {
        otyp: BAG_OF_TRICKS, oclass: TOOL_CLASS, spe: 3,
        dknown: true,
    };
    const bagPrice = get_cost(bag, keeper, state);
    assert.equal(cost_per_charge(keeper, bag, false, state),
        Math.trunc(bagPrice / 5));
    assert.equal(cost_per_charge(keeper, bag, true, state), bagPrice);

    const cCost = sourceBody(C_SHK, 'staticfn long\ncost_per_charge(');
    assert.match(cCost, /tmp \/= 2L;/u);
    assert.match(cCost, /if \(!altusage\)\s+tmp \/= 5L;/u);
    assert.match(cCost, /if \(!altusage\)\s+tmp = \(long\) objects\[OIL_LAMP\]\.oc_cost;/u);
});

test('unpaid novel use speaks the C library fee and increments debt', async () => {
    const keeper = ownershipShopkeeper(ROOMOFFSET, []);
    keeper.data = { msound: MS_SELL };
    keeper.mextra.eshk.debit = 5;
    const state = pickState(keeper);
    state.u.uprops[HALLUC] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    state.youmonst.data = {};
    const book = {
        otyp: SPE_NOVEL,
        oclass: SPBOOK_CLASS,
        unpaid: true,
        spe: 0,
        dknown: true,
    };
    const messages = [];
    const draws = [];
    const random = { rn2(bound) { draws.push(bound); return 0; } };
    const before = keeper.mextra.eshk.debit;

    await check_unpaid_usage(book, false, state, {
        random,
        message: async (text) => messages.push(text),
    });

    assert.deepEqual(draws, [2, 19]);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /You owe/u);
    assert.equal(keeper.mextra.eshk.debit - before,
        cost_per_charge(keeper, book, false, state));
});

test('pick_pick warns once per move and preserves speech formatting', async () => {
    const shopkeeper = billShopkeeper(ROOMOFFSET, []);
    shopkeeper.data = { msound: MS_SELL };
    const state = pickState(shopkeeper);
    const pick = newObject({
        otyp: PICK_AXE,
        oclass: WEAPON_CLASS,
        unpaid: false,
    });
    const messages = [];

    await pick_pick(pick, state, {
        message: async (text) => messages.push(text),
    });
    await pick_pick(pick, state, {
        message: async (text) => messages.push(text),
    });
    state.moves = 100002;
    await pick_pick(pick, state, {
        message: async (text) => messages.push(text),
    });

    assert.deepEqual(messages, [
        '"You sneaky beast!  Get out of here with that pick!"',
        '"You sneaky beast!  Get out of here with that pick!"',
    ]);
    assert.equal(state.gp.pline_flags, 0);
});

// The four seen-price fields carry init_objects()'s sentinel until
// record_price_quote() writes one. These formatter cases set them directly so
// each buy/sell shape is independent. Expected strings are read from shk.c
// append_price_quote().
function priceState(seen = {}) {
    const state = {};
    objects_globals_init(state);
    // Fixed zero choices initialize the catalog without consuming randomness.
    init_objects(state, () => 0);
    Object.assign(state.objects[POT_WATER], seen);
    return state;
}

test('append_price_quote formats the buy and sell halves shk.c writes', () => {
    // C returns without writing when both ranges are still inverted, which is
    // every type in a game that has met no shopkeeper.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 1, oc_buy_maxseen: 0,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        '',
    );

    // A single seen value prints alone; min < max prints as a range.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 20,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        ' {buy 20}',
    );
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 30,
            oc_sell_minseen: 1, oc_sell_maxseen: 0,
        })),
        ' {buy 20-30}',
    );
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 1, oc_buy_maxseen: 0,
            oc_sell_minseen: 5, oc_sell_maxseen: 5,
        })),
        ' {sell 5}',
    );

    // With both halves present the separator is the single space C's `sep`
    // holds once the buy half has printed.
    assert.equal(
        append_price_quote('', POT_WATER, priceState({
            oc_buy_minseen: 20, oc_buy_maxseen: 30,
            oc_sell_minseen: 5, oc_sell_maxseen: 8,
        })),
        ' {buy 20-30 sell 5-8}',
    );
});

test('append_price_quote drops the whole suffix when it would overrun', () => {
    const state = priceState({
        oc_buy_minseen: 20, oc_buy_maxseen: 30,
        oc_sell_minseen: 5, oc_sell_maxseen: 8,
    });
    const quote = ' {buy 20-30 sell 5-8}';

    // C appends only while len2 < BUFSZ - len - 1, where len is the caller's
    // current length. The longest buffer that still admits the suffix leaves
    // exactly one character of slack.
    const fits = 'x'.repeat(BUFSZ - quote.length - 2);
    assert.equal(append_price_quote(fits, POT_WATER, state), quote);
    assert.equal(append_price_quote(`${fits}x`, POT_WATER, state), '');
});

function pricedObject(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    return newObject({
        otyp,
        oclass: type.oc_class,
        // One unit isolates get_cost()'s per-unit arithmetic.
        quan: 1,
        dknown: true,
        o_id: 3,
        ...overrides,
    });
}

function costState(charisma = 11) {
    const state = priceState();
    state.u = {
        // ACURR(A_CHA) reads base, bonus, and temporary values. Zero bonuses
        // isolate each source charisma partition in the table below.
        acurr: { a: [10, 10, 10, 10, 10, charisma] },
        abon: [0, 0, 0, 0, 0, 0],
        atemp: [0, 0, 0, 0, 0, 0],
        uhs: 0,
        ulevel: 10,
    };
    state.urole = { mnum: -1 };
    return state;
}

test('gem_learned reprices matching bill entries and all gems for STRANGE_OBJECT', () => {
    // C shk.c:gem_learned() walks each bill-bearing live shopkeeper, resolves
    // bo_id with find_oid(), and updates each matching bill price.
    const state = costState();
    const diamond = pricedObject(state, DIAMOND, { o_id: 41 });
    const ruby = pricedObject(state, RUBY, { o_id: 42 });
    const potion = pricedObject(state, POT_HEALING, { o_id: 43 });
    diamond.nobj = ruby;
    ruby.nobj = potion;
    state.invent = diamond;

    const bill = [
        { bo_id: 41, price: 900 },
        { bo_id: 42, price: 901 },
        { bo_id: 43, price: 902 },
        { bo_id: 44, price: 903 },
        { bo_id: 41, price: 904 }, // outside billct
    ];
    const keeper = billShopkeeper(ROOMOFFSET, bill);
    keeper.mextra.eshk.billct = 4;
    state.level = {
        monlist: keeper,
        objlist: null,
        buriedobjlist: null,
    };

    state.objects[DIAMOND].oc_name_known = 1;
    const identifiedDiamondPrice = get_cost(diamond, keeper, state);
    gem_learned(DIAMOND, state);
    assert.equal(bill[0].price, identifiedDiamondPrice);
    assert.equal(bill[1].price, 901);
    assert.equal(bill[2].price, 902);
    assert.equal(bill[3].price, 903); // The missing final id leaves C's pointer there.
    assert.equal(bill[4].price, 904);

    state.objects[RUBY].oc_name_known = 1;
    const identifiedRubyPrice = get_cost(ruby, keeper, state);
    gem_learned(STRANGE_OBJECT, state);
    assert.equal(bill[0].price, identifiedDiamondPrice);
    assert.equal(bill[1].price, identifiedRubyPrice);
    assert.equal(bill[2].price, 902);
    assert.equal(bill[4].price, 904);

    const cBody = sourceBody(C_SHK, '\ngem_learned(int oindx)');
    assert.match(cBody,
        /for \(shkp = next_shkp\(fmon, TRUE\); shkp;[\s\S]*?obj = find_oid\(bp->bo_id\);[\s\S]*?if \(!obj\)[\s\S]*?continue;[\s\S]*?oindx != STRANGE_OBJECT[\s\S]*?obj->oclass == GEM_CLASS[\s\S]*?bp->price = get_cost\(obj, shkp\);[\s\S]*?\+\+bp;/u);
});

test('ordinary charge helpers preserve source quantity and id partitions',
    () => {
        const state = costState();
        const known = pricedObject(state, DART, { quan: 7, o_id: 4 });
        assert.equal(get_pricing_units(known, state), 7);
        assert.equal(oid_price_adjustment(known, known.o_id, state), 0);

        const unknown = pricedObject(state, POT_HEALING, {
            dknown: true,
            o_id: 4,
        });
        // The type remains unidentified, so id divisible by four selects the
        // 4/3 source surcharge. The adjacent id selects no adjustment.
        assert.equal(oid_price_adjustment(unknown, 4, state), 1);
        assert.equal(oid_price_adjustment(unknown, 5, state), 0);
    });

test('get_cost pins every charisma boundary and C integer rounding', () => {
    // A dart costs 2 zorkmids. These expectations are the exact results of
    // shk.c get_cost()'s multiplier/divisor table and roundoff calculation.
    const cases = [
        [19, 1], [18, 1], [16, 2], [15, 2],
        [11, 2], [10, 3], [8, 3], [7, 3], [6, 3], [5, 4],
    ];
    for (const [charisma, expected] of cases) {
        const state = costState(charisma);
        assert.equal(
            get_cost(pricedObject(state, DART), null, state),
            expected,
            `Charisma ${charisma}`,
        );
    }

    const state = costState(10);
    const unknown = pricedObject(state, POT_HEALING, { o_id: 4 });
    // Base 20, unknown-id 4/3, and Charisma 10's 4/3 combine to 320/9;
    // C's decimal roundoff expression rounds that to 36.
    assert.equal(get_cost(unknown, null, state), 36);

    // A 20-zorkmid potion separates every adjacent multiplier partition whose
    // rounded 2-zorkmid dart results coincide.
    for (const [charisma, expected] of [
        [19, 10], [18, 13], [16, 15], [15, 20],
        [8, 27], [7, 30], [5, 40],
    ]) {
        const partitionState = costState(charisma);
        partitionState.objects[POT_HEALING].oc_name_known = 1;
        assert.equal(
            get_cost(
                pricedObject(partitionState, POT_HEALING),
                null,
                partitionState,
            ),
            expected,
            `20-zorkmid Charisma ${charisma}`,
        );
    }

    const adultTourist = costState(11);
    adultTourist.urole = { mnum: PM_TOURIST };
    // Level 15 is the first level outside C's MAXULEV/2 young-Tourist arm.
    adultTourist.u.ulevel = 15;
    assert.equal(get_cost(pricedObject(adultTourist, DART), null, adultTourist), 2);
});

test('getprice preserves reached class adjustments', () => {
    const state = costState();
    const ration = pricedObject(state, FOOD_RATION);
    assert.equal(getprice(ration, false, state), 45);
    // HUNGRY is the first state that multiplies ordinary food cost.
    state.u.uhs = HUNGRY;
    assert.equal(getprice(ration, false, state), 90);
    assert.equal(get_cost(ration, null, state), 90);

    const dart = pricedObject(state, DART, { spe: 2 });
    // Positive weapon enchantment adds 10 zorkmids per point to base cost 2.
    assert.equal(getprice(dart, false, state), 22);

    const armor = pricedObject(state, CHAIN_MAIL, { spe: 1 });
    // Armor shares the weapon adjustment, applied to chain mail's base 75.
    assert.equal(getprice(armor, false, state), 85);

    const emptyWand = pricedObject(state, WAN_SLEEP, { spe: -1 });
    assert.equal(getprice(emptyWand, false, state), 0);
    // get_cost() replaces a zero base with the source minimum of 5.
    assert.equal(get_cost(emptyWand, null, state), 5);

    const water = pricedObject(state, POT_WATER, {
        blessed: false,
        cursed: false,
    });
    assert.equal(getprice(water, false, state), 0);
    assert.equal(get_cost(water, null, state), 5);

    const candle = pricedObject(state, TALLOW_CANDLE, {
        // Age 199 is one below 20 times the candle's base cost of 10.
        age: 199,
    });
    assert.equal(getprice(candle, false, state), 5);
    candle.age = 200;
    assert.equal(getprice(candle, false, state), 10);
});

test('record_price_quote updates one partition without changing the other', () => {
    const state = costState();
    const type = state.objects[DART];
    const initialSell = [type.oc_sell_minseen, type.oc_sell_maxseen];
    record_price_quote(DART, 7, true, state);
    record_price_quote(DART, 4, true, state);
    record_price_quote(DART, 9, true, state);
    assert.deepEqual(
        [type.oc_buy_minseen, type.oc_buy_maxseen],
        [4, 9],
    );
    assert.deepEqual(
        [type.oc_sell_minseen, type.oc_sell_maxseen],
        initialSell,
    );
    const completedBuy = [type.oc_buy_minseen, type.oc_buy_maxseen];
    record_price_quote(DART, 5, false, state);
    record_price_quote(DART, 8, false, state);
    assert.deepEqual(
        [type.oc_sell_minseen, type.oc_sell_maxseen],
        [5, 8],
    );
    assert.deepEqual(
        [type.oc_buy_minseen, type.oc_buy_maxseen],
        completedBuy,
    );
});

function container({ cknown = true, contents = [] } = {}) {
    const cobj = contents.reduceRight(
        (nobj, obj) => Object.assign(obj, { nobj }),
        null,
    );
    return { otyp: SACK, cknown, cobj, nobj: null };
}

function gold(quan) {
    return { oclass: COIN_CLASS, quan, cobj: null, nobj: null };
}

function minventObject(no_charge) {
    return newObject({
        // OBJ_MINVENT is the location C assigns to a monster's inventory.
        where: OBJ_MINVENT,
        no_charge,
    });
}

test('clear_no_charge_pets clears only tame monster inventories', () => {
    // C ref: shk.c:393-395. The loop visits every fmon entry, but calls
    // clear_no_charge() only when mtame and minvent are both nonzero.
    const tameObject = minventObject(true);
    const tameWithoutInventory = { mtame: 1, minvent: null, nmon: null };
    const wildObject = minventObject(true);
    const tameLaterObject = minventObject(true);
    const tame = {
        mtame: 1,
        minvent: tameObject,
        nmon: tameWithoutInventory,
    };
    tameWithoutInventory.nmon = {
        mtame: 0,
        minvent: wildObject,
        nmon: { mtame: 1, minvent: tameLaterObject, nmon: null },
    };
    const state = { level: { monlist: tame } };

    clear_no_charge_pets(null, state);

    assert.equal(tameObject.no_charge, false);
    assert.equal(wildObject.no_charge, true);
    assert.equal(tameLaterObject.no_charge, false);
});

test('contained_gold sums nested piles by shk.c\'s rules', () => {
    // C recurses only into a container whose contents the hero has seen,
    // unless even_if_unknown is set; loose gold always counts.
    const inner = container({ cknown: false, contents: [gold(7)] });
    const outer = container({ contents: [gold(3), inner] });

    assert.equal(contained_gold(outer, false), 3);
    assert.equal(contained_gold(outer, true), 10);

    // An empty container answers zero rather than skipping the walk.
    assert.equal(contained_gold(container(), false), 0);
});

test('hidden_gold walks the pack the way vault.c does', () => {
    // vault.c hidden_gold() counts gold inside carried containers only; the
    // hero's own purse is u.ugold, which it never reads.
    const state = {
        invent: null,
        u: {},
    };
    const seen = container({ contents: [gold(12)] });
    const unseen = container({ cknown: false, contents: [gold(5)] });
    seen.nobj = unseen;
    unseen.nobj = gold(100); /* loose gold in the pack, not in a container */
    state.invent = seen;

    assert.equal(hidden_gold(false, state), 12);
    assert.equal(hidden_gold(true, state), 17);
});

// shk.c shk_your() reads five things about an object: whether a shopkeeper
// owns it (unpaid, or lying unfree on a charged shop square), whether a
// monster carries it, and whether the hero does. This fixture is a one-room
// tended shop, so costly_spot() answers true on the single square the tests
// place a floor object on; ownedState({ has_shop: false }) turns it off again
// without moving the object.
const SHOP_ROOMNO = ROOMOFFSET;

function shopState({ has_shop = true } = {}) {
    const location = { roomno: SHOP_ROOMNO, edge: false };
    const shoplevel = { dnum: 0, dlevel: 3 };
    const state = {
        u: { ux: 4, uy: 5, uz: { ...shoplevel }, uprops: {} },
        flags: { female: false },
    };
    state.mons = monst_globals_init(state);
    const resident = {
        isshk: true,
        data: state.mons[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER,
        mx: 4,
        my: 5,
        female: false,
        mpeaceful: true,
        mcanmove: true,
        mextra: {
            eshk: {
                shoproom: SHOP_ROOMNO,
                shoplevel,
                shknam: '-Ozzy',
                /* the shopkeeper's own post, which is not
                   "inside" the shop */
                shk: { x: 1, y: 1 },
            },
        },
    };
    state.level = {
        flags: { has_shop },
        at: () => location,
        rooms: [{ rtype: SHOPBASE, resident }],
    };
    return state;
}

function damageCleanupState({ currentLevel = { dnum: 0, dlevel: 1 } } = {}) {
    const state = {
        u: { uz: currentLevel, ushops: [] },
        moves: 1,
    };
    state.level = new GameMap();
    const shopkeeper = billShopkeeper(SHOP_ROOMNO, []);
    const shopRoom = { rtype: SHOPBASE, resident: shopkeeper, hx: 10 };
    const secondRoom = { rtype: SHOPBASE, resident: null, hx: 10 };
    state.level.rooms = [shopRoom, secondRoom];
    shopkeeper.mextra.eshk.shoplevel = { dnum: 0, dlevel: 1 };
    const cells = new Map();
    state.level.at = (x, y) => cells.get(`${x},${y}`) ?? null;
    const setCell = (x, y, roomno) => {
        const cell = { typ: 0, flags: 0, roomno };
        cells.set(`${x},${y}`, cell);
        return cell;
    };
    setCell(2, 2, SHOP_ROOMNO);
    setCell(3, 3, SHOP_ROOMNO);
    setCell(8, 8, SHOP_ROOMNO + 1);
    setCell(9, 9, SHOP_ROOMNO + 1);
    setCell(5, 5, SHARED);
    setCell(4, 4, SHOP_ROOMNO);
    setCell(6, 6, SHOP_ROOMNO + 1);
    return { state, shopkeeper, shopRoom };
}

test('shkgone discards its owned damage records before resident removal', () => {
    // C shk.c:shkgone() calls discard_damage_owned_by() before clearing the
    // resident. add_damage() builds the actual level list used by production.
    const { state, shopkeeper, shopRoom } = damageCleanupState();
    add_damage(2, 2, 1, state); // Owned tail.
    add_damage(3, 3, 2, state); // Consecutive owned record.
    add_damage(8, 8, 3, state); // Unrelated records retain relative order.
    add_damage(9, 9, 4, state);
    add_damage(5, 5, 5, state); // Shared square belongs to both shops.
    const shared = state.level.damagelist;
    const unrelated = shared.next;
    const unrelatedLast = unrelated.next;
    const consecutive = unrelatedLast.next;
    const tail = consecutive.next;
    let residentObserved = false;
    Object.defineProperty(shopRoom, 'resident', {
        configurable: true,
        get: () => shopkeeper,
        set: (resident) => {
            if (resident === null) {
                residentObserved = true;
                assert.equal(state.level.damagelist, unrelated);
                assert.equal(unrelated.next, unrelatedLast);
                assert.equal(unrelatedLast.next, null);
            }
        },
    });

    shkgone(shopkeeper, state);
    assert.equal(residentObserved, true);
    assert.equal(state.level.damagelist, unrelated);
    assert.equal(unrelated.next, unrelatedLast);
    assert.equal(unrelatedLast.next, null);
    assert.equal(shared.next, null);
    assert.equal(consecutive.next, null);
    assert.equal(tail.next, null);

    // All-owned and no-owned lists cover the zero and unchanged boundaries.
    const allOwned = damageCleanupState();
    add_damage(2, 2, 1, allOwned.state);
    add_damage(5, 5, 1, allOwned.state);
    const removedHead = allOwned.state.level.damagelist;
    const removedTail = removedHead.next;
    shkgone(allOwned.shopkeeper, allOwned.state);
    assert.equal(allOwned.state.level.damagelist, null);
    assert.equal(removedHead.next, null);
    assert.equal(removedTail.next, null);

    const noneOwned = damageCleanupState();
    add_damage(8, 8, 1, noneOwned.state);
    const unaffected = noneOwned.state.level.damagelist;
    shkgone(noneOwned.shopkeeper, noneOwned.state);
    assert.equal(noneOwned.state.level.damagelist, unaffected);

    const offLevel = damageCleanupState({ currentLevel: { dnum: 0, dlevel: 2 } });
    add_damage(2, 2, 1, offLevel.state);
    const offLevelRecord = offLevel.state.level.damagelist;
    shkgone(offLevel.shopkeeper, offLevel.state);
    assert.equal(offLevel.state.level.damagelist, offLevelRecord);
    assert.equal(offLevel.shopRoom.resident, offLevel.shopkeeper);
});

test('make_happy_shk settles hostility before the shopkeeper turn', async () => {
    // This fixture keeps the keeper inside its tended shop so the tested
    // branch is C's in-shop calming path used by dopay after compensation.
    const state = shopState();
    const resident = state.level.rooms[0].resident;
    resident.mhp = 10;
    resident.mpeaceful = false;
    resident.nmon = null;
    resident.mextra.eshk.following = 1;
    resident.mextra.eshk.robbed = 27;
    const guard = {
        mhp: 5,
        mcanmove: true,
        mpeaceful: false,
        data: state.mons[PM_WATCHMAN],
        nmon: null,
    };
    resident.nmon = guard;
    state.level.monlist = resident;
    state.urole = { mnum: PM_ROGUE };
    const cBody = C_SHK.match(
        /void\s+make_happy_shk\(struct monst \*shkp, boolean silentkops\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cBody, 'the complete C make_happy_shk body is present');
    assert.match(cBody,
        /pacify_shk\(shkp, FALSE\);\s*eshkp->following = 0;\s*eshkp->robbed = 0L;/u);
    assert.match(cBody,
        /\} else if \(wasmad\)\s*pline\("%s calms down\.", Shknam\(shkp\)\);/u);
    const cKopsGone = C_SHK.match(
        /staticfn void\s+kops_gone\(boolean silent\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(cKopsGone, 'the complete C kops_gone body is present');
    assert.match(cKopsGone, /mtmp2 = mtmp->nmon;[\s\S]*?mongone\(mtmp\);/u);
    assert.match(JS_SHK,
        /await kops_gone\(silentKops, state, env\);\s*await pacify_guards\(state\);/u);

    await make_happy_shk(resident, false, state, { message: async () => {} });

    assert.equal(resident.mpeaceful, true);
    assert.equal(resident.mextra.eshk.following, 0);
    assert.equal(resident.mextra.eshk.robbed, 0);
    assert.equal(guard.mpeaceful, true);
});

test('angry_shk_exists uses next_shkp and restores a missing surcharge', () => {
    // C's scan uses next_shkp(), which skips dead monsters and calls
    // rile_shk() before returning an angry shopkeeper.
    const angryShopkeeper = {
        mhp: 10, isshk: true, mpeaceful: false,
        mextra: { eshk: {
            surcharge: false,
            billct: 1,
            bill_p: [{ price: 3 }],
        } },
    };
    const deadShopkeeper = {
        mhp: 0, isshk: true, mpeaceful: false,
    };
    const state = {
        level: { monlist: {
            ...deadShopkeeper,
            nmon: angryShopkeeper,
        } },
    };
    assert.equal(angry_shk_exists(state), true);
    assert.equal(angryShopkeeper.mextra.eshk.surcharge, true);
    assert.equal(angryShopkeeper.mextra.eshk.bill_p[0].price, 4);
    angryShopkeeper.mpeaceful = true;
    assert.equal(angry_shk_exists(state), false);
});

test('shopdig warns in source order and all active callers use the owner', async () => {
    const cBody = sourceBody(C_SHK, '\nshopdig(int fall)');
    assert.match(cBody,
        /if \(!fall\)[\s\S]*?if \(lang == 2\)[\s\S]*?if \(!Deaf && !muteshk\(shkp\)\)[\s\S]*?SetVoice\(shkp, 0, 80, 0\);[\s\S]*?verbalize\("%s, do not damage the floor here!"/u);
    assert.match(cBody,
        /else if \(!um_dist\(shkp->mx, shkp->my, 5\)[\s\S]*?ESHK\(shkp\)->billct \|\| ESHK\(shkp\)->debit/u);
    assert.match(C_DIG,
        /shopdig\(0\);\s*add_damage\(u\.ux, u\.uy, SHOP_PIT_COST\);/u);
    assert.match(JS_DIG,
        /await shopdig\(0, state, \{ \.\.\.env, random, message \}\);\s*add_damage\(state\.u\.ux, state\.u\.uy, SHOP_PIT_COST, state\);/u);
    assert.match(C_DIG,
        /if \(\*u\.ushops && heros_fault\)\s*shopdig\(1\);/u);
    assert.match(JS_DIG,
        /if \(state\.u\.ushops\[0\] && herosFault\)\s*await shopdig\(1, state, env\);/u);
    assert.match(C_TRAP,
        /if \(\*u\.ushops\)\s*shopdig\(1\);/u);
    assert.match(JS_TRAP, /if \(u\.ushops\[0\]\) await shopdig\(1, state\);/u);
    assert.doesNotMatch(JS_DIG, /note_unported\('shk\.c shopdig'\)/u);
    assert.doesNotMatch(JS_TRAP, /note_unported\('shk\.c shopdig'\)/u);

    const state = shopState();
    state.u.ushops = [SHOP_ROOMNO, 0, 0, 0, 0];
    state.flags.female = true;
    state.level.rooms[0].resident.data = {
        ...state.level.rooms[0].resident.data,
        msound: MS_HUMANOID,
    };
    const messages = [];
    await shopdig(0, state, { message: async (text) => messages.push(text) });
    assert.deepEqual(messages, ['"Madam, do not damage the floor here!"']);
    assert.equal(state.gv.voice.volume, 80);
    assert.equal(state.gp.pline_flags & PLINE_VERBALIZE, 0);
    // set_voice() owns this flag; the mocked message sink does not perform
    // tty_message()'s normal cleanup of PLINE_SPEECH.
    assert.equal(state.gp.pline_flags, PLINE_SPEECH);

    state.u.utraptype = TT_PIT;
    messages.length = 0;
    await shopdig(0, state, { message: async (text) => messages.push(text) });
    assert.deepEqual(messages, [
        '"Be careful, madam, or you might fall through the floor."',
    ]);
});

test('shopdig takes only inventory the source leaves eligible', async () => {
    await runSegment({
        seed: 226001,
        datetime: '20780113140500',
        nethackrc: [
            'OPTIONS=name:B226Test,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,!autopickup,time,showexp',
            '',
        ].join('\n'),
        moves: '.',
    });
    const state = game;
    const fixture = shopState();
    state.level = fixture.level;
    state.u.ux = fixture.u.ux;
    state.u.uy = fixture.u.uy;
    state.u.uz = fixture.u.uz;
    state.u.ushops = [SHOP_ROOMNO, 0, 0, 0, 0];
    state.flags.female = false;
    state.u.twoweap = false;
    const keeper = state.level.rooms[0].resident;
    keeper.mx = 5;
    keeper.my = 5;
    keeper.mextra.eshk.billct = 0;
    keeper.mextra.eshk.debit = 1;

    const eligible = newObject({ otyp: DART, quan: 1, where: OBJ_INVENT });
    const leash = newObject({ otyp: LEASH, quan: 1, where: OBJ_INVENT });
    leash.leashmon = 44;
    const wand = newObject({ otyp: WAN_SLEEP, quan: 1, where: OBJ_INVENT });
    const worn = newObject({ otyp: CHAIN_MAIL, quan: 1, where: OBJ_INVENT });
    worn.owornmask = 1;
    state.current_wand = wand;
    eligible.nobj = leash;
    leash.nobj = wand;
    wand.nobj = worn;
    state.invent = eligible;

    const messages = [];
    await shopdig(1, state, { message: async (text) => messages.push(text) });
    assert.ok(messages.some((text) => text.includes('grabs your backpack')));
    assert.equal(keeper.minvent, eligible);
    assert.equal(eligible.where, OBJ_MINVENT);
    assert.equal(state.invent, leash);
    assert.equal(leash.nobj, wand);
    assert.equal(wand.nobj, worn);
    assert.equal(worn.where, OBJ_INVENT);
});

test('inhishop checks the keeper level before the current room', () => {
    const cBody = sourceBody(C_SHK, '\ninhishop(');
    assert.match(cBody,
        /if \(!on_level\(&eshkp->shoplevel, &u\.uz\)\)\s*return FALSE;\s*shkrooms = in_rooms\(shkp->mx, shkp->my, SHOPBASE\);\s*return \(strchr\(shkrooms, eshkp->shoproom\) != 0\);/u);
    const jsBody = sourceBody(JS_SHK, 'export function inhishop(');
    assert.match(jsBody,
        /on_level\(extension\.shoplevel, state\.u\?\.uz\)\s*&& in_rooms\([\s\S]*?shopkeeper\.mx,[\s\S]*?extension\.shoproom/u);

    const state = shopState();
    const keeper = state.level.rooms[0].resident;
    const room = state.level.at(keeper.mx, keeper.my);
    state.level.at = (x, y) => x === keeper.mx && y === keeper.my ? room : null;

    // A keeper on the source shop room and level is inside the shop.
    assert.equal(inhishop(keeper, state), true);
    // The room list alone cannot override a mismatched shoproom value.
    keeper.mextra.eshk.shoproom = SHOP_ROOMNO + 1;
    assert.equal(inhishop(keeper, state), false);
    keeper.mextra.eshk.shoproom = SHOP_ROOMNO;
    // C returns before reading the room when shoplevel differs from u.uz.
    keeper.mextra.eshk.shoplevel = { dnum: 0, dlevel: 2 };
    assert.equal(inhishop(keeper, state), false);
});

function shopObject(where, overrides = {}) {
    return newObject({
        otyp: DART, oclass: WEAPON_CLASS, quan: 1, where, ox: 4, oy: 5,
        ...overrides,
    });
}

test('shk_your prefixes what the hero holds and what she does not', () => {
    const state = shopState();
    // decl.c c_common_strings.c_the_your is { "the", "your" }, indexed by
    // obj.h carried(), and shk.c appends the separating space.
    assert.equal(shk_your(shopObject(OBJ_INVENT), state), 'your ');
    // A floor object outside a charged square has no owner, so C falls to
    // the_your[0]. costly_spot() answers false with no shop on the level.
    assert.equal(
        shk_your(shopObject(OBJ_FLOOR), shopState({ has_shop: false })),
        'the ',
    );
    // no_charge takes the square's own object out of shk_owns()'s reach even
    // where costly_spot() is true.
    assert.equal(
        shk_your(shopObject(OBJ_FLOOR, { no_charge: 1 }), state), 'the ',
    );
});

test('Shk_Your capitalizes the source owner prefix', () => {
    const state = shopState();
    // shk.c:5877-5882 uppercases only shk_your()'s first output byte.
    assert.equal(Shk_Your(shopObject(OBJ_INVENT), state), 'Your ');
    // shk_your() already supplies a proper-name prefix for a shopkeeper.
    assert.equal(
        Shk_Your(shopObject(OBJ_INVENT, { unpaid: 1 }), state), "Ozzy's ",
    );
    // A floor object outside a shop falls back to C's capitalized "The ".
    assert.equal(
        Shk_Your(shopObject(OBJ_FLOOR), shopState({ has_shop: false })),
        'The ',
    );
});

test('shk_your returns the source owner for shop and monster inventories', () => {
    const state = shopState();
    // shk.c:5889-5892. Inventory debt and charged floor goods use the
    // shopkeeper's possessive, with the trailing separator from shk_your().
    assert.equal(
        shk_your(shopObject(OBJ_INVENT, { unpaid: 1 }), state), "Ozzy's ",
    );
    assert.equal(shk_your(shopObject(OBJ_FLOOR), state), "Ozzy's ");

    // shk.c:5900-5904. Objects in a monster's pack use y_monnam() and then
    // the same possessive transform.
    const carrier = {
        data: state.mons[PM_GOBLIN],
        mtame: false,
        mx: 9,
        my: 5,
    };
    // This reduced fixture cannot spot the carrier, so y_monnam() answers
    // "it" and s_suffix() uses its special possessive.
    assert.equal(
        shk_your(shopObject(OBJ_MINVENT, { ocarry: carrier }), state),
        'its ',
    );

    // shk.c passes locflags 0, so get_obj_location() answers NULL for a
    // contained object even when its container is locatable, and C's whole
    // shopkeeper test sits behind that answer. An unpaid object inside a
    // carried bag therefore reaches the ordinary prefix.
    const bagged = shopObject(OBJ_CONTAINED, { unpaid: 1 });
    bagged.ocontainer = shopObject(OBJ_INVENT);
    assert.equal(shk_your(bagged, state), 'the ');
});

test('shk_your handles personal, unique, and ordinary corpse prefixes', () => {
    const state = shopState();
    const corpse = (corpsenm) => newObject({
        otyp: CORPSE,
        corpsenm,
        quan: 1,
        where: OBJ_INVENT,
    });

    // shk.c:5865-5870. A personal name keeps its bare name; a unique unnamed
    // species explicitly gets the definite article before ordinary ownership.
    assert.equal(shk_your(corpse(PM_MEDUSA), state), '');
    assert.equal(shk_your(corpse(PM_ORACLE), state), 'the ');
    assert.equal(shk_your(corpse(PM_GOBLIN), state), 'your ');
});

test('shkcatch waits for mnearto before source speech and catch effects', () => {
    const cBody = sourceBody(C_SHK, '\nshkcatch(\n');
    const cMove = cBody.indexOf('if (mnearto(shkp, x, y, TRUE, RLOC_NOMSG) == 2');
    const cVoice = cBody.indexOf('SetVoice(shkp, 0, 80, 0);', cMove);
    const cSpeak = cBody.indexOf('verbalize("Out of my way, scum!");', cVoice);
    const cBill = cBody.indexOf('subfrombill(obj, shkp);', cSpeak);
    const cCatch = cBody.indexOf('mpickobj(shkp, obj);', cBill);
    assert.ok(cMove >= 0 && cMove < cVoice && cVoice < cSpeak);
    assert.ok(cSpeak < cBill && cBill < cCatch);

    const jsBody = sourceBody(JS_SHK, 'export async function shkcatch(');
    const jsMove = jsBody.indexOf('if (await mnearto(shkp, x, y, true');
    const jsVoice = jsBody.indexOf('set_voice(shkp, 0, 80, 0, state);', jsMove);
    const jsSpeak = jsBody.indexOf("await verbalize('Out of my way, scum!'", jsVoice);
    const jsBill = jsBody.indexOf('subfrombill(obj, shkp, state, rawEnv);', jsSpeak);
    const jsCatch = jsBody.indexOf('mpickobj(shkp, obj, { ...rawEnv, state });', jsBill);
    assert.ok(jsMove >= 0 && jsMove < jsVoice && jsVoice < jsSpeak);
    assert.ok(jsSpeak < jsBill && jsBill < jsCatch);
    assert.match(jsBody, /\{\s*\.\.\.rawEnv,\s*state,\s*\}\) === 2/);
});
