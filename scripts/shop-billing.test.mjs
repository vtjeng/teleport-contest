import assert from 'node:assert/strict';
import test from 'node:test';
import {
    A_CHA, BILLSZ, COST_CONTENTS, DEAF, HALLUC, LAVAPOOL, LL_ACHIEVE,
    MON_MIGRATING,
    NORMAL_SPEED, OBJ_BURIED, OBJ_CONTAINED, OBJ_DELETED, OBJ_FLOOR,
    OBJ_FREE, OBJ_INVENT, OBJ_MINVENT, OBJ_ONBILL, ROOM, ROOMOFFSET,
    SHOPBASE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { d, rn1, rnd, rne, rnz } from '../js/rng.js';
import { bhitm, bhito, create_polymon } from '../js/zap.js';
import { missum } from '../js/uhitm.js';
import { hero_breaks } from '../js/dothrow.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    PM_GIANT_RAT,
    PM_KEYSTONE_KOP,
    PM_KOP_KAPTAIN,
    PM_KOP_LIEUTENANT,
    PM_KOP_SERGEANT,
    PM_SHOPKEEPER,
    PM_TOURIST,
    AD_PHYS, AT_CLAW,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { addinv_runtime, obfree, obj_extract_self, useupf } from '../js/invent.js';
import {
    bill_dummy_object, mksobj_at, newObject, place_object,
} from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { donameFresh } from '../js/objnam.js';
import {
    BEARTRAP, CRYSKNIFE, DART, DIAMOND, FOOD_RATION, GOLD_PIECE, IRON,
    LONG_SWORD,
    POT_HEALING, POT_WATER, SACK, TALLOW_CANDLE, WORM_TOOTH,
    WAN_POLYMORPH, WAN_SPEED_MONSTER, WAND_CLASS,
} from '../js/objects.js';
import { pick_obj } from '../js/pickup.js';
import { addtobill, alter_cost, billable, contained_cost, costly_gold,
    picked_container, set_cost, setpaid, subfrombill, u_left_shop,
    unpaid_cost, use_unpaid_trapobj }
    from '../js/shk.js';
import { saleable } from '../js/shknam.js';
import { SHTYPES } from '../js/shtypes_data.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';

const KOPS = new Set([
    PM_KEYSTONE_KOP,
    PM_KOP_SERGEANT,
    PM_KOP_LIEUTENANT,
    PM_KOP_KAPTAIN,
]);

async function shop() {
    // Independent seed/date initialize the catalogs. Each test replaces the
    // relevant shop state; the keeper's positive HP and ID avoid death and
    // unknown-price branches unless the test explicitly selects one.
    await runSegment({ seed: 5501234, datetime: '20330607081011',
        nethackrc: 'OPTIONS=name:Billing,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none',
        moves: '' });
    const state = game;
    const { ux: x, uy: y } = state.u;
    const room = state.level.rooms[0];
    room.rtype = SHOPBASE;
    state.level.flags.has_shop = true;
    for (const px of [x - 1, x])
        Object.assign(state.level.at(px, y), { typ: ROOM, roomno: ROOMOFFSET,
            edge: false });
    const keeper = { isshk: true, mpeaceful: true, mhp: 10, mcanmove: true,
        data: state.mons[PM_SHOPKEEPER], mx: x - 1, my: y, m_id: 3,
        mextra: { eshk: { shoproom: ROOMOFFSET, shoptype: SHOPBASE,
            shoplevel: { ...state.u.uz }, shk: { x: x - 1, y },
            bill: [], bill_p: null, billct: 0, credit: 0, debit: 0,
            loan: 0, robbed: 0, surcharge: false, shknam: 'Testkeeper' } },
        nmon: null };
    room.resident = keeper;
    state.level.monlist = keeper;
    state.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    state.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    // shk.c get_cost's ordinary charisma partition has no multiplier.
    state.u.acurr.a[A_CHA] = 11;
    state.u.abon[A_CHA] = state.u.atemp[A_CHA] = 0;
    state.invent = null;
    state.program_state.in_moveloop = false;
    const messages = [];
    const env = objectGenerationEnv({ state, message: text => messages.push(text),
        redraw: () => {}, random: { rn2: () => 0, rnd: () => 1,
            rn1: (_range, base) => base, rne: () => 1 } });
    return { state, keeper, eshk: keeper.mextra.eshk, env, messages };
}

function object(state, otyp, overrides = {}) {
    return newObject({ otyp, oclass: state.objects[otyp].oc_class, quan: 1,
        o_id: state.context.ident++, dknown: true, where: OBJ_FREE, ...overrides });
}

function kopsOnLevel(state) {
    let count = 0;
    for (let monster = state.level.monlist; monster; monster = monster.nmon)
        if (KOPS.has(monster.data.pmidx)) ++count;
    return count;
}

test('zapping an outside-shop keeper starts hot pursuit', async () => {
    const { state, keeper, eshk } = await shop();
    // The keeper remains in the shop while the hero stands on its doorway.
    state.level.at(state.u.ux, state.u.uy).roomno = 0;
    state.u.ushops = [0, 0, 0, 0, 0];
    state.u.urooms = [0, 0, 0, 0, 0];
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhitm(keeper, { otyp: WAN_SPEED_MONSTER, oclass: WAND_CLASS,
        spe: 1 }, state);

    assert.equal(eshk.following, true,
        'zap.c bhitm calls hot_pursuit after waking a shopkeeper outside');
    assert.equal(keeper.mpeaceful, false);
});

test('missing an adjacent keeper from outside the shop starts pursuit', async () => {
    const { state, keeper, eshk, env, messages } = await shop();
    // The hero is one step from the peaceful resident, but stands outside
    // the shop when uhitm.c:missum() wakes the target after a missed swing.
    state.level.at(state.u.ux, state.u.uy).roomno = 0;
    state.u.ushops = [0, 0, 0, 0, 0];
    state.u.urooms = [0, 0, 0, 0, 0];
    await missum(keeper, { aatyp: AT_CLAW, adtyp: AD_PHYS,
        damn: 0, damd: 0 }, false, state, env);
    assert.equal(Boolean(keeper.mpeaceful), false);
    assert.equal(eshk.following, true);
    assert.ok(messages.some((line) => line.startsWith('You miss')));
    assert.equal(state.unported.has('shk.c hot_pursuit'), false);
});

test('missing an adjacent keeper from inside the shop does not start pursuit', async () => {
    const { state, keeper, eshk, env } = await shop();
    await missum(keeper, { aatyp: AT_CLAW, adtyp: AD_PHYS,
        damn: 0, damd: 0 }, false, state, env);
    assert.equal(Boolean(keeper.mpeaceful), false);
    assert.equal(Boolean(eshk.following), false);
});

test('a helpful zap inside the shop does not start hot pursuit', async () => {
    const { state, keeper, eshk } = await shop();
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhitm(keeper, { otyp: WAN_SPEED_MONSTER, oclass: WAND_CLASS,
        spe: 1 }, state);

    assert.equal(eshk.following, undefined);
    assert.equal(keeper.mpeaceful, true);
});

test('polymorphing shop stock on the floor angers its keeper', async () => {
    const { state, keeper, eshk, env } = await shop();
    const stock = mksobj_at(DART, state.u.ux, state.u.uy,
        false, false, env);
    const wand = { otyp: WAN_POLYMORPH, oclass: WAND_CLASS, spe: 1 };
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhito(stock, wand, state,
        { rn2: bound => bound - 1, rn1, rnd, rne });

    assert.equal(state.u.uconduct.polypiles, 1,
        'the stock reaches bhito polymorph rather than resisting the ray');
    assert.equal(keeper.mpeaceful, false);
    assert.equal(eshk.following, true);
});

test('polymorphing interior stock from the doorway settles the bill', async () => {
    const { state, keeper, eshk, env } = await shop();
    const { ux: x, uy: y } = state.u;
    state.level.at(x, y).edge = true;
    Object.assign(state.level.at(x + 1, y), { typ: ROOM,
        roomno: ROOMOFFSET, edge: false });
    const stock = mksobj_at(DART, x + 1, y, false, false, env);
    eshk.debit = 10;
    eshk.credit = 3;
    const wand = { otyp: WAN_POLYMORPH, oclass: WAND_CLASS, spe: 1 };
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhito(stock, wand, state,
        { rn2: bound => bound - 1, rn1, rnd, rne });

    assert.equal(state.u.uconduct.polypiles, 1);
    assert.equal(eshk.robbed, 7,
        'make_angry_shk settles debit and credit before pursuit');
    assert.equal(eshk.following, true);
    assert.equal(keeper.mpeaceful, false);
});

test('polymorph shock bills a shop floor item before deleting it', async () => {
    const { state, eshk, env } = await shop();
    const stock = mksobj_at(DART, state.u.ux, state.u.uy,
        false, false, env);
    const wand = { otyp: WAN_POLYMORPH, oclass: WAND_CLASS, spe: 1 };
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhito(stock, wand, state, {
        rn2: bound => bound === 8 ? 0 : bound - 1,
        rn1, rnd, rne,
    });

    assert.equal(state.go.obj_zapped, true,
        'the floor object reached do_osshock');
    assert.equal(eshk.billct, 1,
        'C addtobill records the lost stock before delobj');
    assert.equal(stock.where, OBJ_ONBILL,
        'the used object remains on the bill until settlement');
});

test('polymorph shock from outside the shop charges stolen stock', async () => {
    const { state, keeper, eshk, env } = await shop();
    const { ux: x, uy: y } = state.u;
    Object.assign(state.level.at(x + 1, y), { typ: ROOM,
        roomno: ROOMOFFSET, edge: false });
    const stock = mksobj_at(DART, x + 1, y, false, false, env);
    state.u.ux = x + 2;
    state.u.ushops = [0, 0, 0, 0, 0];
    state.u.urooms = [0, 0, 0, 0, 0];
    const wand = { otyp: WAN_POLYMORPH, oclass: WAND_CLASS, spe: 1 };
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await bhito(stock, wand, state, {
        rn2: bound => bound === 8 ? 0 : bound - 1,
        rn1, rnd, rne,
    });

    assert.equal(state.go.obj_zapped, true);
    assert.ok(eshk.robbed > 0, 'C stolen_value charges for destroyed stock');
    assert.equal(keeper.mpeaceful, false);
    assert.equal(eshk.following, true);
});

test('polymorph golem consumes and bills shop stock', async () => {
    const { state, eshk, env } = await shop();
    const { ux: x, uy: y } = state.u;
    Object.assign(state.level.at(x + 1, y), { typ: ROOM,
        roomno: ROOMOFFSET, edge: false });
    const dart = mksobj_at(DART, x + 1, y, false, false, env);
    const sword = mksobj_at(LONG_SWORD, x + 1, y, false, false, env);
    const pile = state.level.objects[x + 1][y];
    assert.ok(pile?.nexthere, 'two metal stock objects form a pile');
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await create_polymon(pile, IRON, state, {
        rn2: bound => bound - 1, rn1, rnd, rne, d, rnz,
    });

    assert.ok(dart.where === OBJ_ONBILL || sword.where === OBJ_ONBILL,
        'polyuse bills at least one consumed stock item');
    assert.ok(eshk.billct > 0);
});

test('polymorph golem charges consumed stock as stolen from outside', async () => {
    const { state, keeper, eshk, env } = await shop();
    const { ux: x, uy: y } = state.u;
    Object.assign(state.level.at(x + 1, y), { typ: ROOM,
        roomno: ROOMOFFSET, edge: false });
    mksobj_at(DART, x + 1, y, false, false, env);
    mksobj_at(LONG_SWORD, x + 1, y, false, false, env);
    const pile = state.level.objects[x + 1][y];
    state.u.ux = x + 2;
    state.u.ushops = [0, 0, 0, 0, 0];
    state.u.urooms = [0, 0, 0, 0, 0];
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await create_polymon(pile, IRON, state, {
        rn2: bound => bound - 1, rn1, rnd, rne, d, rnz,
    });

    assert.ok(eshk.robbed > 0);
    assert.equal(keeper.mpeaceful, false);
    assert.equal(eshk.following, true);
});

test('breaking shop stock from outside settles theft and starts pursuit', async () => {
    const { state, keeper, eshk, env } = await shop();
    const { ux: x, uy: y } = state.u;
    Object.assign(state.level.at(x + 1, y), { typ: ROOM,
        roomno: ROOMOFFSET, edge: false });
    const potion = mksobj_at(POT_WATER, x + 1, y, false, false, env);
    state.u.ux = x + 4;
    state.u.ushops = [0, 0, 0, 0, 0];
    state.u.urooms = [0, 0, 0, 0, 0];
    state.hero_seq = 1;
    eshk.break_seq = 0;
    clearTtyMessageWindow(state);
    for (let i = 0; i < 12; ++i)
        state.nhDisplay.pushKey(' '.charCodeAt(0));

    await hero_breaks(potion, x + 1, y, 0, { state });

    assert.equal(eshk.robbed, 5,
        'make_angry_shk converts the loss into robbery on first breakage');
    assert.equal(eshk.debit, 0);
    assert.equal(eshk.break_seq, 1);
    assert.equal(eshk.following, true);
    assert.equal(keeper.mpeaceful, false);
});

test('saleable follows general, class, explicit-item, and vegetarian rows', async () => {
    const { state, keeper, eshk } = await shop();
    const accepts = (name, type) => {
        eshk.shoptype = SHOPBASE + SHTYPES.findIndex(row => row.name === name);
        return saleable(keeper, object(state, type), state);
    };
    // shknam.c saleable: RANDOM_CLASS accepts all; each specialized row
    // tests its declared iprobs rather than just the headline class symbol.
    assert.equal(accepts('general store', DIAMOND), true);
    assert.equal(accepts('used armor dealership', DART), true);
    assert.equal(accepts('used armor dealership', POT_HEALING), false);
    assert.equal(accepts('health food store', POT_HEALING), true);
    assert.equal(accepts('health food store', FOOD_RATION), true);
    assert.equal(accepts('health food store', DART), false);
    assert.equal(accepts('lighting store', TALLOW_CANDLE), true);
    assert.equal(accepts('lighting store', DART), false);
});

test('set_cost preserves source half, third, rounding and unknown-gem prices', async () => {
    const { state, keeper } = await shop();
    const dart = object(state, DART, { quan: 3 });
    // Darts cost 2: ordinary offer halves 6, tourist offer divides by 3.
    assert.equal(set_cost(dart, keeper, state), 3);
    state.urole = { ...state.urole, mnum: PM_TOURIST };
    state.u.ulevel = 1;
    assert.equal(set_cost(dart, keeper, state), 2);
    // Unknown nongem, keeper ID divisible by four: 6 * 3 / (3 * 4),
    // rounded by C's multiply-ten/add-five formula, gives 2.
    keeper.m_id = 4;
    dart.dknown = false;
    assert.equal(set_cost(dart, keeper, state), 2);
    // DIAMOND follows DILITHIUM_CRYSTAL, so its unknown offer is (1 + 3) * quan.
    assert.equal(set_cost(object(state, DIAMOND, { quan: 2, dknown: false }),
        keeper, state), 8);
});

test('contained_cost and picked_container preserve floor, free-spot and coin rules', async () => {
    const { state, keeper } = await shop();
    const sack = object(state, SACK);
    const dart = object(state, DART, { quan: 2, no_charge: true });
    const gold = object(state, GOLD_PIECE, { quan: 100, no_charge: true });
    sack.cobj = dart; dart.nobj = gold;
    dart.where = gold.where = OBJ_CONTAINED;
    dart.ocontainer = gold.ocontainer = sack;
    assert.equal(contained_cost(sack, keeper, 7, false, false, state), 7);
    picked_container(sack);
    assert.equal(dart.no_charge, 0);
    assert.equal(gold.no_charge, true);
    const cost = contained_cost(sack, keeper, 0, false, false, state);
    assert.equal(cost, 4); // Two darts at their objects[] base price of 2.
    state.u.ux = keeper.mextra.eshk.shk.x;
    assert.equal(contained_cost(sack, keeper, 0, false, false, state), 0);
    sack.where = OBJ_INVENT;
    assert.equal(contained_cost(sack, keeper, 0, false, true, state), 0);
    dart.unpaid = 1;
    assert.equal(contained_cost(sack, keeper, 0, false, true, state), cost);
});

test('billable clears nonstock flags and addtobill respects the BILLSZ limit', async () => {
    const { state, keeper, eshk, env, messages } = await shop();
    const owned = object(state, DART, { no_charge: true });
    assert.equal(billable({ value: keeper }, owned, ROOMOFFSET, true, state), false);
    assert.equal(owned.no_charge, 0);
    eshk.billct = BILLSZ;
    const stock = object(state, DART);
    await addtobill(stock, true, false, false, state, env);
    assert.deepEqual(messages, ['You got that for free!']);
    assert.equal(Boolean(stock.unpaid), false);
    assert.equal(stock.where, OBJ_FREE);
});

test('unpaid_cost uses current contained_cost rather than saved child bill prices', async () => {
    const { state, keeper, eshk, env } = await shop();
    const sack = object(state, SACK, { where: OBJ_INVENT });
    const dart = object(state, DART, { quan: 2 });
    await addtobill(dart, true, false, true, state, env);
    dart.where = OBJ_CONTAINED;
    dart.ocontainer = sack;
    sack.cobj = dart;
    eshk.bill_p[0].price = 19;
    // shk.c:3296 calls contained_cost(FALSE,TRUE), whose current buy price
    // for two darts is 2 * 2, even though this bill's saved unit price is 19.
    assert.equal(contained_cost(sack, keeper, 0, false, true, state), 4);
    assert.equal(unpaid_cost(sack, COST_CONTENTS, state), 4);
});

test('pick_obj waits on billing while detached, restores shops, then merges bills', async () => {
    const { state, eshk, env } = await shop();
    const first = object(state, DART, { quan: 2 });
    await addtobill(first, true, false, true, state, env);
    await addinv_runtime(first, env);
    const floor = mksobj_at(DART, state.u.ux, state.u.uy, false, false, env);
    Object.assign(floor, { quan: 3, known: first.known, dknown: first.dknown,
        bknown: first.bknown, spe: first.spe });
    const shops = state.u.ushops;
    let resume;
    const paused = new Promise(resolve => { resume = resolve; });
    let beginMessage;
    const started = new Promise(resolve => { beginMessage = resolve; });
    const picking = pick_obj(floor, state, { ...env,
        message: () => { beginMessage(); return paused; } });
    await Promise.race([started, picking.then(() => {
        throw new Error('pickup completed without its billing message');
    })]);
    assert.equal(floor.where, OBJ_FREE);
    assert.equal(first.quan, 2);
    assert.equal(eshk.billct, 2);
    assert.notEqual(state.u.ushops, shops);
    resume();
    const survivor = await picking;
    assert.equal(state.u.ushops, shops);
    assert.equal(survivor, first);
    assert.equal(first.quan, 5);
    assert.equal(floor.where, OBJ_DELETED);
    assert.equal(eshk.billct, 1);
    assert.equal(eshk.bill_p[0].bquan, 5);
    assert.equal(eshk.bill_p[0].bo_id, first.o_id);
});

test('useupf awaits audible billing before deletion and setpaid frees the retained item', async () => {
    const { state, eshk, env } = await shop();
    const food = mksobj_at(FOOD_RATION, state.u.ux, state.u.uy, false, false, env);
    let resume;
    const paused = new Promise(resolve => { resume = resolve; });
    let beginMessage;
    const started = new Promise(resolve => { beginMessage = resolve; });
    const consuming = useupf(food, 1, { ...env, message: () => {
        beginMessage(); return paused;
    } });
    await Promise.race([started, consuming.then(() => {
        throw new Error('floor use completed without its billing message');
    })]);
    assert.equal(food.where, OBJ_FLOOR);
    assert.equal(eshk.billct, 1);
    resume(); await consuming;
    assert.equal(food.where, OBJ_ONBILL);
    assert.equal(state.gb.billobjs, food);
    assert.equal(eshk.bill_p[0].useup, true);
    setpaid(null, state);
    assert.equal(state.gb.billobjs, null);
    assert.equal(food.where, OBJ_DELETED);
});

test('remote pick_obj inserts the acquired item before burglary clears its bill', async () => {
    const { state, eshk, env } = await shop();
    const stock = mksobj_at(DART, state.u.ux, state.u.uy, false, false, env);
    const outsideShops = [0, 0, 0, 0, 0];
    state.u.ushops = outsideShops;
    // Existing rob_shop's credit branch avoids Kops and still calls setpaid.
    eshk.credit = 100;
    let settlement = false;
    const acquired = await pick_obj(stock, state, { ...env, message: text => {
        if (text.startsWith('Your credit of')) {
            settlement = true;
            assert.equal(stock.where, OBJ_INVENT);
            assert.equal(state.invent, stock);
            assert.equal(state.u.ushops, outsideShops);
        }
    } });
    assert.equal(settlement, true);
    assert.equal(acquired, stock);
    assert.equal(Boolean(acquired.unpaid), false);
    assert.equal(eshk.billct, 0);
});

test('u_left_shop records an unpaid robbery and calls the Kops on level exit', async () => {
    const { state, keeper, eshk, messages } = await shop();
    eshk.debit = 80;
    state.gamelog = [];
    state.u.ushops0 = [ROOMOFFSET, 0, 0, 0, 0];

    await u_left_shop(state.u.ushops0, true, state, {
        message: text => messages.push(text),
    });

    assert.equal(eshk.robbed, 80);
    assert.equal(eshk.debit, 0);
    assert.equal(state.gamelog.length, 1);
    assert.equal(state.gamelog[0].flags, LL_ACHIEVE);
    assert.match(state.gamelog[0].text, /^stole 80 /u);
    assert.ok(messages.includes('The Keystone Kops are after you!'));
    assert.equal(keeper.mpeaceful, false);
    assert.equal(eshk.surcharge, true);
    assert.equal(eshk.following, true);
    assert.equal(eshk.customer, state.plname);
    assert.equal(state.unported.has('shk.c hot_pursuit'), false);
    assert.equal(state.unported.has('wizard.c choose_stairs'), false);
    assert.equal(state.unported.has('shk.c makekops'), false);
    assert.ok(kopsOnLevel(state) > 0);
});

test('u_left_shop places the Kops around a hero stepping out of the shop', async () => {
    const { state, eshk, messages } = await shop();
    eshk.debit = 80;
    state.u.ushops0 = [ROOMOFFSET, 0, 0, 0, 0];
    state.u.ux0 = state.u.ux - 1;
    state.u.uy0 = state.u.uy;
    state.level.at(state.u.ux0, state.u.uy0).edge = true;

    await u_left_shop(state.u.ushops0, false, state, {
        message: text => messages.push(text),
    });

    assert.ok(messages.includes('The Keystone Kops appear!'));
    assert.equal(state.unported.has('shk.c makekops'), false);
    assert.ok(kopsOnLevel(state) > 0);
});

test('u_left_shop warns a debtor on a shop boundary after movement', async () => {
    // A debit of 80 reaches the C warning branch. The two rows pin its spoken
    // and Deaf/surcharged pline forms; x + 1 is the adjacent boundary square.
    for (const { deaf, surcharge, expected } of [
        {
            deaf: false,
            surcharge: false,
            expected: state => `"${state.plname}!  Please pay before leaving."`,
        },
        {
            deaf: true,
            surcharge: true,
            expected: () => 'Testkeeper makes it clear that you need to pay before leaving!',
        },
    ]) {
        const { state, eshk, messages } = await shop();
        const { ux: x, uy: y } = state.u;
        const edgeX = x + 1;
        eshk.debit = 80;
        eshk.surcharge = surcharge;
        state.u.ushops0 = [ROOMOFFSET, 0, 0, 0, 0];
        state.u.ux0 = x;
        state.u.uy0 = y;
        state.u.ux = edgeX;
        state.u.uy = y;
        state.level.at(x, y).edge = false;
        state.level.at(edgeX, y).edge = true;
        if (deaf) state.u.uprops[DEAF] = { intrinsic: 1, extrinsic: 0 };

        await u_left_shop('', false, state, {
            message: text => messages.push(text),
        });

        assert.deepEqual(messages, [expected(state)]);
        assert.deepEqual([state.u.ux, state.u.uy], [edgeX, y]);
    }
});

test('bill_dummy_object replaces the original bill and preserves its old price', async () => {
    const { state, keeper, eshk, env } = await shop();
    const dart = object(state, DART);
    await addtobill(dart, false, false, true, state, env);
    await addinv_runtime(dart, env);
    const oldPrice = eshk.bill_p[0].price;
    dart.spe = 2; // Enhancement must not change the bill for the old object.
    await bill_dummy_object(dart, env);
    const dummy = state.gb.billobjs;
    assert.equal(dummy.where, OBJ_ONBILL);
    assert.equal(eshk.billct, 1);
    assert.equal(eshk.bill_p[0].bo_id, dummy.o_id);
    assert.equal(eshk.bill_p[0].price, oldPrice);
    assert.equal(Boolean(dart.unpaid), false);
    alter_cost(dummy, -(oldPrice + 1), state, env);
    assert.equal(eshk.bill_p[0].price, oldPrice + 1);
    setpaid(keeper, state);
    assert.equal(dummy.where, OBJ_DELETED);
    assert.equal(eshk.billct, 0);
});

test('unpaid crysknife placement waits for billing before mutation and linking', async () => {
    const { state, eshk, env } = await shop();
    const knife = object(state, CRYSKNIFE, { oerodeproof: false });
    await addtobill(knife, false, false, true, state, env);
    assert.equal(Boolean(knife.unpaid), true);

    let resumeMessage;
    const messageWait = new Promise(resolve => { resumeMessage = resolve; });
    const messages = [];
    const delayedEnv = { ...env, message(text) {
        messages.push(text);
        return messageWait;
    } };
    const x = state.u.ux + 1;
    const y = state.u.uy;
    const placement = place_object(knife, x, y, delayedEnv);
    assert.equal(typeof placement?.then, 'function');
    assert.equal(knife.otyp, CRYSKNIFE);
    assert.equal(Boolean(knife.unpaid), true);
    assert.ok(messages[0].includes('you pay for it'));
    assert.equal(state.level.objects[x][y] ?? null, null);

    resumeMessage();
    assert.equal(await placement, knife);
    assert.equal(knife.otyp, WORM_TOOTH);
    assert.equal(knife.oerodeproof, false);
    assert.equal(Boolean(knife.unpaid), false);
    assert.equal(eshk.billct, 1);
    assert.equal(state.level.objects[x][y], knife);
    assert.equal(knife.where, OBJ_FLOOR);
});

test('using an unpaid trap quotes the purchase and bills its used-up copy', async () => {
    const { state, eshk, env, messages } = await shop();
    const beartrap = object(state, BEARTRAP);
    await addtobill(beartrap, false, false, true, state, env);
    await addinv_runtime(beartrap, env);
    const price = eshk.bill_p[0].price;

    await use_unpaid_trapobj(beartrap, state.u.ux, state.u.uy, state, env);

    assert.ok(messages.includes('"You set it, you buy it!"'));
    assert.equal(Boolean(beartrap.unpaid), false);
    assert.equal(eshk.billct, 1);
    assert.equal(eshk.bill_p[0].useup, true);
    assert.equal(eshk.bill_p[0].price, price);
    assert.equal(state.gb.billobjs.where, OBJ_ONBILL);
});

test('subfrombill retains only previously used quantity under a fresh ID', async () => {
    const { state, keeper, eshk, env } = await shop();
    const dart = object(state, DART, { quan: 5 });
    await addtobill(dart, false, false, true, state, env);
    const id = dart.o_id;
    dart.quan = 2;
    subfrombill(dart, keeper, state, env);
    assert.equal(Boolean(dart.unpaid), false);
    assert.equal(eshk.billct, 1);
    assert.equal(eshk.bill_p[0].bquan, 3);
    assert.equal(eshk.bill_p[0].useup, true);
    assert.notEqual(eshk.bill_p[0].bo_id, id);
    assert.equal(state.gb.billobjs.quan, 3);
});

test('costly_gold spends credit before adding only the balance to loan and debit', async () => {
    const { state, eshk, env, messages } = await shop();
    eshk.credit = 3;
    await costly_gold(state.u.ux, state.u.uy, 5, false, state, env);
    assert.equal(eshk.credit, 0);
    assert.equal(eshk.debit, 2);
    assert.equal(eshk.loan, 2);
    assert.deepEqual(messages, ['Your credit is erased.',
        'You owe Testkeeper 2 zorkmids.']);
});

test('unpaid naming uses total billed contents and suppresses prices when requested', async () => {
    const { state, eshk, env } = await shop();
    const dart = object(state, DART, { quan: 3 });
    await addtobill(dart, true, false, true, state, env);
    await addinv_runtime(dart, env);
    const price = 3 * eshk.bill_p[0].price;
    assert.equal(unpaid_cost(dart, COST_CONTENTS, state), price);
    assert.match(donameFresh(dart, state), new RegExp(`\\(unpaid, ${price} zorkmids\\)$`));
    state.iflags.suppress_price = true;
    assert.doesNotMatch(donameFresh(dart, state), /unpaid|zorkmid/u);
    state.iflags.suppress_price = false;
    state.u.uprops[DEAF].intrinsic = 5;
    obj_extract_self(dart, env);
    obfree(dart, null, env);
    assert.equal(dart.where, OBJ_ONBILL);
});

test('monster planning owns bill state and keeps ordinary naming RNG-neutral', async () => {
    const { state, keeper, eshk, env } = await shop();
    const dart = object(state, DART, { quan: 3 });
    await addtobill(dart, true, false, true, state, env);
    await addinv_runtime(dart, env);
    const used = object(state, FOOD_RATION);
    await addtobill(used, false, true, true, state, env);
    keeper.movement = 0; // No monster allocation before the custom turn boundary.
    state.u.umovement = 0;
    state.u.uprops[HALLUC].intrinsic = 10;
    const displayRngBefore = structuredClone(state.displayCtx);
    const billBefore = structuredClone(eshk.bill_p);
    let reached = false;
    await preflightSimpleMonsterActions(state, {
        async advanceRound(planned) {
            reached = true;
            const plannedKeeper = planned.level.monlist;
            const plannedShop = plannedKeeper.mextra.eshk;
            assert.notEqual(plannedKeeper, keeper);
            assert.equal(planned.level.rooms[0].resident, plannedKeeper);
            assert.notEqual(plannedShop, eshk);
            assert.notEqual(plannedShop.bill, eshk.bill);
            assert.equal(plannedShop.bill_p, plannedShop.bill);
            assert.notEqual(plannedShop.bill_p[0], eshk.bill_p[0]);
            assert.notEqual(planned.gb.billobjs, used);
            assert.equal(planned.gb.billobjs.o_id, used.o_id);
            const displayBeforeName = structuredClone(planned.displayCtx);
            donameFresh(planned.invent, planned);
            // objnam.c:doname_base does not call invent.c:currency or draw
            // either random stream. The currency ROLL_FROM draw belongs to
            // invent.c:xprname and uses gameplay rn2, so this ordinary name
            // must leave the planner's display stream unchanged.
            assert.notEqual(planned.displayCtx, state.displayCtx);
            assert.deepEqual(planned.displayCtx, displayBeforeName);
            subfrombill(planned.invent, plannedKeeper, planned, { ...env, state: planned });
            setpaid(plannedKeeper, planned);
            assert.equal(planned.gb.billobjs, null);
            assert.equal(plannedShop.billct, 0);
            return true;
        },
    });
    assert.equal(reached, true);
    assert.equal(state.level.rooms[0].resident, keeper);
    assert.equal(state.gb.billobjs, used);
    assert.equal(used.where, OBJ_ONBILL);
    assert.equal(dart.unpaid, 1);
    assert.equal(eshk.billct, 2);
    assert.deepEqual(eshk.bill_p, billBefore);
    assert.deepEqual(state.displayCtx, displayRngBefore);
});

test('planned shopkeeper death cannot settle live buried or migrating objects', async () => {
    const { state } = await shop();
    for (const column of state.level.monsters) column.fill(null);
    for (const column of state.level.objects) column.fill(null);
    state.level.objlist = null;
    state.level.traps = [];
    state.level.regions = [];
    state.u.umovement = 0;
    state.u.utotype = 0;
    state.u.ustuck = state.u.usteed = null;
    state.context.bypasses = false;
    if (state.context.victual) state.context.victual.piece = null;
    if (state.context.tin) state.context.tin.tin = null;
    state.go ??= {};
    state.go.occupation = null;
    state.head_engr = null;
    for (const row of state.viz_array) row.fill(0);

    // A small interior shop, away from map edges. Fatal lava exercises the
    // real movemon/minliquid/mondead path without combat or injected callbacks.
    state.u.ux = state.u.ux0 = 10;
    state.u.uy = state.u.uy0 = 10;
    const room = state.level.rooms[0];
    Object.assign(room, { lx: 7, hx: 10, ly: 9, hy: 11, rtype: SHOPBASE });
    for (let x = room.lx; x <= room.hx; ++x)
        for (let y = room.ly; y <= room.hy; ++y)
            Object.assign(state.level.at(x, y), {
                typ: ROOM, roomno: ROOMOFFSET, edge: false,
            });
    state.level.at(8, 10).typ = LAVAPOOL;
    const keeper = newMonster({ data: state.mons[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER, m_id: state.context.ident++, mx: 8, my: 10,
        // Five HP ensures lava is fatal; one ration admits a monster action.
        mhp: 5, mhpmax: 5, movement: NORMAL_SPEED,
        m_lev: state.mons[PM_SHOPKEEPER].mlevel, mcanmove: true, mcansee: true,
        isshk: true, mpeaceful: true, minvent: null,
        // mon.c logdeadmon omits a second live-log entry for revived keepers.
        // A first death would stop at the existing unported live-log branch.
        mrevived: true });
    const buried = object(state, DART, {
        unpaid: 1, no_charge: true, where: OBJ_BURIED, ox: 9, oy: 10,
    });
    const migrant = newMonster({ data: state.mons[PM_GIANT_RAT],
        mnum: PM_GIANT_RAT, m_id: state.context.ident++,
        // Migrating monsters are off-map; their carried objects remain billed.
        mx: 0, my: 0, mstate: MON_MIGRATING, mhp: 5, mhpmax: 5 });
    const carried = object(state, DART, {
        unpaid: 1, where: OBJ_MINVENT, ocarry: migrant,
    });
    migrant.minvent = carried;
    // One bill entry per dart, using the source base price of two zorkmids.
    const bill = [buried, carried].map(obj => ({
        bo_id: obj.o_id, bquan: obj.quan, price: 2, useup: false,
    }));
    keeper.mextra = { eshk: { shoproom: ROOMOFFSET, shoptype: SHOPBASE,
        shoplevel: { ...state.u.uz }, shk: { x: 7, y: 10 }, shd: { x: 7, y: 9 },
        bill, bill_p: bill, billct: bill.length, credit: 0, debit: 0, loan: 0,
        surcharge: false, shknam: 'Testkeeper' } };
    room.resident = keeper;
    state.level.monlist = keeper;
    state.level.monsters[8][10] = keeper;
    state.level.buriedobjlist = buried;
    state.gm ??= {};
    state.gm.migrating_mons = migrant;
    state.gb ??= {};
    state.gb.billobjs = null;
    const shops = [...state.u.ushops];
    const billBefore = structuredClone(bill);

    const result = await preflightSimpleMonsterActions(state);

    assert.equal(result.upkeepCount, 1); // The admitted monster ration completed.
    assert.equal(buried.unpaid, 1);
    assert.equal(buried.no_charge, true);
    assert.equal(carried.unpaid, 1);
    assert.deepEqual(state.u.ushops, shops);
    assert.equal(state.level.buriedobjlist, buried);
    assert.equal(state.gm.migrating_mons, migrant);
    assert.equal(carried.ocarry, migrant);
    assert.equal(migrant.minvent, carried);
    assert.equal(room.resident, keeper);
    assert.equal(keeper.mhp, 5);
    assert.deepEqual(bill, billBefore);
});
