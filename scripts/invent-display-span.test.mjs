import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BUC_BLESSED,
    BUC_UNKNOWN,
    BUC_UNCURSED,
    CQ_CANNED,
    OBJ_CONTAINED,
    OBJ_INVENT,
} from '../js/const.js';
import {
    count_buc,
    count_contents,
    count_unpaid,
    dounpaid,
    display_inventory,
    display_pickinv,
    display_used_invlets,
    initializeInventory,
    repopulate_perminvent,
    tally_BUCX,
    this_type_only,
} from '../js/invent.js';
import { cmdq_add_key } from '../js/cmd.js';
import { init_objects } from '../js/o_init.js';
import { newObject, weight } from '../js/obj.js';
import {
    COIN_CLASS,
    FOOD_CLASS,
    FOOD_RATION,
    GOLD_PIECE,
    SACK,
    objects_globals_init,
    TOOL_CLASS,
} from '../js/objects.js';
import { PM_CLERIC } from '../js/monsters.js';

function stateFixture() {
    const state = {
        context: { ident: 2 },
        disp: {},
        flags: {
            goldX: false,
            invlet_constant: true,
            inv_order: [COIN_CLASS, TOOL_CLASS, FOOD_CLASS],
            sortloot: 'l',
            sortpack: true,
        },
        iflags: {
            force_invmenu: false,
            menu_requested: false,
            menu_head_objsym: false,
        },
        program_state: {},
        u: { ulevel: 1 },
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    initializeInventory(state);
    return state;
}

function object(otyp, state, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        age: 1,
        bknown: true,
        dknown: true,
        known: true,
        oclass: type.oc_class,
        otyp,
        quan: 1,
        rknown: true,
        where: OBJ_INVENT,
        ...overrides,
    });
    if (obj.owt === undefined) obj.owt = weight(obj, { state });
    return obj;
}

test('count_unpaid and count_contents follow nested chains and quantities', () => {
    const state = stateFixture();
    const sack = object(SACK, state, { where: OBJ_INVENT });
    const ration = object(FOOD_RATION, state, {
        where: OBJ_CONTAINED,
        unpaid: true,
        quan: 3,
        ocontainer: sack,
    });
    const nested = object(SACK, state, {
        where: OBJ_CONTAINED,
        ocontainer: sack,
    });
    const second = object(FOOD_RATION, state, {
        where: OBJ_CONTAINED,
        unpaid: true,
        ocontainer: nested,
    });
    ration.nobj = nested;
    nested.cobj = second;
    sack.cobj = ration;

    assert.equal(count_unpaid(sack), 2);
    assert.equal(count_contents(sack, false, false, true, false, state), 2);
    assert.equal(count_contents(sack, true, true, true, false, state), 5);
    assert.equal(count_contents(sack, true, false, false, false, state), 2);
    assert.equal(count_contents(sack, false, false, false, true, state), 1);
});

test('count_buc and tally_BUCX preserve cleric and goldX classification', () => {
    const state = stateFixture();
    const blessed = object(FOOD_RATION, state, {
        bknown: false,
        blessed: true,
        invlet: 'a',
        pickup_prev: true,
    });
    const gold = object(GOLD_PIECE, state, {
        bknown: false,
        invlet: '$',
        nobj: null,
    });
    blessed.nobj = gold;

    // The source makes bknown true for the ordinary object while leaving
    // coins classified by goldX when the role is PM_CLERIC.
    state.urole = { mnum: PM_CLERIC };
    assert.equal(count_buc(blessed, BUC_BLESSED, null, state), 1);
    assert.equal(count_buc(blessed, BUC_UNCURSED, null, state), 1);
    assert.deepEqual(tally_BUCX(blessed, false, state), {
        bcnt: 1, ucnt: 1, ccnt: 0, xcnt: 0, ocnt: 0, jcnt: 1,
    });

    state.flags.goldX = true;
    assert.equal(count_buc(blessed, BUC_UNKNOWN, null, state), 1);
    assert.deepEqual(tally_BUCX(blessed, false, state), {
        bcnt: 1, ucnt: 0, ccnt: 0, xcnt: 1, ocnt: 0, jcnt: 1,
    });
});

test('this_type_only handles BUC, just-picked, and ordinary class filters', () => {
    const state = stateFixture();
    const blessed = object(FOOD_RATION, state, { blessed: true });
    assert.equal(this_type_only(blessed, { ...state, gt: { this_type: 'B' } }), true);
    assert.equal(this_type_only(blessed, { ...state, gt: { this_type: 'C' } }), false);
    assert.equal(this_type_only({ ...blessed, pickup_prev: true }, {
        ...state, gt: { this_type: 'P' },
    }), true);
    assert.equal(this_type_only(blessed, { ...state, gt: { this_type: blessed.oclass } }), true);
});

test('display_pickinv supports loot sorting and display-only menus', async () => {
    const state = stateFixture();
    state.flags.sortloot = 'f'; // source SORTLOOT_LOOT branch.
    const ration = object(FOOD_RATION, state, { invlet: 'a' });
    state.invent = ration;
    const shown = [];
    const selected = await display_pickinv(
        null, null, 'Inventory:', false, false, state,
        { menu: async (items, _state, how) => {
            shown.push({ items, how });
            return null;
        } },
    );
    assert.equal(selected, null);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].how, 0); // PICK_NONE is C's display-only mode.
    assert.equal(shown[0].items.some((item) => item.label?.includes('ration')), true);
});

test('display_inventory consumes a queued inventory key before opening a menu', async () => {
    const state = stateFixture();
    const ration = object(FOOD_RATION, state, { invlet: 'a' });
    state.invent = ration;
    cmdq_add_key(CQ_CANNED, 'a'.charCodeAt(0), state);
    assert.equal(await display_inventory(null, true, state), 'a');
});

test('display_used_invlets excludes the requested letter and returns menu choice', async () => {
    const state = stateFixture();
    const ration = object(FOOD_RATION, state, { invlet: 'a' });
    const sack = object(SACK, state, { invlet: 'b' });
    ration.nobj = sack;
    state.invent = ration;
    let rows;
    const selected = await display_used_invlets('a', state, {
        menu: (items) => { rows = items; return 'b'; },
    });
    assert.equal(selected, 'b');
    assert.equal(rows.some((item) => item.selector === 'a'), false);
    assert.equal(rows.some((item) => item.selector === 'b'), true);
});

test('repopulate_perminvent keeps an empty permanent inventory display alive', async () => {
    const state = stateFixture();
    let rows;
    const selected = await repopulate_perminvent(state, {
        menu: (items, _state, how) => {
            rows = { items, how };
            return null;
        },
    });
    assert.equal(selected, null);
    assert.equal(rows.how, 0);
    assert.equal(rows.items.at(-1).text, 'Not carrying anything');
});

test('dounpaid reports floor-only unpaid objects through its message owner', async () => {
    const state = stateFixture();
    const messages = [];
    await dounpaid(0, 1, 0, state, {
        message: (line) => messages.push(line),
    });
    assert.deepEqual(messages, [
        "You aren't carrying any unpaid items but there is 1 on the floor.",
    ]);
});
