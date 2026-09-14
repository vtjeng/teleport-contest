import assert from 'node:assert/strict';
import test from 'node:test';
import {
    A_CHA, BILLSZ, COST_CONTENTS, DEAF, HALLUC, OBJ_CONTAINED, OBJ_DELETED, OBJ_FLOOR,
    OBJ_FREE, OBJ_INVENT, OBJ_ONBILL, ROOM, ROOMOFFSET, SHOPBASE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_SHOPKEEPER, PM_TOURIST } from '../js/monsters.js';
import { addinv_runtime, obfree, obj_extract_self, useupf } from '../js/invent.js';
import { bill_dummy_object, mksobj_at, newObject } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { donameFresh } from '../js/objnam.js';
import { DART, DIAMOND, FOOD_RATION, GOLD_PIECE, POT_HEALING, SACK,
    TALLOW_CANDLE } from '../js/objects.js';
import { pick_obj } from '../js/pickup.js';
import { addtobill, alter_cost, billable, contained_cost, costly_gold,
    picked_container, set_cost, setpaid, subfrombill, unpaid_cost } from '../js/shk.js';
import { saleable } from '../js/shknam.js';
import { SHTYPES } from '../js/shtypes_data.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';

async function shop() {
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
            loan: 0, surcharge: false, shknam: 'Testkeeper' } }, nmon: null };
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

test('monster planning owns its bill arrays, bill-object chain, room links and display RNG', async () => {
    const { state, keeper, eshk, env } = await shop();
    const dart = object(state, DART, { quan: 3 });
    await addtobill(dart, true, false, true, state, env);
    await addinv_runtime(dart, env);
    const used = object(state, FOOD_RATION);
    await addtobill(used, false, true, true, state, env);
    keeper.movement = 0; // No monster allocation before the custom turn boundary.
    state.u.umovement = 0;
    state.u.uprops[HALLUC].intrinsic = 10;
    const rngBefore = structuredClone(state.displayCtx);
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
            donameFresh(planned.invent, planned);
            assert.notDeepEqual(planned.displayCtx, rngBefore);
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
    assert.deepEqual(state.displayCtx, rngBefore);
});
