import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BUFSZ,
    HUNGRY,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    ROOMOFFSET,
    SHOPBASE,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    COIN_CLASS,
    objects_globals_init,
    POT_WATER,
    DART,
    CHAIN_MAIL,
    FOOD_RATION,
    POT_HEALING,
    TALLOW_CANDLE,
    WAN_SLEEP,
    SACK,
    WEAPON_CLASS,
} from '../js/objects.js';
import { newObject } from '../js/obj.js';
import {
    append_price_quote,
    contained_gold,
    get_cost,
    get_pricing_units,
    getprice,
    oid_price_adjustment,
    record_price_quote,
    shk_your,
    UnsupportedShopError,
} from '../js/shk.js';
import { hidden_gold } from '../js/vault.js';
import { PM_TOURIST } from '../js/monsters.js';

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
    return {
        u: { ux: 4, uy: 5, uz: { ...shoplevel } },
        level: {
            flags: { has_shop },
            at: () => location,
            rooms: [{
                rtype: SHOPBASE,
                resident: {
                    isshk: true,
                    mx: 4,
                    my: 5,
                    mextra: {
                        eshk: {
                            shoproom: SHOP_ROOMNO,
                            shoplevel,
                            /* the shopkeeper's own post, which is not
                               "inside" the shop */
                            shk: { x: 1, y: 1 },
                        },
                    },
                },
            }],
        },
    };
}

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

test('shk_your stops on every object shk.c would name an owner for', () => {
    const state = shopState();
    // shk.c:5890. An unpaid object belongs to the shopkeeper wherever it is,
    // including in the hero's own pack.
    assert.throws(() => shk_your(shopObject(OBJ_INVENT, { unpaid: 1 }), state),
        UnsupportedShopError);
    // shk.c:5891-5892. A charged shop square owns what lies on it.
    assert.throws(() => shk_your(shopObject(OBJ_FLOOR), state),
        UnsupportedShopError);
    // shk.c:5902. A monster's pack answers through mon_owns() instead.
    assert.throws(() => shk_your(shopObject(OBJ_MINVENT), state),
        UnsupportedShopError);
    // shk.c passes locflags 0, so get_obj_location() answers NULL for a
    // contained object even when its container is locatable, and C's whole
    // shopkeeper test sits behind that answer. An unpaid object inside a
    // carried bag therefore reaches the ordinary prefix.
    const bagged = shopObject(OBJ_CONTAINED, { unpaid: 1 });
    bagged.ocontainer = shopObject(OBJ_INVENT);
    assert.equal(shk_your(bagged, state), 'the ');
});
