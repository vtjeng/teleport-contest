import assert from 'node:assert/strict';
import test from 'node:test';
import { A_CHA, COST_CONTENTS, DETECT_MONSTERS, ECMD_OK, ECMD_TIME, MENU_TRADITIONAL,
    OBJ_CONTAINED, OBJ_DELETED, OBJ_FREE, OBJ_INVENT, OBJ_ONBILL,
    ROOM, ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { addinv_runtime, money_cnt, obj_extract_self, obfree } from '../js/invent.js';
import { newObject } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { paydoname } from '../js/objnam.js';
import { DART, FOOD_RATION, GOLD_PIECE, SACK } from '../js/objects.js';
import { PM_SHOPKEEPER } from '../js/monsters.js';
import { FullyUsedUp, PartlyUsedUp, PartlyIntact, FullyIntact,
    KnownContainer, UndisclosedContainer, addtobill, bp_to_obj,
    cheapest_item, dopay, dopayobj, find_oid, make_itemized_bill,
    sortbill_cmp, unpaid_cost } from '../js/shk.js';

function object(state, type, overrides = {}) {
    return newObject({ otyp: type, oclass: state.objects[type].oc_class,
        quan: 1, o_id: state.context.ident++, dknown: true, where: OBJ_FREE,
        ...overrides });
}

async function shop() {
    // Independent startup fixture; the room and keeper below isolate payment
    // from level generation. Keeper HP10 is alive, ID3 is a distinct owner,
    // and the adjacent tile puts that owner within C's payment distance.
    await runSegment({ seed: 5518321, datetime: '20350306100412',
        nethackrc: 'OPTIONS=name:Buyer,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none', moves: '' });
    const state = game;
    const { ux: x, uy: y } = state.u;
    const room = state.level.rooms[0];
    room.rtype = SHOPBASE;
    state.level.flags.has_shop = true;
    for (const px of [x - 1, x])
        Object.assign(state.level.at(px, y), { typ: ROOM, roomno: ROOMOFFSET, edge: false });
    const keeper = { isshk: true, mpeaceful: true, mhp: 10, mcanmove: true,
        data: state.mons[PM_SHOPKEEPER], mx: x - 1, my: y, m_id: 3,
        mextra: { eshk: { shoproom: ROOMOFFSET, shoptype: SHOPBASE,
            shoplevel: { ...state.u.uz }, shk: { x: x - 1, y },
            bill: [], bill_p: null, billct: 0, credit: 0, debit: 0,
            loan: 0, robbed: 0, surcharge: false, shknam: 'Testkeeper' } }, nmon: null };
    room.resident = keeper;
    state.level.monlist = keeper;
    state.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    state.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    state.u.acurr.a[A_CHA] = 11; // get_cost's neutral charisma price bracket.
    state.u.abon[A_CHA] = state.u.atemp[A_CHA] = 0;
    // A known sack uses its source base price2, not unknown-item markup.
    state.objects[SACK].oc_name_known = true;
    state.program_state.in_moveloop = false;
    const messages = [];
    const env = objectGenerationEnv({ state, message: line => messages.push(line),
        redraw: () => {}, random: { rn2: () => 0, rnd: () => 1,
            rn1: (_range, base) => base, rne: () => 1 } });
    env.bot = () => {};
    env.selectMenu = (_state, spec) => spec.items.filter(row => row.value)
        .map(row => ({ value: row.value }));
    const stock = async (type, overrides = {}) => {
        const obj = object(state, type, overrides);
        await addtobill(obj, true, false, true, state, env);
        return await addinv_runtime(obj, env);
    };
    const gold = async amount => addinv_runtime(object(state, GOLD_PIECE, { quan: amount }), env);
    return { state, keeper, eshk: keeper.mextra.eshk, env, messages, stock, gold };
}

test('sortbill_cmp puts used rows first, then descending price and ascending bill index', () => {
    // shk.c:1499–1518: category dominates cost; bidx breaks equal-cost ties.
    const rows = [
        { usedup: FullyIntact, cost: 90, bidx: 0 },
        { usedup: FullyUsedUp, cost: 8, bidx: 2 },
        { usedup: PartlyUsedUp, cost: 8, bidx: 1 },
        { usedup: KnownContainer, cost: 100, bidx: 3 },
    ].sort(sortbill_cmp);
    assert.deepEqual(rows.map(row => row.bidx), [1, 2, 3, 0]);
    // The negative terminator lies outside the counted rows and is ignored.
    assert.equal(cheapest_item(rows.length, [...rows, { cost: -1 }]), 8);
    // C's comparator returns int even though the subtraction uses long.
    assert.equal(sortbill_cmp({ usedup: 4, cost: 0 }, { usedup: 4, cost: 2147483648 }), -2147483648);
});

test('find_oid visits every C root in order and bp_to_obj separates used bill objects', () => {
    const id = 17; // One arbitrary duplicate ID distinguishes root precedence.
    // Seven live-object roots plus the separate used-up bill-object chain.
    const roots = Array.from({ length: 8 }, (_, i) => ({ o_id: id, where: i, nobj: null }));
    const state = { invent: roots[0], level: { objlist: roots[1], buriedobjlist: roots[2],
        monlist: { minvent: roots[4] } }, gm: { migrating_objs: roots[3],
        migrating_mons: { minvent: roots[5] }, mydogs: { minvent: roots[6] } },
    gb: { billobjs: roots[7] } };
    // shk.c find_oid searches four object roots, then three monster roots.
    for (let i = 0; i < 7; ++i) {
        assert.equal(find_oid(id, state), roots[i]);
        roots[i].o_id = id + 1;
    }
    assert.equal(find_oid(id, state), null);
    assert.equal(bp_to_obj({ bo_id: id, useup: true }, state), roots[7]);
    assert.equal(bp_to_obj({ bo_id: id, useup: false }, state), null);
});

test('make_itemized_bill separates used and intact portions without changing their bill index', async () => {
    const { state, keeper, eshk, stock, env } = await shop();
    const dart = await stock(DART, { quan: 5 });
    dart.quan = 2;
    const food = await stock(FOOD_RATION);
    obj_extract_self(food, env); obfree(food, null, env);
    const { ibillct, ibill } = make_itemized_bill(keeper, state);
    assert.equal(ibillct, 3);
    assert.deepEqual(ibill.slice(0, 3).map(row => row.usedup),
        [FullyUsedUp, PartlyUsedUp, PartlyIntact]);
    const rows = ibill.filter(row => row.obj === dart);
    assert.deepEqual(rows.map(row => row.quan), [3, 2]);
    assert.deepEqual(rows.map(row => row.bidx), [0, 0]);
    assert.equal(ibill[3].obj, null);
    assert.equal(ibill[3].bidx, -1);
    assert.equal(eshk.bill_p[0].bquan, 5);
});

test('paydoname hides then restores contents, price suppression and wizard weight', async () => {
    const { state } = await shop();
    const sack = object(state, SACK, { where: OBJ_INVENT, cknown: true });
    sack.cobj = object(state, DART, { where: OBJ_CONTAINED, ocontainer: sack });
    state.iflags.wizweight = true;
    assert.equal(paydoname(sack, state), 'the contents of your sack');
    sack.unpaid = 1;
    assert.equal(paydoname(sack, state), 'an unpaid sack and its contents');
    sack.no_charge = 1;
    assert.equal(paydoname(sack, state), 'a sack and its contents');
    assert.equal(sack.cknown, true);
    assert.equal(state.iflags.suppress_price, 0);
    assert.equal(state.iflags.wizweight, true);
});

test('dopay uses credit then cash and removes every selected bill entry after payment', async () => {
    const { state, eshk, stock, gold, env, messages } = await shop();
    const dart = await stock(DART, { quan: 3 });
    await gold(20);
    eshk.credit = 2;
    assert.equal(await dopay(state, env), ECMD_TIME);
    assert.equal(money_cnt(state.invent), 16); // Price6, credit2, cash4.
    assert.equal(eshk.credit, 0);
    assert.equal(eshk.billct, 0);
    assert.equal(dart.unpaid, 0);
    assert.ok(messages.includes('The price is partially covered by your credit.'));
    assert.ok(messages.some(line => line.includes('Thank you for shopping')));
});

test('dopay cancellation preserves quantities, credit, bill entries and the no-time result', async () => {
    const { state, eshk, stock, gold, env } = await shop();
    const dart = await stock(DART, { quan: 2 });
    await gold(20);
    env.selectMenu = () => null;
    assert.equal(await dopay(state, env), ECMD_OK);
    assert.equal(eshk.billct, 1);
    assert.equal(dart.unpaid, 1);
    assert.equal(dart.quan, 2);
    assert.equal(money_cnt(state.invent), 20);
});

test('dopay pays used objects first and deletes them only after the bill update', async () => {
    const { state, eshk, stock, gold, env } = await shop();
    const dart = await stock(DART, { quan: 5 });
    dart.quan = 2;
    const food = await stock(FOOD_RATION);
    obj_extract_self(food, env); obfree(food, null, env);
    assert.equal(food.where, OBJ_ONBILL);
    await gold(100);
    assert.equal(await dopay(state, env), ECMD_TIME);
    assert.equal(eshk.billct, 0);
    assert.equal(food.where, OBJ_DELETED);
    assert.equal(state.gb.billobjs, null);
    assert.equal(dart.unpaid, 0);
    assert.equal(dart.quan, 2);
    assert.equal(money_cnt(state.invent), 45); // Ration45 + five darts10.
});

test('dopayobj refuses intact partial goods until their used portion is paid', async () => {
    const { state, keeper, eshk, stock, gold, env, messages } = await shop();
    const dart = await stock(DART, { quan: 5 });
    dart.quan = 2;
    await gold(30);
    assert.equal(await dopayobj(keeper, eshk.bill_p[0], dart, 1, false, false, state, env), -1);
    assert.equal(money_cnt(state.invent), 30);
    assert.equal(dart.quan, 2);
    assert.ok(messages.some(line => line.includes('Please pay for the other')));
});

test('dopay builds one undisclosed-container row and buys its contents before its shell', async () => {
    const { state, keeper, eshk, stock, gold, env } = await shop();
    const dart = await stock(DART, { quan: 2 });
    const sack = await stock(SACK, { cknown: false });
    obj_extract_self(dart, env);
    dart.where = OBJ_CONTAINED; dart.ocontainer = sack;
    sack.cobj = dart;
    await gold(50);
    const { ibillct, ibill } = make_itemized_bill(keeper, state);
    assert.equal(ibillct, 1);
    assert.equal(ibill[0].usedup, UndisclosedContainer);
    assert.equal(ibill[0].cost, unpaid_cost(sack, COST_CONTENTS, state));
    assert.equal(await dopay(state, env), ECMD_TIME);
    assert.equal(eshk.billct, 0);
    assert.equal(sack.unpaid, 0);
    assert.equal(dart.unpaid, 0);
    assert.equal(money_cnt(state.invent), 44); // Sack2 + two darts4.
});

test('traditional payment itemizes a single stack and rejects insufficient funds', async () => {
    const { state, eshk, stock, gold, env, messages } = await shop();
    await stock(DART, { quan: 3 });
    await gold(5);
    state.flags.menu_style = MENU_TRADITIONAL;
    assert.equal(await dopay(state, env), ECMD_OK);
    assert.equal(eshk.billct, 1);
    assert.ok(messages.some(line => line.includes("don't have enough gold")));
    await gold(1);
    let query = null;
    env.yn = q => { query = q; return 'y'; };
    assert.equal(await dopay(state, env), ECMD_TIME);
    assert.match(query, /3 darts for 6 zorkmids\.  Pay\?/u);
    assert.equal(eshk.billct, 0);
});

test('dopay wakes an owing keeper before clearing debit and loan with credit or cash', async () => {
    // Debit6 partitions these credits into cash-only, mixed and credit-only;
    // starting gold20 covers the largest cash payment without a refusal.
    for (const credit of [0, 2, 10]) {
        const { state, keeper, eshk, env, gold, messages } = await shop();
        await gold(20);
        eshk.debit = 6; eshk.loan = 6; eshk.credit = credit;
        keeper.msleeping = true; keeper.mcanmove = false;
        state.u.uprops[DETECT_MONSTERS].intrinsic = 1;
        let sawWake = false;
        env.message = line => {
            messages.push(line);
            if (line.includes('wakes up')) {
                sawWake = true;
                assert.equal(keeper.msleeping, true);
                assert.equal(eshk.debit, 6);
            }
        };
        assert.equal(await dopay(state, env), ECMD_TIME);
        assert.equal(sawWake, true);
        assert.equal(keeper.msleeping, 0);
        assert.equal(keeper.mcanmove, 1);
        assert.equal(eshk.debit, 0);
        assert.equal(eshk.loan, 0);
        assert.equal(eshk.credit, Math.max(credit - 6, 0));
        assert.equal(money_cnt(state.invent), 20 - Math.max(6 - credit, 0));
    }
});
