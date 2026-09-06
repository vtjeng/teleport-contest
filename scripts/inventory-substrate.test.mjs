import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    A_CON,
    A_STR,
    ALTAR,
    BLINDED,
    CONTAINED_SYM,
    DOOR,
    D_NODOOR,
    FUMBLING,
    HALLUC,
    HALLUC_RES,
    HANDS_SYM,
    HVY_ENCUMBER,
    LAST_PROP,
    LAVAPOOL,
    LEVITATION,
    LOST_EXPLODING,
    LOST_THROWN,
    MOD_ENCUMBER,
    NON_PM,
    NUM_ATTRS,
    A_CHAOTIC,
    A_LAWFUL,
    ENERGY_REGENERATION,
    HALF_SPDAM,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_ONBILL,
    PIT,
    ROOM,
    SINK,
    STAIRS,
    STONE_RES,
    WEB,
    ONAME_WISH,
    W_ART,
    W_QUIVER,
    W_WEP,
} from '../js/const.js';
import {
    dropy,
    dropz,
    dropx,
    preflight_dropx,
    UnsupportedDropError,
} from '../js/do.js';
import { calc_capacity, near_capacity, weight_cap } from '../js/hack.js';
import {
    add_to_buried,
    add_to_container,
    addinv,
    addinv_runtime,
    addinv_nomerge,
    assigninvlet,
    delete_contents,
    freeinv,
    hold_another_object,
    INVLET_BASIC,
    initializeInventory,
    inventoryObjects,
    mergable,
    merged,
    money_cnt,
    nxtobj,
    obj_extract_self,
    obj_to_let,
    preflight_addinv,
    preflight_addinv_sequence,
    prepareHoldDropAdmission,
    prinv,
    reassign,
    resetInventory,
    stackobj,
    update_inventory,
    useupall,
    will_feel_cockatrice,
    xprname,
} from '../js/invent.js';
import { GameMap } from '../js/game.js';
import { oname } from '../js/do_name.js';
import {
    ART_EXCALIBUR, ART_EYE_OF_THE_AETHIOPICA, ART_GRAYSWANDIR,
    ART_MAGIC_MIRROR_OF_MERLIN,
    UnsupportedArtifactDisplayError, init_artifacts,
} from '../js/artifacts.js';
import {
    newObject,
    place_object,
    remove_object,
    UnsupportedObjectOperationError,
    weight,
} from '../js/obj.js';
import {
    PM_COCKATRICE,
    PM_FOX,
    PM_KNIGHT,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { add_rect_to_reg, create_region } from '../js/region.js';
import {
    APPLE,
    AKLYS,
    BAG_OF_HOLDING,
    CORPSE,
    DART,
    ARROW,
    BOULDER,
    EGG,
    FIGURINE,
    FOOD_RATION,
    GLOB_OF_GRAY_OOZE,
    GOLD_PIECE,
    HEAVY_IRON_BALL,
    LUCKSTONE,
    AMULET_OF_ESP,
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    CANDELABRUM_OF_INVOCATION,
    LONG_SWORD,
    MIRROR,
    OIL_LAMP,
    ROCK,
    SACK,
    SILVER_SABER,
    SPE_BOOK_OF_THE_DEAD,
    TALLOW_CANDLE,
    objects_globals_init,
} from '../js/objects.js';

// A concrete catalog member keeps body-object names source-backed too.
const TEST_SPECIES = PM_FOX;
const LETTERS_PER_CASE = 26; // a-z or A-Z inventory slots
const MINIMUM_HERO_ATTRIBUTE = 3; // makes a normal heavy ball exceed MOD_ENCUMBER
const NON_OBJECT_VALUE = 7; // exercises a truthy primitive object argument
// Construct corpse fixtures without invoking the monster seam before the test.
const PLACEHOLDER_CORPSE_WEIGHT = 1;

function initializedState() {
    const state = {
        // Object/monster id 1 is reserved; startup begins from 2.
        context: { ident: 2 },
        disp: {},
        // options.c initoptions_init() (7207) starts flags.pickup_burden at
        // MOD_ENCUMBER, which is what an rc file that never names the option
        // leaves behind; invent.c:1261-1264 reads it on every hold.
        flags: { invlet_constant: true, pickup_burden: MOD_ENCUMBER },
        iflags: {},
        program_state: { in_moveloop: 1 },
        moves: 0,
        u: {
            ulevel: 1,
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ blocked: 0, extrinsic: 0, intrinsic: 0 }),
            ),
        },
    };
    objects_globals_init(state);
    // Zero choices initialize the catalog without coupling these tests to RNG.
    init_objects(state, () => 0);
    initializeInventory(state);
    return state;
}

function instance(otyp, state, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        age: 1,
        bknown: true,
        dknown: true,
        known: true,
        oclass: type.oc_class,
        otyp,
        quan: 1,
        corpsenm: NON_PM,
        rknown: true,
        ...overrides,
    });
    if (overrides.owt === undefined)
        obj.owt = weight(obj, { state });
    return obj;
}

test('nxtobj starts after its object and follows the selected source chain',
    () => {
        const head = newObject({ otyp: CORPSE });
        const floorOther = newObject({ otyp: APPLE });
        const floorCorpse = newObject({ otyp: CORPSE });
        const ownerOther = newObject({ otyp: ROCK });
        const ownerCorpse = newObject({ otyp: CORPSE });

        head.nexthere = floorOther;
        floorOther.nexthere = floorCorpse;
        head.nobj = ownerOther;
        ownerOther.nobj = ownerCorpse;

        assert.equal(nxtobj(head, CORPSE, true), floorCorpse);
        assert.equal(nxtobj(head, CORPSE, false), ownerCorpse);
        assert.equal(nxtobj(floorCorpse, CORPSE, true), null);
        assert.equal(nxtobj(ownerCorpse, CORPSE, false), null);
    });

test('addinv assigns stable letters, keeps chain order, and merges stacks', () => {
    const state = initializedState();
    const ration = instance(FOOD_RATION, state, { age: 1, quan: 2 });
    const apple = instance(APPLE, state, { age: 4 });
    assert.equal(addinv(ration, { state }), ration);
    assert.equal(addinv(apple, { state }), apple);
    assert.equal(ration.invlet, 'a');
    assert.equal(apple.invlet, 'b');
    assert.deepEqual(inventoryObjects(state), [ration, apple]);

    // (2 * 1 + 1 * 8) / 3 is non-integral, exercising C integer truncation.
    const moreRations = instance(FOOD_RATION, state, { age: 8, quan: 1 });
    assert.equal(addinv(moreRations, { state }), ration);
    assert.equal(ration.quan, 3);
    assert.equal(ration.age, 3);
    assert.equal(ration.owt, 3 * state.objects[FOOD_RATION].oc_weight);
    assert.equal(moreRations.where, OBJ_DELETED);
    assert.deepEqual(inventoryObjects(state), [ration, apple]);
});

test('a prepared addinv plan is object-specific, state-specific, and one-shot',
    () => {
        const state = initializedState();
        const otherState = initializedState();
        const ration = instance(FOOD_RATION, state);
        const apple = instance(APPLE, state);
        const plan = preflight_addinv(ration, { state });

        assert.throws(
            () => addinv(apple, { state }, plan),
            /prepared plan belongs to another object/u,
        );
        assert.throws(
            () => addinv(ration, { state: otherState }, plan),
            /prepared plan belongs to another state/u,
        );
        assert.equal(state.invent, null);
        assert.equal(otherState.invent, null);

        assert.equal(addinv(ration, { state }, plan), ration);
        assert.throws(
            () => addinv(ration, { state }, plan),
            /prepared plan was already consumed/u,
        );
        assert.deepEqual(inventoryObjects(state), [ration]);
    });

test('addinv sequence projection carries source merge state forward', () => {
    const state = initializedState();
    const first = instance(ARROW, state, {
        age: 10,
        bknown: false,
        dknown: false,
        known: false,
        oerodeproof: true,
        rknown: false,
    });
    const second = instance(ARROW, state, {
        age: 20,
        bknown: true,
        dknown: false,
        known: true,
        oerodeproof: true,
        rknown: true,
    });
    const plans = preflight_addinv_sequence(
        [first, second],
        {
            state,
            hooks: { inventoryComparisonDiscovered: () => {} },
        },
        { observeObjects: true },
    );

    assert.equal(plans[1].projectedResult, plans[0].projectedResult);
    assert.equal(plans[1].projectedResult.quan, 2);
    assert.equal(plans[1].projectedResult.age, 15);
    assert.equal(plans[1].projectedResult.known, true);
    assert.equal(plans[1].projectedResult.rknown, true);
    assert.equal(plans[1].projectedResult.bknown, true);
    assert.equal(plans[1].projectedResult.pickup_prev, true);
    assert.equal(first.where, OBJ_FREE);
    assert.equal(first.dknown, false);
    assert.equal(first.known, false);
    assert.equal(state.invent, null);
});

test('addinv sequence projection preserves the lit-merge age exception', () => {
    const state = initializedState();
    const first = instance(ARROW, state, { age: 10, lamplit: true });
    const second = instance(ARROW, state, { age: 20, lamplit: true });
    const plans = preflight_addinv_sequence(
        [first, second],
        { state, hooks: { mergeLightSources: () => {} } },
        { observeObjects: true },
    );

    assert.equal(plans[1].projectedResult, plans[0].projectedResult);
    assert.equal(plans[1].projectedResult.age, 10);
});

test('addinv sequence projection clears a tracked prize nomerge flag', () => {
    const state = initializedState();
    const prize = instance(LUCKSTONE, state, { nomerge: true, o_id: 101 });
    const ordinary = instance(LUCKSTONE, state, { o_id: 102 });
    state.context.achieveo = {
        mines_prize_oid: prize.o_id,
        soko_prize_oid: 0,
    };
    const plans = preflight_addinv_sequence(
        [prize, ordinary],
        {
            state,
            hooks: {
                recordAchievement: () => {},
            },
        },
        { observeObjects: true },
    );

    assert.equal(plans[1].projectedResult, plans[0].projectedResult);
    assert.equal(plans[1].projectedResult.nomerge, false);
    assert.equal(plans[1].projectedResult.quan, 2);
    assert.equal(prize.nomerge, true);
});

test('addinv sequence projection keeps default and flexible insertion distinct',
    () => {
        const fixedState = initializedState();
        const existing = instance(APPLE, fixedState);
        addinv(existing, { state: fixedState });
        existing.invlet = 'q';
        delete fixedState.flags.invlet_constant;
        const incoming = instance(OIL_LAMP, fixedState);
        const [fixedPlan] = preflight_addinv_sequence(
            [incoming],
            { state: fixedState },
            { observeObjects: true },
        );
        assert.equal(fixedPlan.projectedResult.nobj.otyp, APPLE);
        assert.equal(fixedPlan.projectedResult.nobj.invlet, 'q');

        const flexibleState = initializedState();
        flexibleState.flags.invlet_constant = false;
        const flexible = instance(OIL_LAMP, flexibleState);
        const [flexiblePlan] = preflight_addinv_sequence(
            [flexible],
            { state: flexibleState },
            { observeObjects: true },
        );
        assert.equal(flexiblePlan.projectedResult.where, OBJ_INVENT);
        assert.equal(flexiblePlan.projectedResult.invlet, 'a');
        assert.equal(flexiblePlan.projectedResult.nobj, null);
    });

test('addinv sequence projection does not observe through Hallucination', () => {
    const state = initializedState();
    state.u.uprops[HALLUC].intrinsic = 1;
    const arrow = instance(ARROW, state, { dknown: false });
    const [plan] = preflight_addinv_sequence(
        [arrow],
        { state },
        { observeObjects: true },
    );
    assert.equal(plan.projectedResult.dknown, false);
    assert.equal(arrow.dknown, false);
});

test('addinv sequence projection preserves quiver merge preference', () => {
    const state = initializedState();
    const first = instance(ARROW, state);
    const quivered = instance(ARROW, state);
    first.where = OBJ_INVENT;
    quivered.where = OBJ_INVENT;
    first.nobj = quivered;
    state.invent = first;
    state.uquiver = quivered;
    const incoming = instance(ARROW, state);

    const [plan] = preflight_addinv_sequence(
        [incoming],
        { state },
        { observeObjects: true },
    );
    assert.notEqual(plan.projectedResult, quivered);
    assert.equal(plan.projectedResult.o_id, quivered.o_id);
    assert.equal(plan.projectedResult.quan, 2);
    assert.equal(first.quan, 1);
    assert.equal(quivered.quan, 1);
});

test('coins always merge and use the dedicated inventory symbol', () => {
    const state = initializedState();
    const first = instance(GOLD_PIECE, state, { quan: 60, cursed: true });
    const second = instance(GOLD_PIECE, state, { quan: 40, blessed: true });
    addinv(first, { state });
    assert.equal(first.invlet, '$');
    let comparisonMessages = 0;
    assert.equal(addinv(second, {
        state,
        hooks: {
            inventoryComparisonDiscovered: () => { ++comparisonMessages; },
        },
    }), first);
    assert.equal(first.quan, 100);
    assert.equal(first.owt, 1);
    assert.equal(money_cnt(state.invent), 100);
    assert.equal(state.disp.botl, true);
    assert.equal(comparisonMessages, 1);
});

test('add_to_container owns the cobj chain and extraction updates weight', () => {
    const state = initializedState();
    const sack = instance(SACK, state);
    const ration = instance(FOOD_RATION, state, { quan: 2 });
    const apple = instance(APPLE, state);
    addinv(sack, { state });

    add_to_container(sack, ration, { state });
    add_to_container(sack, apple, { state });
    assert.equal(sack.cobj, apple);
    assert.equal(apple.nobj, ration);
    assert.equal(apple.ocontainer, sack);

    obj_extract_self(apple, { state });
    assert.equal(apple.where, OBJ_FREE);
    assert.equal(apple.ocontainer, null);
    assert.equal(sack.cobj, ration);
    assert.equal(
        sack.owt,
        state.objects[SACK].oc_weight + ration.owt,
    );
});

test('stackobj preserves the newly placed floor object as merge target', () => {
    const state = initializedState();
    state.level = new GameMap();
    const older = instance(APPLE, state, { quan: 2 });
    const newer = instance(APPLE, state, { quan: 3 });
    place_object(older, 10, 5, { state });
    place_object(newer, 10, 5, { state });

    assert.equal(stackobj(newer, {
        state,
        hooks: {
            extractExternalObject(obj) {
                remove_object(obj, { state });
            },
        },
    }), newer);

    assert.equal(state.level.objects[10][5], newer);
    assert.equal(state.level.objlist, newer);
    assert.equal(newer.quan, 5);
    assert.equal(older.where, OBJ_DELETED);
});

test('stackobj transfers live merge state before deleting the older pile', () => {
    const state = initializedState();
    state.level = new GameMap();
    // Age 100 puts both candles in the same 25-turn merge bucket; quantities
    // two and three make survivor identity and combined weight observable.
    const older = instance(TALLOW_CANDLE, state, {
        age: 100,
        lamplit: true,
        quan: 2,
        timed: 1,
    });
    const newer = instance(TALLOW_CANDLE, state, {
        age: 100,
        lamplit: true,
        quan: 3,
        timed: 1,
    });
    place_object(older, 10, 5, { state });
    place_object(newer, 10, 5, { state });
    const events = [];

    assert.equal(stackobj(newer, {
        state,
        hooks: {
            extractExternalObject(obj) {
                events.push(['extract', obj]);
                assert.equal(newer.quan, 5);
                assert.equal(state.level.objects[10][5], newer);
                assert.equal(state.level.objlist, newer);
                assert.equal(newer.nobj, older);
                assert.equal(newer.nexthere, older);
                remove_object(obj, { state });
            },
            mergeLightSources(obj, target) {
                events.push(['light', obj, target]);
                assert.equal(obj.where, OBJ_FREE);
                assert.equal(obj.nobj, null);
                assert.equal(obj.nexthere, null);
                assert.equal(obj.lamplit, true);
                assert.equal(obj.timed, 1);
                assert.equal(target.where, OBJ_FLOOR);
                assert.equal(target.lamplit, true);
                assert.equal(target.timed, 1);
            },
            stopObjectTimers(obj) {
                events.push(['timers', obj]);
                assert.equal(obj.lamplit, false);
                obj.timed = 0;
            },
        },
    }), newer);

    assert.deepEqual(events, [
        ['extract', older],
        ['light', older, newer],
        ['timers', older],
    ]);
    assert.equal(state.level.objects[10][5], newer);
    assert.equal(state.level.objlist, newer);
    assert.equal(newer.quan, 5);
    assert.equal(newer.owt, weight(newer, { state }));
    assert.equal(newer.lamplit, true);
    assert.equal(newer.timed, 1);
    assert.equal(newer.nobj, null);
    assert.equal(newer.nexthere, null);
    assert.equal(older.where, OBJ_DELETED);
    assert.equal(older.lamplit, false);
    assert.equal(older.timed, 0);
    assert.equal(older.nobj, null);
    assert.equal(older.nexthere, null);
});

test('delete_contents extracts and frees each child before returning', () => {
    const state = initializedState();
    const sack = instance(SACK, state);
    const ration = instance(FOOD_RATION, state, { quan: 2 });
    const apple = instance(APPLE, state);
    addinv(sack, { state });
    add_to_container(sack, ration, { state });
    add_to_container(sack, apple, { state });

    assert.equal(delete_contents(sack, { state }), sack);

    assert.equal(sack.cobj, null);
    assert.equal(sack.owt, state.objects[SACK].oc_weight);
    assert.equal(ration.where, OBJ_DELETED);
    assert.equal(apple.where, OBJ_DELETED);
});

test('delete_contents preflights every sibling before changing ownership', () => {
    const state = initializedState();
    const sack = instance(SACK, state);
    const candle = instance(TALLOW_CANDLE, state, { lamplit: true });
    const apple = instance(APPLE, state);
    addinv(sack, { state });
    add_to_container(sack, candle, { state });
    add_to_container(sack, apple, { state });
    sack.owt = weight(sack, { state });
    const originalWeight = sack.owt;

    assert.throws(
        () => delete_contents(sack, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'deleteObjectLightSource',
    );

    assert.equal(sack.cobj, apple);
    assert.equal(apple.nobj, candle);
    assert.equal(apple.where, OBJ_CONTAINED);
    assert.equal(candle.where, OBJ_CONTAINED);
    assert.equal(apple.ocontainer, sack);
    assert.equal(candle.ocontainer, sack);
    assert.equal(candle.lamplit, true);
    assert.equal(sack.owt, originalWeight);
});

test('delete_contents preflights the whole nested graph before mutation', () => {
    const state = initializedState();
    const outer = instance(SACK, state);
    const inner = instance(BAG_OF_HOLDING, state);
    const candle = instance(TALLOW_CANDLE, state, { lamplit: true });
    const apple = instance(APPLE, state);
    addinv(outer, { state });
    add_to_container(outer, inner, { state });
    add_to_container(inner, candle, {
        state,
        hooks: { objectNoLongerHeld() {} },
    });
    add_to_container(outer, apple, { state });
    inner.owt = weight(inner, { state });
    outer.owt = weight(outer, { state });
    const originalInnerWeight = inner.owt;
    const originalOuterWeight = outer.owt;

    assert.throws(
        () => delete_contents(outer, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'deleteObjectLightSource',
    );

    assert.equal(outer.cobj, apple);
    assert.equal(apple.nobj, inner);
    assert.equal(inner.cobj, candle);
    assert.equal(apple.where, OBJ_CONTAINED);
    assert.equal(inner.where, OBJ_CONTAINED);
    assert.equal(candle.where, OBJ_CONTAINED);
    assert.equal(apple.ocontainer, outer);
    assert.equal(inner.ocontainer, outer);
    assert.equal(candle.ocontainer, inner);
    assert.equal(candle.lamplit, true);
    assert.equal(inner.owt, originalInnerWeight);
    assert.equal(outer.owt, originalOuterWeight);
});

test('delete_contents recursively stops timers and removes object lights', () => {
    const state = initializedState();
    const outer = instance(SACK, state);
    const inner = instance(BAG_OF_HOLDING, state);
    const candle = instance(TALLOW_CANDLE, state, { lamplit: true });
    const egg = instance(EGG, state, {
        // Any real species works here; the timer lifecycle is under test.
        corpsenm: TEST_SPECIES,
        timed: 1,
    });
    addinv(outer, { state });
    add_to_container(outer, inner, { state });
    add_to_container(inner, candle, {
        state,
        hooks: { objectNoLongerHeld() {} },
    });
    add_to_container(inner, egg, {
        state,
        hooks: { objectNoLongerHeld() {} },
    });
    inner.owt = weight(inner, { state });
    outer.owt = weight(outer, { state });
    const events = [];

    delete_contents(outer, {
        state,
        hooks: {
            stopObjectTimers(obj) {
                events.push(['timers', obj]);
                assert.equal(obj.where, OBJ_FREE);
                assert.equal(obj.nobj, null);
                assert.equal(obj.ocontainer, null);
                obj.timed = 0;
            },
            deleteObjectLightSource(obj) {
                events.push(['light', obj]);
                assert.equal(obj.where, OBJ_FREE);
                assert.equal(obj.nobj, null);
                assert.equal(obj.ocontainer, null);
            },
        },
    });

    assert.deepEqual(events, [
        ['timers', egg],
        ['light', candle],
    ]);
    assert.equal(outer.cobj, null);
    assert.equal(outer.owt, state.objects[SACK].oc_weight);
    assert.equal(inner.cobj, null);
    assert.equal(inner.where, OBJ_DELETED);
    assert.equal(egg.where, OBJ_DELETED);
    assert.equal(candle.where, OBJ_DELETED);
    assert.equal(egg.timed, 0);
    assert.equal(candle.lamplit, false);
    assert.equal(inner.nobj, null);
    assert.equal(egg.nobj, null);
    assert.equal(candle.nobj, null);
    assert.equal(inner.ocontainer, null);
    assert.equal(egg.ocontainer, null);
    assert.equal(candle.ocontainer, null);
});

test('add_to_buried owns a LIFO chain without changing coordinates', () => {
    const state = initializedState();
    state.level = { buriedobjlist: null };
    // Distinct interior coordinates prove that ownership does not relocate
    // either object; grave generation assigns these before burial.
    const first = instance(APPLE, state, { ox: 17, oy: 6 });
    const second = instance(FOOD_RATION, state, { ox: 31, oy: 12 });

    assert.equal(add_to_buried(first, { state }), first);
    assert.equal(add_to_buried(second, { state }), second);

    assert.equal(state.level.buriedobjlist, second);
    assert.equal(second.nobj, first);
    assert.equal(first.nobj, null);
    assert.equal(first.where, OBJ_BURIED);
    assert.equal(second.where, OBJ_BURIED);
    assert.deepEqual([first.ox, first.oy], [17, 6]);
    assert.deepEqual([second.ox, second.oy], [31, 12]);
});

test('obj_extract_self directly unlinks buried objects', () => {
    const state = initializedState();
    state.level = { buriedobjlist: null };
    const first = instance(APPLE, state, { ox: 17, oy: 6 });
    const second = instance(FOOD_RATION, state, { ox: 31, oy: 12 });
    add_to_buried(first, { state });
    add_to_buried(second, { state });
    const hooks = {
        extractExternalObject() {
            assert.fail('buried ownership no longer uses the external seam');
        },
    };

    assert.equal(obj_extract_self(first, { state, hooks }), first);
    assert.equal(first.where, OBJ_FREE);
    assert.equal(first.nobj, null);
    assert.deepEqual([first.ox, first.oy], [17, 6]);
    assert.equal(state.level.buriedobjlist, second);
    assert.equal(second.nobj, null);

    assert.equal(obj_extract_self(second, { state, hooks }), second);
    assert.equal(second.where, OBJ_FREE);
    assert.equal(state.level.buriedobjlist, null);
});

test('buried ownership failures leave both chains unchanged', () => {
    const state = initializedState();
    state.level = { buriedobjlist: null };
    const buried = instance(APPLE, state, { ox: 17, oy: 6 });
    add_to_buried(buried, { state });

    const linkedFree = instance(FOOD_RATION, state, { nobj: {} });
    assert.throws(
        () => add_to_buried(linkedFree, { state }),
        /free object retains a chain link/,
    );
    assert.equal(linkedFree.where, OBJ_FREE);
    assert.notEqual(linkedFree.nobj, null);
    assert.equal(state.level.buriedobjlist, buried);

    const lost = instance(FOOD_RATION, state, {
        where: OBJ_BURIED,
        ox: 31,
        oy: 12,
    });
    assert.throws(
        () => obj_extract_self(lost, { state }),
        /is not on the level chain/,
    );
    assert.equal(lost.where, OBJ_BURIED);
    assert.equal(state.level.buriedobjlist, buried);

    buried.nobj = buried;
    assert.throws(
        () => obj_extract_self(buried, { state }),
        /buried object chain is corrupt/,
    );
    assert.equal(buried.where, OBJ_BURIED);
    assert.equal(buried.nobj, buried);
    assert.equal(state.level.buriedobjlist, buried);
});

test('timed eggs never merge', () => {
    const state = initializedState();
    const first = instance(EGG, state, {
        corpsenm: TEST_SPECIES,
        timed: 1,
    });
    const second = instance(EGG, state, {
        corpsenm: TEST_SPECIES,
        timed: 0,
    });
    assert.equal(mergable(first, second, { state }), false);
});

test('corpse reviver decisions require the monster predicate seam', () => {
    const state = initializedState();
    const first = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    const second = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    assert.throws(
        () => mergable(first, second, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'isReviver',
    );
    assert.equal(mergable(first, second, {
        state,
        hooks: { isReviver: () => false },
    }), true);
});

test('merge visibility uses canonical Blind and Hallucination properties', () => {
    const state = initializedState();
    const first = instance(APPLE, state, { bknown: true });
    const second = instance(APPLE, state, { bknown: false });
    assert.equal(mergable(first, second, { state }), true);

    state.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(mergable(first, second, { state }), false);
    state.u.uprops[BLINDED].blocked = 1;
    assert.equal(mergable(first, second, { state }), true);

    state.u.uprops[BLINDED].intrinsic = 0;
    state.u.uprops[BLINDED].blocked = 0;
    state.u.uprops[HALLUC].intrinsic = 1;
    assert.equal(mergable(first, second, { state }), false);
    state.u.uprops[HALLUC_RES].intrinsic = 1;
    assert.equal(mergable(first, second, { state }), true);
});

test('external object extraction uses the floor integration seam', () => {
    const state = initializedState();
    const staleFloorLink = {};
    const floorObject = instance(APPLE, state, {
        nexthere: staleFloorLink,
        where: OBJ_FLOOR,
    });
    let extracted = false;
    obj_extract_self(floorObject, {
        state,
        hooks: {
            extractExternalObject(obj) {
                extracted = true;
                obj.where = OBJ_FREE;
                obj.nobj = null;
                obj.nexthere = null;
            },
        },
    });
    assert.equal(extracted, true);
    assert.equal(floorObject.where, OBJ_FREE);
    assert.equal(floorObject.nexthere, null);
});

test('external extraction must unlink both owning chains', () => {
    const state = initializedState();
    const floorObject = instance(APPLE, state, {
        nexthere: {},
        nobj: {},
        where: OBJ_FLOOR,
    });
    assert.throws(
        () => obj_extract_self(floorObject, {
            state,
            hooks: {
                extractExternalObject(obj) {
                    obj.where = OBJ_FREE;
                },
            },
        }),
        /must clear object chain links/,
    );
});

test('external merge seams are checked before stack mutation', () => {
    const state = initializedState();
    const target = instance(APPLE, state, {
        quan: 1,
        where: OBJ_FLOOR,
    });
    const incoming = instance(APPLE, state, {
        nexthere: {},
        nobj: {},
        quan: 1,
        where: OBJ_FLOOR,
    });
    assert.throws(
        () => merged(target, incoming, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'extractExternalObject',
    );
    assert.equal(target.quan, 1);
    assert.equal(incoming.where, OBJ_FLOOR);

    assert.equal(merged(target, incoming, {
        state,
        hooks: {
            extractExternalObject(obj) {
                obj.nobj = null;
                obj.nexthere = null;
                obj.where = OBJ_FREE;
            },
        },
    }), true);
    assert.equal(target.quan, 2);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('contained merges preflight the outer container weight chain', () => {
    const state = initializedState();
    const sack = instance(SACK, state);
    const corpse = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    const incoming = instance(APPLE, state);
    const target = instance(APPLE, state);
    addinv(sack, { state });
    add_to_container(sack, corpse, { state });
    add_to_container(sack, incoming, { state });

    assert.throws(
        () => merged(target, incoming, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'monster weight lookup',
    );
    assert.equal(target.quan, 1);
    assert.equal(incoming.where, OBJ_CONTAINED);

    const corpseWeight = 100; // enables the sibling corpse weight calculation
    assert.equal(merged(target, incoming, {
        state,
        hooks: { monster: () => ({ cwt: corpseWeight }) },
    }), true);
    assert.equal(target.quan, 2);
    assert.equal(incoming.where, OBJ_DELETED);
    assert.equal(sack.cobj, corpse);
});

test('direct contained extraction preflights only post-removal weight', () => {
    const singleState = initializedState();
    const singleSack = instance(SACK, singleState);
    const departingCorpse = instance(CORPSE, singleState, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    addinv(singleSack, { state: singleState });
    add_to_container(singleSack, departingCorpse, { state: singleState });
    // The removed corpse's unavailable monster weight is irrelevant once the
    // sack is empty, so extraction must not require that seam.
    obj_extract_self(departingCorpse, { state: singleState });
    assert.equal(departingCorpse.where, OBJ_FREE);
    assert.equal(singleSack.cobj, null);

    const siblingState = initializedState();
    const siblingSack = instance(SACK, siblingState);
    const siblingCorpse = instance(CORPSE, siblingState, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    const departingApple = instance(APPLE, siblingState);
    addinv(siblingSack, { state: siblingState });
    add_to_container(siblingSack, siblingCorpse, { state: siblingState });
    add_to_container(siblingSack, departingApple, { state: siblingState });
    assert.throws(
        () => obj_extract_self(departingApple, { state: siblingState }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'monster weight lookup',
    );
    assert.equal(departingApple.where, OBJ_CONTAINED);
    assert.equal(siblingSack.cobj, departingApple);
});

test('the object location names share the C union backing slot', () => {
    const firstOwner = {};
    const secondOwner = {};
    const obj = newObject({ nexthere: firstOwner });
    assert.equal(obj.ocontainer, firstOwner);
    obj.ocarry = secondOwner;
    assert.equal(obj.nexthere, secondOwner);
    assert.equal(obj.ocontainer, secondOwner);
});

test('non-carried container insertion calls obj_no_longer_held before linking', () => {
    const state = initializedState();
    const floorSack = instance(SACK, state, { where: OBJ_FLOOR });
    const apple = instance(APPLE, state);
    assert.throws(
        () => add_to_container(floorSack, apple, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'objectNoLongerHeld',
    );
    assert.equal(apple.where, OBJ_FREE);

    let observedWhere;
    add_to_container(floorSack, apple, {
        state,
        hooks: {
            objectNoLongerHeld(obj) {
                observedWhere = obj.where;
            },
        },
    });
    assert.equal(observedWhere, OBJ_FREE);
    assert.equal(apple.ocontainer, floorSack);
});

test('merge preserves the source o_id price adjustment', () => {
    const state = initializedState();
    // Multiples of four receive the source's one-zorkmid price adjustment.
    const ordinaryPriceId = 3;
    const adjustedPriceId = 4;
    const target = instance(APPLE, state, {
        dknown: false,
        o_id: ordinaryPriceId,
    });
    const incoming = instance(APPLE, state, {
        dknown: false,
        o_id: adjustedPriceId,
    });
    addinv(target, { state });
    assert.equal(addinv(incoming, { state }), target);
    assert.equal(target.o_id, adjustedPriceId);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('comparison-message seams are checked before a merge mutates stacks', () => {
    const state = initializedState();
    const target = instance(APPLE, state, { known: false, quan: 1 });
    const incoming = instance(APPLE, state, { known: true, quan: 1 });
    addinv(target, { state });
    assert.throws(
        () => addinv(incoming, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'inventoryComparisonDiscovered',
    );
    assert.equal(target.quan, 1);
    assert.equal(target.known, false);
    assert.equal(incoming.where, OBJ_FREE);

    let messages = 0;
    addinv(incoming, {
        state,
        hooks: {
            inventoryComparisonDiscovered: () => { ++messages; },
        },
    });
    assert.equal(target.quan, 2);
    assert.equal(target.known, true);
    assert.equal(messages, 1);
});

test('runtime comparison messages pause before object deletion and addinv tail', async () => {
    const state = initializedState();
    const target = instance(APPLE, state, {
        dknown: false,
        known: false,
        o_id: 3,
        quan: 1,
    });
    const incoming = instance(APPLE, state, {
        dknown: false,
        known: true,
        o_id: 4,
        quan: 1,
    });
    addinv(target, { state });
    target.pickup_prev = false;
    state.iflags.perm_invent = true;

    let releaseMessage;
    const messageGate = new Promise((resolve) => {
        releaseMessage = resolve;
    });
    let comparisonCalls = 0;
    let inventoryRefreshes = 0;
    let settled = false;
    const pending = addinv_runtime(incoming, {
        state,
        hooks: {
            inventoryComparisonDiscovered() {
                ++comparisonCalls;
                return messageGate;
            },
            updateInventory() {
                ++inventoryRefreshes;
            },
        },
    }).then((result) => {
        settled = true;
        return result;
    });

    await Promise.resolve();
    assert.equal(comparisonCalls, 1);
    assert.equal(settled, false);
    assert.equal(target.quan, 2);
    assert.equal(target.known, true);
    assert.equal(target.o_id, 3);
    assert.equal(incoming.where, OBJ_FREE);
    assert.equal(target.pickup_prev, false);
    assert.equal(inventoryRefreshes, 0);

    releaseMessage();
    assert.equal(await pending, target);
    assert.equal(incoming.where, OBJ_DELETED);
    assert.equal(target.o_id, 4);
    assert.equal(target.pickup_prev, true);
    assert.equal(inventoryRefreshes, 1);
});

test('runtime addinv keeps nonblocking source branches synchronous', async () => {
    const mergeState = initializedState();
    const target = instance(APPLE, mergeState);
    const incoming = instance(APPLE, mergeState);
    addinv(target, { state: mergeState });
    target.pickup_prev = false;
    const mergeResult = addinv_runtime(incoming, { state: mergeState });
    assert.equal(incoming.where, OBJ_DELETED);
    assert.equal(target.pickup_prev, true);
    assert.equal(await mergeResult, target);

    const quiverState = initializedState();
    const quivered = instance(DART, quiverState);
    const extraDart = instance(DART, quiverState);
    addinv(quivered, { state: quiverState });
    quiverState.uquiver = quivered;
    quivered.owornmask = W_QUIVER;
    quivered.pickup_prev = false;
    const quiverResult = addinv_runtime(extraDart, { state: quiverState });
    assert.equal(extraDart.where, OBJ_DELETED);
    assert.equal(quivered.pickup_prev, true);
    assert.equal(await quiverResult, quivered);

    const thrownState = initializedState();
    thrownState.flags.pickup_thrown = true;
    const thrown = instance(DART, thrownState, { how_lost: LOST_THROWN });
    const thrownResult = addinv_runtime(thrown, { state: thrownState });
    assert.equal(thrownState.uquiver, thrown);
    assert.equal(thrown.owornmask, W_QUIVER);
    assert.equal(await thrownResult, thrown);

    const defaultLettersState = initializedState();
    const ration = instance(FOOD_RATION, defaultLettersState, { invlet: 'b' });
    const apple = instance(APPLE, defaultLettersState, { invlet: 'a' });
    addinv(ration, { state: defaultLettersState });
    delete defaultLettersState.flags.invlet_constant;
    assert.equal(
        await addinv_runtime(apple, { state: defaultLettersState }),
        apple,
    );
    assert.equal(defaultLettersState.invent, apple);

    const explodingState = initializedState();
    const exploding = instance(APPLE, explodingState, {
        how_lost: LOST_EXPLODING,
    });
    assert.equal(
        await addinv_runtime(exploding, { state: explodingState }),
        null,
    );
    assert.equal(exploding.where, OBJ_FREE);
    assert.equal(explodingState.invent, null);
});

test('corpse weight dependencies are checked before merge mutation', () => {
    const state = initializedState();
    const target = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    const incoming = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    addinv(target, { state });
    assert.throws(
        () => addinv(incoming, {
            state,
            hooks: { isReviver: () => false },
        }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'monster weight lookup',
    );
    assert.equal(target.quan, 1);
    assert.equal(incoming.where, OBJ_FREE);

    const corpseWeight = 100; // representative nonzero monster corpse weight
    addinv(incoming, {
        state,
        hooks: {
            isReviver: () => false,
            monster: () => ({ cwt: corpseWeight }),
        },
    });
    assert.equal(target.quan, 2);
    assert.equal(target.owt, 2 * corpseWeight);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('glob absorption must own the absorbed object lifecycle', () => {
    const state = initializedState();
    const firstWeight = 100; // distinct weights make successful absorption visible
    const secondWeight = 50;
    const target = instance(GLOB_OF_GRAY_OOZE, state, {
        globby: true,
        owt: firstWeight,
    });
    const incoming = instance(GLOB_OF_GRAY_OOZE, state, {
        globby: true,
        owt: secondWeight,
    });

    assert.throws(
        () => merged(target, incoming, {
            state,
            hooks: { absorbGlob: () => {} },
        }),
        /must deallocate the absorbed object/,
    );
    assert.equal(incoming.where, OBJ_FREE);

    assert.equal(merged(target, incoming, {
        state,
        hooks: {
            absorbGlob(survivor, absorbed) {
                survivor.owt += absorbed.owt;
                absorbed.where = OBJ_DELETED;
            },
        },
    }), true);
    assert.equal(target.owt, firstWeight + secondWeight);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('glob absorption bypasses comparison and generic shop-free seams', () => {
    const state = initializedState();
    const target = instance(GLOB_OF_GRAY_OOZE, state, {
        bknown: false,
        globby: true,
        known: false,
        rknown: false,
    });
    const incoming = instance(GLOB_OF_GRAY_OOZE, state, {
        globby: true,
        unpaid: true,
    });
    addinv(target, { state });

    assert.equal(merged(target, incoming, {
        state,
        hooks: {
            absorbGlob(survivor, absorbed) {
                survivor.owt += absorbed.owt;
                absorbed.where = OBJ_DELETED;
            },
        },
    }), true);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('worn and timed merges require their canonical cleanup seams', () => {
    const wornState = initializedState();
    const target = instance(DART, wornState, { quan: 2 });
    const incoming = instance(DART, wornState, {
        owornmask: W_WEP,
        quan: 1,
    });
    addinv(target, { state: wornState });
    assert.throws(
        () => addinv(incoming, { state: wornState }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'mergeWornMasks',
    );
    assert.equal(target.quan, 2);
    assert.equal(incoming.where, OBJ_FREE);

    addinv(incoming, {
        state: wornState,
        hooks: {
            mergeWornMasks(survivor, absorbed) {
                survivor.owornmask = W_WEP;
                absorbed.owornmask = 0;
            },
        },
    });
    assert.equal(target.quan, 3);
    assert.equal(target.owornmask, W_WEP);
    assert.equal(incoming.where, OBJ_DELETED);

    const timedState = initializedState();
    const firstRation = instance(FOOD_RATION, timedState);
    const timedRation = instance(FOOD_RATION, timedState, { timed: 1 });
    addinv(firstRation, { state: timedState });
    assert.throws(
        () => addinv(timedRation, { state: timedState }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'stopObjectTimers',
    );
    let stoppedWhere;
    addinv(timedRation, {
        state: timedState,
        hooks: {
            stopObjectTimers(obj) {
                stoppedWhere = obj.where;
                obj.timed = 0;
            },
        },
    });
    assert.equal(stoppedWhere, OBJ_FREE);
    assert.equal(timedRation.where, OBJ_DELETED);
});

test('inventory reset stops timers on top-level and nested objects', () => {
    const state = initializedState();
    // Distinct IDs make nested-before-top-level cleanup order observable.
    const nestedTimerId = 11;
    const carriedTimerId = 12;
    const sack = instance(SACK, state);
    const nestedEgg = instance(EGG, state, {
        corpsenm: TEST_SPECIES,
        o_id: nestedTimerId,
        timed: 1,
    });
    const carriedEgg = instance(EGG, state, {
        corpsenm: TEST_SPECIES,
        o_id: carriedTimerId,
        timed: 1,
    });
    addinv(sack, { state });
    add_to_container(sack, nestedEgg, { state });
    addinv(carriedEgg, { state });

    const stopped = [];
    resetInventory({
        state,
        hooks: {
            stopObjectTimers(obj) {
                stopped.push([obj.o_id, obj.where, state.lastinvnr]);
                obj.timed = 0;
            },
        },
    });
    assert.deepEqual(stopped, [
        [nestedTimerId, OBJ_FREE, INVLET_BASIC - 1],
        [carriedTimerId, OBJ_FREE, INVLET_BASIC - 1],
    ]);
    assert.equal(sack.where, OBJ_DELETED);
    assert.equal(nestedEgg.where, OBJ_DELETED);
    assert.equal(carriedEgg.where, OBJ_DELETED);
});

test('timed reset fails before unlinking when cleanup is unavailable', () => {
    const state = initializedState();
    const ration = instance(FOOD_RATION, state);
    const egg = instance(EGG, state, {
        corpsenm: TEST_SPECIES,
        timed: 1,
    });
    addinv(ration, { state });
    addinv(egg, { state });
    assert.throws(
        () => resetInventory({ state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'stopObjectTimers',
    );
    assert.deepEqual(inventoryObjects(state), [ration, egg]);
    assert.equal(ration.where, OBJ_INVENT);
    assert.equal(egg.where, OBJ_INVENT);
});

test('fresh inventory initialization refuses to orphan an existing chain', () => {
    const state = initializedState();
    const ration = instance(FOOD_RATION, state);
    addinv(ration, { state });
    assert.throws(
        () => initializeInventory(state),
        /requires an empty inventory/,
    );
    assert.equal(state.invent, ration);
});

test('non-fixed letters append and letter exhaustion uses #', () => {
    const state = initializedState();
    state.flags.invlet_constant = false;
    const ration = instance(FOOD_RATION, state);
    const sack = instance(SACK, state);
    addinv(ration, { state });
    addinv(sack, { state });
    assert.deepEqual(inventoryObjects(state), [ration, sack]);

    const occupied = initializedState();
    const lowercaseA = 'a'.charCodeAt(0);
    const uppercaseA = 'A'.charCodeAt(0);
    for (let index = INVLET_BASIC - 1; index >= 0; --index) {
        const invlet = index < LETTERS_PER_CASE
            ? String.fromCharCode(lowercaseA + index)
            : String.fromCharCode(
                uppercaseA + index - LETTERS_PER_CASE,
            );
        occupied.invent = newObject({
            invlet,
            nobj: occupied.invent,
            where: OBJ_INVENT,
        });
    }
    const overflow = newObject();
    assigninvlet(overflow, occupied);
    assert.equal(overflow.invlet, '#');
});

test('ordinary merges do not require hero perception state', () => {
    const state = initializedState();
    delete state.u.uprops;
    const first = instance(FOOD_RATION, state);
    const second = instance(FOOD_RATION, state);
    addinv(first, { state });
    assert.equal(addinv(second, { state }), first);
    assert.equal(first.quan, 2);
});

test('Mines prize records its achievement and merges after pickup', () => {
    const state = initializedState();
    // Prize tracking uses nonzero object identities. Distinct carried and
    // prize IDs prove that pickup merges compatible stacks, not identities.
    const carriedId = 701;
    const prizeId = 702;
    const carried = instance(LUCKSTONE, state, { o_id: carriedId });
    addinv(carried, { state });

    state.context.achieveo = {
        mines_prize_oid: prizeId,
        soko_prize_oid: 0,
    };
    const prize = instance(LUCKSTONE, state, {
        nomerge: true,
        o_id: prizeId,
    });
    const achievements = [];
    const result = addinv(prize, {
        state,
        hooks: {
            recordAchievement(achievement) {
                assert.equal(state.context.achieveo.mines_prize_oid, prizeId);
                assert.equal(prize.nomerge, true);
                achievements.push(achievement);
            },
        },
    });

    assert.equal(result, carried);
    assert.equal(carried.quan, 2);
    assert.equal(prize.where, OBJ_DELETED);
    assert.deepEqual(achievements, [ACH_MINE_PRIZE]);
    assert.equal(state.context.achieveo.mines_prize_oid, 0);
});

test('Sokoban prize clears tracking and its temporary nomerge flag', () => {
    const state = initializedState();
    // Any nonzero ID marks an active tracked prize; zero is the inactive
    // sentinel used for the other branch.
    const prizeId = 801;
    state.context.achieveo = {
        mines_prize_oid: 0,
        soko_prize_oid: prizeId,
    };
    const prize = instance(BAG_OF_HOLDING, state, {
        nomerge: true,
        o_id: prizeId,
    });
    const achievements = [];

    assert.equal(addinv(prize, {
        state,
        hooks: {
            recordAchievement: (achievement) => achievements.push(achievement),
        },
    }), prize);
    assert.deepEqual(achievements, [ACH_SOKO_PRIZE]);
    assert.equal(state.context.achieveo.soko_prize_oid, 0);
    assert.equal(prize.nomerge, false);
    assert.equal(prize.where, OBJ_INVENT);
});

test('special-prize achievement seam is checked before addinv mutation', () => {
    const state = initializedState();
    // A nonzero ID activates the prize path whose missing seam must fail.
    const prizeId = 901;
    state.context.achieveo = {
        mines_prize_oid: 0,
        soko_prize_oid: prizeId,
    };
    const prize = instance(BAG_OF_HOLDING, state, {
        how_lost: LOST_THROWN,
        no_charge: true,
        nomerge: true,
        o_id: prizeId,
    });

    assert.throws(
        () => addinv(prize, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'recordAchievement',
    );
    assert.equal(state.invent, null);
    assert.equal(state.context.achieveo.soko_prize_oid, prizeId);
    assert.equal(prize.how_lost, LOST_THROWN);
    assert.equal(prize.no_charge, true);
    assert.equal(prize.nomerge, true);
    assert.equal(prize.where, OBJ_FREE);
});

test('addinv_nomerge restores its flag when a seam rejects insertion', () => {
    const state = initializedState();
    state.iflags.perm_invent = true;
    const ration = instance(FOOD_RATION, state);
    assert.throws(
        () => addinv_nomerge(ration, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'updateInventory',
    );
    assert.equal(ration.nomerge, false);
    assert.equal(ration.where, OBJ_FREE);
});

test('freeinv recalculates moreluck when removing a luckstone', () => {
    // set_moreluck() is now called directly, so removing an uncursed
    // luckstone resets u.moreluck to 0.
    const state = initializedState();
    const luckstone = instance(LUCKSTONE, state);
    addinv(luckstone, { state });
    // After adding an uncursed luckstone, moreluck should be LUCKADD (3).
    assert.equal(state.u.moreluck, 3);
    freeinv(luckstone, { state });
    // After removing the only luckstone, moreluck returns to 0.
    assert.equal(state.u.moreluck, 0);
    assert.equal(luckstone.where, OBJ_FREE);
});

test('split tracking survives extraction and clears on deallocation', () => {
    const state = initializedState();
    // These two distinct IDs model the parent and child of the latest split.
    const parentId = 17;
    const childId = 18;
    state.context.objsplit = {
        parent_oid: parentId,
        child_oid: childId,
    };
    const apple = instance(APPLE, state, { o_id: parentId });
    addinv(apple, { state });

    freeinv(apple, { state });
    assert.deepEqual(state.context.objsplit, {
        parent_oid: parentId,
        child_oid: childId,
    });

    addinv(apple, { state });
    useupall(apple, { state });
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 0,
        child_oid: 0,
    });
    assert.equal(apple.where, OBJ_DELETED);
});

test('useupall rejects objects outside inventory ownership', () => {
    const state = initializedState();
    const apple = instance(APPLE, state);
    assert.throws(
        () => useupall(apple, { state }),
        /requires an inventory object/,
    );
    assert.equal(apple.where, OBJ_FREE);
});

test('used unpaid objects can transfer to the shop bill chain', () => {
    const state = initializedState();
    const apple = instance(APPLE, state, { unpaid: true });
    addinv(apple, { state });

    let billed = 0;
    useupall(apple, {
        state,
        hooks: {
            obfreeShopBill(obj) {
                ++billed;
                obj.unpaid = false;
                obj.where = OBJ_ONBILL;
                return 'retained';
            },
        },
    });
    assert.equal(billed, 1);
    assert.equal(state.invent, null);
    assert.equal(apple.where, OBJ_ONBILL);
});

test('unbilled unpaid merges still preserve the higher price id', () => {
    const state = initializedState();
    // Multiples of four receive the source's one-zorkmid price adjustment.
    const ordinaryPriceId = 3;
    const adjustedPriceId = 4;
    const target = instance(APPLE, state, {
        dknown: false,
        o_id: ordinaryPriceId,
        unpaid: true,
    });
    const incoming = instance(APPLE, state, {
        dknown: false,
        o_id: adjustedPriceId,
        unpaid: true,
    });
    addinv(target, { state });
    addinv(incoming, {
        state,
        hooks: {
            obfreeShopBill: () => 'unbilled',
            samePrice: () => true,
        },
    });
    assert.equal(target.o_id, adjustedPriceId);
    assert.equal(incoming.where, OBJ_DELETED);
});

test('Lua-referenced objects survive deallocation as OBJ_LUAFREE', () => {
    const state = initializedState();
    const extra = { oname: 'still referenced' };
    const apple = instance(APPLE, state, {
        lua_ref_cnt: 1,
        oextra: extra,
    });
    addinv(apple, { state });
    useupall(apple, { state });
    assert.equal(state.invent, null);
    assert.equal(apple.where, OBJ_LUAFREE);
    assert.equal(apple.oextra, extra);
});

test('thrown pickup autoquivers only a newly inserted eligible object', () => {
    const thrownState = initializedState();
    thrownState.flags.pickup_thrown = true;
    const dart = instance(DART, thrownState, { how_lost: LOST_THROWN });
    addinv(dart, { state: thrownState });
    assert.equal(thrownState.uquiver, dart);
    assert.equal(dart.owornmask, W_QUIVER);

    const mergedState = initializedState();
    mergedState.flags.pickup_thrown = true;
    const target = instance(DART, mergedState, { quan: 2 });
    const incoming = instance(DART, mergedState, {
        how_lost: LOST_THROWN,
        quan: 1,
    });
    addinv(target, { state: mergedState });
    assert.equal(addinv(incoming, { state: mergedState }), target);
    assert.equal(target.quan, 3);
    assert.equal(mergedState.uquiver, undefined);

    const aklysState = initializedState();
    aklysState.flags.pickup_thrown = true;
    const aklys = instance(AKLYS, aklysState, { how_lost: LOST_THROWN });
    addinv(aklys, { state: aklysState });
    assert.equal(aklysState.uquiver, undefined);
});

test('figurine carrying fails closed at its monster predicate seam', () => {
    const figurineState = initializedState();
    const figurine = instance(FIGURINE, figurineState, {
        corpsenm: TEST_SPECIES,
        cursed: true,
    });
    assert.throws(
        () => addinv(figurine, { state: figurineState }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'isDeadSpecies',
    );
    assert.equal(figurine.where, OBJ_FREE);
    addinv(figurine, {
        state: figurineState,
        hooks: { isDeadSpecies: () => true },
    });
    assert.equal(figurine.where, OBJ_INVENT);
});

test('a live cursed figurine timer follows inventory ownership', () => {
    const state = initializedState();
    const figurine = instance(FIGURINE, state, {
        corpsenm: TEST_SPECIES,
        cursed: true,
        // An existing transform timer must be replaced, not duplicated.
        timed: 1,
    });
    let attached = 0;
    addinv(figurine, {
        state,
        hooks: {
            attachFigurineTimer(obj) {
                ++attached;
                obj.timed = 1;
            },
            isDeadSpecies: () => false,
        },
    });
    assert.equal(attached, 1);
    assert.equal(figurine.timed, 1);

    let stopped = 0;
    freeinv(figurine, {
        state,
        hooks: {
            stopFigurineTimer(obj) {
                ++stopped;
                obj.timed = 0;
            },
        },
    });
    assert.equal(stopped, 1);
    assert.equal(figurine.timed, 0);
    assert.equal(figurine.where, OBJ_FREE);

    addinv(figurine, {
        state,
        hooks: {
            attachFigurineTimer(obj) {
                ++attached;
                obj.timed = 1;
            },
            isDeadSpecies: () => false,
        },
    });
    useupall(figurine, {
        state,
        hooks: {
            stopFigurineTimer(obj) {
                ++stopped;
                obj.timed = 0;
            },
        },
    });
    assert.equal(attached, 2);
    assert.equal(stopped, 2);
    assert.equal(figurine.timed, 0);
    assert.equal(figurine.where, OBJ_DELETED);
});

test('permanent inventory requires and receives refreshes', () => {
    const state = initializedState();
    state.iflags.perm_invent = true;
    const ration = instance(FOOD_RATION, state);
    assert.throws(
        () => addinv(ration, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'updateInventory',
    );
    assert.equal(ration.where, OBJ_FREE);

    let updates = 0;
    addinv(ration, {
        state,
        hooks: { updateInventory: () => { ++updates; } },
    });
    assert.equal(updates, 1);
});

test('startup inventory additions defer permanent inventory rendering', () => {
    const state = initializedState();
    state.program_state.in_moveloop = 0;
    state.iflags.perm_invent = true;
    const ration = instance(FOOD_RATION, state);

    addinv(ration, { state });
    assert.equal(ration.where, OBJ_INVENT);
});

test('inventory refresh honors map suppression and restores price state', () => {
    const state = initializedState();
    state.iflags.perm_invent = true;
    state.iflags.suppress_price = 7;

    for (const suppressingState of [
        ['in_mklev', state],
        ['saving', state.program_state],
        ['restoring', state.program_state],
        ['done_hup', state.program_state],
    ]) {
        const [field, owner] = suppressingState;
        owner[field] = 1;
        assert.equal(update_inventory({ state }), false);
        owner[field] = 0;
    }

    assert.throws(
        () => update_inventory({
            state,
            hooks: {
                updateInventory(current) {
                    assert.equal(current.iflags.suppress_price, 0);
                    throw new Error('window failure');
                },
            },
        }),
        /window failure/u,
    );
    assert.equal(state.iflags.suppress_price, 7);
});

test('useupall checks permanent inventory before unwielding', () => {
    const state = initializedState();
    const dart = instance(DART, state);
    addinv(dart, { state });
    dart.owornmask = W_WEP;
    state.iflags.perm_invent = true;

    let unworn = 0;
    assert.throws(
        () => useupall(dart, {
            state,
            hooks: {
                setNotWorn(obj) {
                    ++unworn;
                    obj.owornmask = 0;
                },
            },
        }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'updateInventory',
    );
    assert.equal(unworn, 0);
    assert.equal(dart.owornmask, W_WEP);
    assert.equal(dart.where, OBJ_INVENT);
});

test('money_cnt returns the first coin stack like the source invariant', () => {
    const state = initializedState();
    // Unequal quantities prove that traversal stops at the first coin stack.
    const first = instance(GOLD_PIECE, state, { quan: 25 });
    const malformedSecond = instance(GOLD_PIECE, state, { quan: 75 });
    first.nobj = malformedSecond;
    assert.equal(money_cnt(first), 25);
});

test('resetInventory deletes each object and restores first-letter state', () => {
    const state = initializedState();
    const ration = instance(FOOD_RATION, state);
    const apple = instance(APPLE, state);
    addinv(ration, { state });
    addinv(apple, { state });

    resetInventory({ state });
    assert.equal(state.invent, null);
    // INVLET_BASIC - 1 makes the source's next search wrap around to 'a'.
    assert.equal(state.lastinvnr, INVLET_BASIC - 1);
    assert.equal(ration.where, OBJ_DELETED);
    assert.equal(apple.where, OBJ_DELETED);
});

// A hero the capacity tests can weigh: acurrstr() and acurr()
// read u.acurr, and near_capacity() needs both Strength and Constitution.
function carryingState() {
    const state = initializedState();
    const attributes = new Array(NUM_ATTRS).fill(0);
    attributes[A_STR] = 18;
    attributes[A_CON] = 18;
    state.u.acurr = { a: attributes };
    state.u.uprops = state.u.uprops.map((prop) => ({ ...prop }));
    return state;
}

// invent.c obj_to_let() (2857-2868).
test('obj_to_let answers the letter assigned to the object', () => {
    const state = carryingState();
    const lamp = instance(OIL_LAMP, state);
    addinv(lamp, { state });
    assert.equal(obj_to_let(lamp, state), 'a');
    // options.c starts flags.invlet_constant at TRUE, so a state that has not
    // set it reads as set.
    lamp.invlet = 'q';
    delete state.flags.invlet_constant;
    assert.equal(obj_to_let(lamp, state), 'q');
    // C renumbers every letter first when flags.invlet_constant is off.
    state.flags.invlet_constant = false;
    lamp.invlet = 'q';
    assert.equal(obj_to_let(lamp, state), 'a');
    assert.equal(state.lastinvnr, 1);
});

test('reassign puts gold first and letters the remaining chain in order', () => {
    const state = carryingState();
    const lamp = instance(OIL_LAMP, state);
    const ration = instance(FOOD_RATION, state);
    const gold = instance(GOLD_PIECE, state, { quan: 20 });
    addinv(lamp, { state });
    addinv(ration, { state });
    addinv(gold, { state });
    lamp.invlet = 'z';
    ration.invlet = 'y';
    gold.invlet = 'x';

    assert.equal(reassign(state), gold);
    assert.equal(gold.invlet, '$');
    assert.equal(gold.nobj.invlet, 'a');
    assert.equal(gold.nobj.nobj.invlet, 'b');
    assert.equal(state.lastinvnr, 2);
});

test('reassign uses the overflow symbol after all 52 ordinary letters', () => {
    const state = carryingState();
    let tail = null;
    const objects = [];
    for (let index = 0; index < INVLET_BASIC + 1; ++index) {
        const object = instance(OIL_LAMP, state, { nomerge: true });
        objects.push(object);
        if (tail) tail.nobj = object;
        else state.invent = object;
        tail = object;
        object.where = OBJ_INVENT;
    }

    reassign(state);
    assert.equal(objects[0].invlet, 'a');
    assert.equal(objects[25].invlet, 'z');
    assert.equal(objects[26].invlet, 'A');
    assert.equal(objects[51].invlet, 'Z');
    assert.equal(objects[52].invlet, '#');
    assert.equal(state.lastinvnr, INVLET_BASIC - 1);
});

// invent.c xprname() (2892-2953).
test('xprname formats the inventory line', () => {
    const state = carryingState();
    // A wished-for lamp is seen but neither identified nor known to be
    // uncursed, which is what makes doname() answer its description.
    const lamp = instance(OIL_LAMP, state,
                          { bknown: false, dknown: true, known: false });
    addinv(lamp, { state });
    // "%c - %.*s%s" with a period for `dot`, and none without it.
    assert.equal(xprname(lamp, null, 'a', true, 0, 0, state), 'a - a lamp.');
    assert.equal(xprname(lamp, null, 'a', false, 0, 0, state), 'a - a lamp');
    // `use_invlet` overrides the caller's letter with the object's own, so a
    // caller that passes the wrong one still prints the right line.
    lamp.invlet = 'q';
    assert.equal(xprname(lamp, null, 'a', true, 0, 0, state), 'q - a lamp.');
    // The same default as obj_to_let()'s: an unset flag reads as C's TRUE, so
    // the override still happens.
    delete state.flags.invlet_constant;
    assert.equal(xprname(lamp, null, 'a', true, 0, 0, state), 'q - a lamp.');
    state.flags.invlet_constant = true;
    // CONTAINED_SYM and HANDS_SYM suppress that override, because C uses them
    // for lines that name no inventory slot.
    assert.equal(xprname(lamp, 'your hands', HANDS_SYM, true, 0, 0, state),
                 '- - your hands.');
    assert.equal(xprname(lamp, 'a lamp', CONTAINED_SYM, false, 0, 0, state),
                 '> - a lamp');
    // A non-zero quantity is shown instead of the object's own, and put back
    // afterwards.
    const arrows = instance(ARROW, state,
                            { bknown: false, known: false, quan: 7 });
    addinv(arrows, { state });
    assert.equal(xprname(arrows, null, 'b', true, 0, 3, state), 'b - 3 arrows.');
    assert.equal(arrows.quan, 7);
    // The shop price column is the only other shape C formats, and it stops.
    assert.throws(() => xprname(lamp, null, 'a', true, 10, 0, state),
                  UnsupportedObjectOperationError);
    assert.throws(() => xprname(lamp, 'total', '*', true, 0, 0, state),
                  UnsupportedObjectOperationError);
});

// invent.c prinv() (2869-2890).
test('prinv prints the line, with the prefix and total C adds', async () => {
    const state = carryingState();
    state.flags.verbose = true;
    const lines = [];
    const withMessage = { state, hooks: { message: (text) => lines.push(text) } };
    const arrows = instance(ARROW, state,
                            { bknown: false, known: false, quan: 7 });
    addinv(arrows, { state });

    // A null prefix prints nothing before the letter, and quan == 0 means the
    // object's own quantity, which suppresses the total.
    await prinv(null, arrows, 0, withMessage);
    assert.deepEqual(lines, ['a - 7 arrows.']);
    lines.length = 0;
    // A partial quantity drops the period and appends the total instead.
    await prinv('You have', arrows, 3, withMessage);
    assert.deepEqual(lines, ['You have a - 3 arrows (7 in total).']);
    lines.length = 0;
    // flags.verbose gates only the total, not the line.
    state.flags.verbose = false;
    await prinv(null, arrows, 3, withMessage);
    assert.deepEqual(lines, ['a - 3 arrows']);
});

// invent.c hold_another_object() (1206-1306), the arm a wish reaches.
test('hold_another_object adds the object and prints its letter', async () => {
    const state = carryingState();
    const lines = [];
    let encumbered = 0;
    const env = {
        state,
        hooks: {
            message: (text) => lines.push(text),
            encumberMessage: () => { encumbered += 1; },
        },
    };
    // A wished-for lamp is seen but neither identified nor known to be
    // uncursed, which is what makes doname() answer its description.
    const lamp = instance(OIL_LAMP, state,
                          { bknown: false, dknown: true, known: false });

    const held = await hold_another_object(lamp, 'Oops!  %s to the floor!',
                                           'The lamp drops', null, env);
    assert.equal(held, lamp);
    assert.equal(lamp.where, OBJ_INVENT);
    // C passes a null hold_msg, so prinv() prints the bare letter line; it
    // runs because drop_fmt is non-null, which is the `hold_msg || drop_fmt`
    // test at 1287.
    assert.deepEqual(lines, ['a - a lamp.']);
    assert.equal(encumbered, 1);

    // 1250-1256 drops only a corpse the wish marked; an ordinary one is held
    // like anything else.
    lines.length = 0;
    monst_globals_init(state);
    const corpse = instance(CORPSE, state, {
        corpsenm: TEST_SPECIES,
        owt: PLACEHOLDER_CORPSE_WEIGHT,
    });
    assert.equal(await hold_another_object(corpse, 'Oops!  %s to the floor!',
                                           'The corpse drops', null, env),
                 corpse);
    assert.equal(corpse.where, OBJ_INVENT);

    // Both messages null is C's silent grab: nothing is printed, and the
    // object is still held.
    lines.length = 0;
    const arrows = instance(ARROW, state,
                            { bknown: false, known: false, quan: 7 });
    assert.equal(await hold_another_object(arrows, null, null, null, env),
                 arrows);
    assert.deepEqual(lines, []);
    assert.equal(arrows.where, OBJ_INVENT);
});

// invent.c hold_another_object() reaches merged() through addinv_core0() at
// 1273, and merged() prints "You learn more about your items by comparing
// them." at 938-941 before obfree() at 944 -- both of them before prinv() at
// 1287.  ttyPline() can stop for a --More--, so a merge that did not wait for
// the message would free the object and print the inventory line while C was
// still holding the top line.
test('hold_another_object waits for the comparison message', async () => {
    const state = carryingState();
    const lines = [];
    let releaseMessage;
    const messageGate = new Promise((resolve) => {
        releaseMessage = resolve;
    });
    let comparisonCalls = 0;
    // Three arrows the hero carries unidentified and two more that are known:
    // the `known` disagreement is what makes merged() discover something.
    const carried = instance(ARROW, state, { known: false, quan: 3 });
    addinv(carried, { state });
    const incoming = instance(ARROW, state, { known: true, quan: 2 });
    const env = {
        state,
        hooks: {
            message: (text) => lines.push(text),
            encumberMessage: () => {},
            inventoryComparisonDiscovered() {
                ++comparisonCalls;
                return messageGate;
            },
        },
    };

    let settled = false;
    const pending = hold_another_object(
        incoming, 'Oops!  %s to the floor!', 'The arrows drop', null, env,
    ).then((result) => {
        settled = true;
        return result;
    });
    // Enough turns of the microtask queue that anything not blocked on the
    // gate has finished; the count is arbitrary and only has to be generous.
    for (let tick = 0; tick < 20; ++tick) await Promise.resolve();

    assert.equal(comparisonCalls, 1);
    assert.equal(settled, false);
    assert.deepEqual(lines, [], 'prinv() has not run yet');
    assert.notEqual(incoming.where, OBJ_DELETED, 'obfree() has not run yet');

    releaseMessage();
    assert.equal(await pending, carried);
    assert.equal(incoming.where, OBJ_DELETED);
    assert.equal(carried.quan, 5);
    // prinv() at 1287 prints the quantity that arrived, oquan, while the
    // merged stack holds five. The enchantment appears because the merge set
    // the carried stack's `known`, the discovery the message announces.
    assert.deepEqual(lines, ['a - 2 +0 arrows']);
});

// invent.c hold_another_object() (1218-1244) stands the artifact on the floor
// square the hero occupies, so its fixture needs a hero with a position, a
// level under her, and the artifact tables touch_artifact() measures against.
// The alignment is what decides whether she may hold the artifact.
function artifactHolderState(alignment, questarti = 0) {
    const state = carryingState();
    state.u.ux = 10;
    state.u.uy = 5;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.u.ualign = { type: alignment, record: 0 };
    state.youmonst = { data: { mflags1: 0, mflags2: 0, msize: 2, mattk: [] } };
    // Excalibur names PM_KNIGHT (artilist.h:85), so a Knight is the hero its
    // class test accepts; its race is NON_PM, which accepts everyone.
    // hack_artifacts() reads urole.questarti, so the caller's choice has to be
    // in place before init_artifacts() below; 0 is C's "no quest artifact",
    // which its `if (questArtifact)` guard skips.
    state.urole = { mnum: PM_KNIGHT, questarti };
    state.level = new GameMap();
    state.level.at(10, 5).typ = ROOM;
    // init_artifacts() reads flags.initalign to place the quest artifacts;
    // index 0 is the lawful row, which leaves Excalibur's own entry alone.
    state.flags.initalign = 0;
    init_artifacts(state);
    return state;
}

// invent.c addinv_core1() (984-992). An artifact that is not the hero's own
// quest artifact grants whatever its carried fields name, through
// artifact.c set_artifact_intrinsic(otmp, 1, W_ART).
test('taking an artifact into inventory grants its carried intrinsics', () => {
    const state = artifactHolderState(A_LAWFUL);
    // artilist.h:33 gives the Eye of the Aethiopica SPFX_EREGEN and
    // SPFX_HSPDAM to carry. This Knight's own quest artifact is unset, so
    // is_quest_artifact() is false and the arm below it runs.
    const amulet = instance(AMULET_OF_ESP, state, {
        oartifact: ART_EYE_OF_THE_AETHIOPICA,
    });
    addinv(amulet, { state });
    assert.equal(state.u.uprops[ENERGY_REGENERATION].extrinsic, W_ART);
    assert.equal(state.u.uprops[HALF_SPDAM].extrinsic, W_ART);
    assert.equal(amulet.where, OBJ_INVENT);

    // Grayswandir carries nothing at all, so holding it writes no extrinsic.
    const before = state.u.uprops.map((prop) => prop.extrinsic);
    const saber = instance(SILVER_SABER, state, {
        oartifact: ART_GRAYSWANDIR,
    });
    addinv(saber, { state });
    assert.deepEqual(state.u.uprops.map((prop) => prop.extrinsic), before);

    // The four types above the artifact arm keep their own seam: each sets a
    // u.uhave flag and records an achievement, neither of which is ported.
    for (const otyp of [AMULET_OF_YENDOR, CANDELABRUM_OF_INVOCATION,
                        BELL_OF_OPENING, SPE_BOOK_OF_THE_DEAD]) {
        assert.throws(
            () => addinv(instance(otyp, state), { state }),
            /addSpecialInventoryEffects/u,
            String(otyp),
        );
    }
});

// invent.c addinv_core1() (985-990) raises u.uhave.questart and calls
// artitouch() for the hero's own quest artifact.  Neither is ported, so the
// port refuses -- and the refusal has to leave the object as it found it.
// addinv_core0() reaches addinv_core1() only after clearing no_charge and
// how_lost, so preflight_addinv() carries the test, the way it already carries
// the four special otyps beside it in the same if/else chain.
test('a quest artifact is refused before addinv changes the object', () => {
    // The Knight's questarti is 25 (js/roles.js:158), the Magic Mirror of
    // Merlin, whose base type is MIRROR (artilist.h:255-258).
    const state = artifactHolderState(A_LAWFUL, ART_MAGIC_MIRROR_OF_MERLIN);
    const mirror = instance(MIRROR, state, {
        how_lost: LOST_THROWN,
        oartifact: ART_MAGIC_MIRROR_OF_MERLIN,
    });
    assert.throws(() => preflight_addinv(mirror, { state }),
                  /quest artifact held/u);
    assert.throws(() => addinv(mirror, { state }), /quest artifact held/u);
    // addinv_core0()'s own writes are what the projection stands in front of:
    // invent.c:1067-1071 clears how_lost, and the port does it in beginAddinv()
    // between the preflight and addinv_core1().
    assert.equal(mirror.how_lost, LOST_THROWN);
    assert.equal(mirror.where, OBJ_FREE);
    assert.equal(state.invent, null);

    // Grayswandir is nobody's quest artifact, so the same preflight admits it
    // and the object still reaches inventory.
    const saber = instance(SILVER_SABER, state, {
        oartifact: ART_GRAYSWANDIR,
    });
    assert.equal(preflight_addinv(saber, { state }).object, saber);
    addinv(saber, { state });
    assert.equal(saber.where, OBJ_INVENT);
});

// invent.c hold_another_object() (1218-1244) round-trips an artifact through
// the floor square and takes it straight back, so the object ends up in
// inventory carrying the coordinates place_object() gave it.
test('hold_another_object holds an artifact the hero can touch', async () => {
    const state = artifactHolderState(A_LAWFUL);
    const sword = instance(LONG_SWORD, state, { where: OBJ_FREE });
    // Build the artifact the way a wish does, so the artifact tables and the
    // object agree; naming it directly would leave artiexist[] unset.
    oname(sword, 'Excalibur', ONAME_WISH, { state });
    assert.equal(sword.oartifact, ART_EXCALIBUR);

    assert.equal(
        await hold_another_object(sword, null, null, null, {
            state,
            hooks: {
                encumberMessage: () => {},
                // do.c supplies remove_object() for obj_extract_self()'s
                // floor arm, which is the half of the round trip that takes
                // the artifact back off the square.
                extractExternalObject: (object, env) => remove_object(object,
                                                                      env),
            },
        }),
        sword,
    );
    assert.equal(sword.where, OBJ_INVENT);
    assert.equal(sword.ox, 10);
    assert.equal(sword.oy, 5);
    // obj_extract_self() took it off the floor again, so the square is empty.
    assert.equal(state.level.objects[10][5], null);
});

test('hold_another_object stops on the arms it cannot finish', async () => {
    // 1216-1244 puts an artifact on the floor to run touch_artifact().  A
    // chaotic Knight fails Excalibur's SPFX_RESTR alignment test, and its
    // SPFX_INTEL makes the first half of artifact.c:944 true on its own, so
    // the blast arm is reached without its rn2(4) being evaluated.
    const blasted = artifactHolderState(A_CHAOTIC);
    const artifact = instance(LONG_SWORD, blasted, { oartifact: ART_EXCALIBUR });
    await assert.rejects(
        () => hold_another_object(artifact, null, null, null,
                                  { state: blasted,
                                    hooks: { encumberMessage: () => {} } }),
        UnsupportedArtifactDisplayError,
    );

    const state = carryingState();
    const env = { state, hooks: { encumberMessage: () => {} } };
    // 1245-1249 adds the object and drops it again while Fumbling.
    const fumbling = carryingState();
    fumbling.u.uprops[FUMBLING] = { blocked: 0, extrinsic: 0, intrinsic: 1 };
    await assert.rejects(
        () => hold_another_object(instance(OIL_LAMP, fumbling), null, null,
                                  null,
                                  { state: fumbling,
                                    hooks: { encumberMessage: () => {} } }),
        UnsupportedObjectOperationError,
    );
    // 1275-1281 drops what will not fit: a boulder outweighs any hero's
    // capacity, so near_capacity() rises past the pickup burden. This env
    // carries no drop operations, so the admission stops for want of them
    // rather than running the branch.
    await assert.rejects(
        () => hold_another_object(instance(BOULDER, state), null, null, null,
                                 env),
        /dropObject is not available/u,
    );
    // 1278-1279 splits a stack that merged on the way in, and splitobj() is
    // unported, so no object with oc_merge may take the drop route at all.
    // Four hundred rocks weigh 4000, past this hero's capacity of 950, and
    // reach the encumbrance test with no admission behind them.
    await assert.rejects(
        () => hold_another_object(instance(ROCK, state, { quan: 400 }), null,
                                  null, null, env),
        /held object dropped/u,
    );
});

// invent.c:1258-1264 takes the encumbrance limit before addinv() as
// max(near_capacity(), flags.pickup_burden), and each operand needs a case
// where it is the larger.  Without both, a fixture proves only that one of
// them is read: every other test here leaves flags.pickup_burden at the
// MOD_ENCUMBER default, and a hero at or below Stressed can never tell the
// two apart.
test('the hold limit takes the larger of the load and the burden option',
    async () => {
        // hack.c capacity_from_excess() answers min(trunc(excess * 2 / cap) +
        // 1, OVERLOADED), so the hero climbs one encumbrance step per half
        // capacity of overweight.  One inventory object carries the whole
        // load, which keeps that arithmetic in one place; a heavy iron ball
        // does not merge, so the lamp added below stays a separate stack.
        const loaded = (ballastWeight, pickupBurden) => {
            const state = carryingState();
            if (pickupBurden !== undefined)
                state.flags.pickup_burden = pickupBurden;
            const ballast = instance(HEAVY_IRON_BALL, state, {
                invlet: 'a',
                owt: ballastWeight(weight_cap(state)),
                where: OBJ_INVENT,
            });
            state.invent = ballast;
            return state;
        };
        const hold = (state, obj) => hold_another_object(
            obj, null, null, null,
            { state, hooks: { encumberMessage: () => {} } },
        );

        // The load is the larger operand: twice capacity is an excess of one
        // capacity, which is HVY_ENCUMBER, above the MOD_ENCUMBER the option
        // defaults to.  One more ounce leaves her at HVY_ENCUMBER, so the
        // strict `>` at 1272 is false and C keeps the lamp.  Reading the
        // option alone here would compare against MOD_ENCUMBER and drop it.
        const strained = loaded((cap) => 2 * cap);
        assert.equal(near_capacity(strained), HVY_ENCUMBER);
        const lamp = instance(OIL_LAMP, strained, { owt: 1 });
        assert.equal(await hold(strained, lamp), lamp);
        assert.equal(lamp.where, OBJ_INVENT);
        assert.equal(near_capacity(strained), HVY_ENCUMBER);

        // The option is the larger operand: one ounce short of twice capacity
        // is MOD_ENCUMBER, and the ounce the lamp adds raises her to
        // HVY_ENCUMBER -- which the option now permits.  Reading the load
        // alone here would compare against MOD_ENCUMBER and drop it too.
        const permitted = loaded((cap) => 2 * cap - 1, HVY_ENCUMBER);
        assert.equal(near_capacity(permitted), MOD_ENCUMBER);
        const other = instance(OIL_LAMP, permitted, { owt: 1 });
        assert.equal(await hold(permitted, other), other);
        assert.equal(other.where, OBJ_INVENT);
        assert.equal(near_capacity(permitted), HVY_ENCUMBER);
    });

test('hold-drop projection keeps exact inventory and burden boundaries',
    async () => {
        const state = carryingState();
        let tail = null;
        for (let index = 0; index < INVLET_BASIC - 1; ++index) {
            const lamp = instance(OIL_LAMP, state, {
                invlet: index < 26
                    ? String.fromCharCode(97 + index)
                    : String.fromCharCode(65 + index - 26),
                nomerge: true,
                owt: 0,
                where: OBJ_INVENT,
            });
            if (tail) tail.nobj = lamp;
            else state.invent = lamp;
            tail = lamp;
        }
        const gold = instance(GOLD_PIECE, state, {
            invlet: '$',
            owt: 0,
            where: OBJ_INVENT,
        });
        tail.nobj = gold;
        const ball = instance(HEAVY_IRON_BALL, state);
        // Exactly MOD_ENCUMBER pins `calc_capacity(...) > projectedLimit`;
        // 51 non-gold slots plus the new ball pins the strict INVLET_BASIC
        // comparison while the gold slot distinguishes inv_cnt(FALSE).
        ball.owt = Math.ceil(weight_cap(state) * 1.5);
        assert.equal(calc_capacity(ball.owt, state), 2);
        let preflights = 0;
        const env = {
            state,
            hooks: {
                encumberMessage: () => {},
                preflightDropObject: () => { ++preflights; },
            },
        };
        const admission = prepareHoldDropAdmission(ball, env);

        const held = await hold_another_object(
            ball,
            null,
            null,
            null,
            env,
            admission,
        );

        assert.equal(held, ball);
        assert.equal(preflights, 0);
        assert.equal(ball.where, OBJ_INVENT);
    });

test('hold-drop admission distinguishes the 52nd and 53rd non-gold slots',
    async () => {
        for (const [existingSlots, expectedDrop] of [
            // The incoming ball receives the last legal non-gold letter.
            [INVLET_BASIC - 1, false],
            // The incoming ball is the first item beyond the 52-letter limit.
            [INVLET_BASIC, true],
        ]) {
            const state = carryingState();
            let tail = null;
            for (let index = 0; index < existingSlots; ++index) {
                const lamp = instance(OIL_LAMP, state, {
                    invlet: index < LETTERS_PER_CASE
                        ? String.fromCharCode(97 + index)
                        : String.fromCharCode(
                            65 + index - LETTERS_PER_CASE,
                        ),
                    nomerge: true,
                    owt: 0,
                    where: OBJ_INVENT,
                });
                if (tail) tail.nobj = lamp;
                else state.invent = lamp;
                tail = lamp;
            }
            const gold = instance(GOLD_PIECE, state, {
                invlet: '$',
                owt: 0,
                where: OBJ_INVENT,
            });
            tail.nobj = gold;
            const ball = instance(HEAVY_IRON_BALL, state, { owt: 0 });
            let drops = 0;
            const env = {
                state,
                hooks: {
                    encumberMessage: () => {},
                    preflightDropObject: () => ({ object: ball }),
                    dropObject: () => { ++drops; },
                },
            };
            const admission = prepareHoldDropAdmission(ball, env);

            const held = await hold_another_object(
                ball, null, null, null, env, admission,
            );

            assert.equal(held, expectedDrop ? null : ball, existingSlots);
            assert.equal(drops, expectedDrop ? 1 : 0, existingSlots);
        }
    });

test('hold-drop admission validates its object before reading its type', () => {
    const state = carryingState();
    for (const value of [null, NON_OBJECT_VALUE]) {
        assert.throws(
            () => prepareHoldDropAdmission(value, { state }),
            /hold-drop admission requires an object/u,
        );
    }
});

test('hold-drop admission is object-specific, state-specific, and one-shot',
    async () => {
        const first = ordinaryDropFixture();
        first.obj.where = OBJ_FREE;
        first.state.invent = null;
        first.state.u.acurr.a[A_STR] = MINIMUM_HERO_ATTRIBUTE;
        first.state.u.acurr.a[A_CON] = MINIMUM_HERO_ATTRIBUTE;
        first.hooks.preflightDropObject = () => ({ object: first.obj });
        first.hooks.dropObject = () => {};
        const admission = prepareHoldDropAdmission(first.obj, first);
        const other = instance(HEAVY_IRON_BALL, first.state);

        await assert.rejects(
            hold_another_object(
                other, null, null, null, first, admission,
            ),
            /admission belongs to another object/u,
        );
        const otherState = carryingState();
        await assert.rejects(
            hold_another_object(
                first.obj,
                null,
                null,
                null,
                { state: otherState, hooks: first.hooks },
                admission,
            ),
            /admission belongs to another state/u,
        );
        await hold_another_object(
            first.obj, null, null, null, first, admission,
        );
        await assert.rejects(
            hold_another_object(
                first.obj, null, null, null, first, admission,
            ),
            /admission was already consumed/u,
        );

        const stale = ordinaryDropFixture();
        stale.obj.where = OBJ_FREE;
        stale.state.invent = null;
        stale.state.u.acurr.a[A_STR] = MINIMUM_HERO_ATTRIBUTE;
        stale.state.u.acurr.a[A_CON] = MINIMUM_HERO_ATTRIBUTE;
        stale.hooks.preflightDropObject = () => ({ object: stale.obj });
        stale.hooks.dropObject = () => {};
        const staleAdmission = prepareHoldDropAdmission(
            stale.obj,
            stale,
        );
        stale.state.invent = instance(OIL_LAMP, stale.state, {
            where: OBJ_INVENT,
        });
        await assert.rejects(
            hold_another_object(
                stale.obj, null, null, null, stale, staleAdmission,
            ),
            /admission is stale/u,
        );

        for (const [name, mutate] of [
            ['type', (obj) => { obj.otyp = OIL_LAMP; }],
            ['weight', (obj) => { ++obj.owt; }],
            // Quantity 2 changes the admitted single ball into a split stack.
            ['quantity', (obj) => { obj.quan = 2; }],
            ['ownership', (obj) => { obj.where = OBJ_FLOOR; }],
        ]) {
            const changed = ordinaryDropFixture();
            changed.obj.where = OBJ_FREE;
            changed.state.invent = null;
            changed.state.u.acurr.a[A_STR] = MINIMUM_HERO_ATTRIBUTE;
            changed.state.u.acurr.a[A_CON] = MINIMUM_HERO_ATTRIBUTE;
            changed.hooks.preflightDropObject = () => ({
                object: changed.obj,
            });
            changed.hooks.dropObject = () => {};
            const changedAdmission = prepareHoldDropAdmission(
                changed.obj,
                changed,
            );
            mutate(changed.obj);

            await assert.rejects(
                hold_another_object(
                    changed.obj,
                    null,
                    null,
                    null,
                    changed,
                    changedAdmission,
                ),
                /admission is stale/u,
                name,
            );
        }
    });

// invent.c runs the artifact block at 1218 and the Fumbling test at 1245
// before the encumbrance projection at 1258-1281, so a ball too heavy to hold
// still stops on whichever of the two comes first.
test('heavy artifact and Fumbling guards precede drop projection', async () => {
    for (const [name, makeState, setup, reason] of [
        // A chaotic Knight cannot touch Excalibur, so the artifact block stops
        // the hold before the ball's weight is ever measured.
        ['artifact', () => artifactHolderState(A_CHAOTIC),
         (state, ball) => { ball.oartifact = ART_EXCALIBUR; }, /artifact/u],
        ['Fumbling', () => carryingState(), (state) => {
            state.u.uprops[FUMBLING].intrinsic = 1;
        }, /fumbling/u],
    ]) {
        const state = makeState();
        state.u.acurr.a[A_STR] = 3;
        state.u.acurr.a[A_CON] = 3;
        const ball = instance(HEAVY_IRON_BALL, state);
        setup(state, ball);
        await assert.rejects(
            hold_another_object(ball, null, null, null, {
                state,
                hooks: { encumberMessage: () => {} },
            }),
            reason,
            name,
        );
    }
});

// invent.c hold_another_object() (1275-1304) and do.c dropx(), dropy(), and
// dropz() (785-842), restricted to an ordinary, shopless floor square.
function ordinaryDropFixture(otyp = HEAVY_IRON_BALL) {
    const state = carryingState();
    state.u.ux = 10;
    state.u.uy = 5;
    state.u.uz = { dnum: 0, dlevel: 1 };
    state.youmonst = {
        data: { mflags1: 0, msize: 2, mattk: [] },
    };
    state.level = new GameMap();
    state.level.at(10, 5).typ = ROOM;
    state.stairs = null;
    const obj = instance(otyp, state);
    obj.where = OBJ_INVENT;
    obj.invlet = 'a';
    state.invent = obj;
    const lines = [];
    const hooks = {
        message: (line) => lines.push(line),
        newsym: () => {},
        encumberMessage: () => {},
        // stackobj() unlinks the pile member it absorbs; remove_object() is
        // what do.c supplies for it.
        extractExternalObject: (object, env) => remove_object(object, env),
    };
    return { hooks, lines, obj, state };
}

test('dropy reaches dropz without container-impact handling', async () => {
    const { hooks, obj, state } = ordinaryDropFixture();
    state.invent = null;
    obj.where = OBJ_FREE;

    await dropy(obj, { state, hooks });

    assert.equal(state.level.objects[10][5], obj);
    assert.equal(obj.where, OBJ_FLOOR);
});

test('heavy-ball retain and drop paths preserve source callback order',
    async () => {
        const cases = [
            {
                name: 'retained at the pickup-burden equality',
                configure({ obj, state }) {
                    // One and a half times carrying capacity lands exactly at
                    // MOD_ENCUMBER, so the strict capacity increase is false.
                    obj.owt = Math.ceil(weight_cap(state) * 1.5);
                    assert.equal(calc_capacity(obj.owt, state), 2);
                    // This is the one case that must expose the source's
                    // explicit permanent-inventory refresh.
                    state.iflags.perm_invent = true;
                },
                drops: false,
            },
            {
                name: 'dropped after capacity rises above pickup burden',
                configure({ state }) {
                    // NetHack's minimum ordinary attributes make the normal
                    // heavy ball exceed MOD_ENCUMBER.
                    state.u.acurr.a[A_STR] = MINIMUM_HERO_ATTRIBUTE;
                    state.u.acurr.a[A_CON] = MINIMUM_HERO_ATTRIBUTE;
                },
                drops: true,
            },
            {
                name: 'dropped as the 53rd non-gold inventory slot',
                configure({ obj, state }) {
                    let tail = null;
                    for (let index = 0; index < INVLET_BASIC; ++index) {
                        const lamp = instance(OIL_LAMP, state, {
                            invlet: index < LETTERS_PER_CASE
                                ? String.fromCharCode(97 + index)
                                : String.fromCharCode(
                                    65 + index - LETTERS_PER_CASE,
                                ),
                            nomerge: true,
                            // Zero weight isolates the 52-letter limit from
                            // the independent capacity condition.
                            owt: 0,
                            where: OBJ_INVENT,
                        });
                        if (tail) tail.nobj = lamp;
                        else state.invent = lamp;
                        tail = lamp;
                    }
                    // Zero weight keeps the incoming 53rd slot below every
                    // encumbrance boundary.
                    obj.owt = 0;
                },
                drops: true,
            },
        ];

        for (const currentCase of cases) {
            const fixture = ordinaryDropFixture();
            const { obj, state } = fixture;
            // hold_another_object() receives a free wished-for object. Start
            // with nomerge set so the drop message and drop callback can pin
            // the source-ordered clearing of that flag.
            state.invent = null;
            obj.where = OBJ_FREE;
            obj.invlet = '\0';
            obj.nomerge = 1;
            currentCase.configure(fixture);
            const events = [];
            const snapshot = (event, text = null) => {
                events.push([
                    event,
                    text,
                    obj.where,
                    obj.nomerge,
                    state.invent === obj,
                    state.level.objects[10][5] === obj,
                ]);
            };
            const hooks = {
                message(text) {
                    snapshot('message', text);
                },
                preflightDropObject: preflight_dropx,
                extractExternalObject: (object, env2) => remove_object(
                    object, env2,
                ),
                async dropObject(object, env, admission) {
                    snapshot('dropx');
                    await dropx(object, env, admission);
                },
                newsym() {
                    snapshot('newsym');
                },
                encumberMessage() {
                    snapshot('encumber');
                },
            };
            if (!currentCase.drops) {
                hooks.updateInventory = () => {
                    snapshot('inventory refresh');
                };
            }
            const env = { state, hooks };
            const admission = prepareHoldDropAdmission(obj, env);

            const held = await hold_another_object(
                obj,
                'Oops!  %s to the floor!',
                'The heavy iron ball drops',
                'You hold',
                env,
                admission,
            );

            if (!currentCase.drops) {
                assert.equal(held, obj, currentCase.name);
                assert.equal(obj.where, OBJ_INVENT, currentCase.name);
                assert.deepEqual(events, [
                    [
                        'message',
                        'You hold a - an uncursed very heavy iron ball.',
                        OBJ_INVENT,
                        1,
                        true,
                        false,
                    ],
                    ['inventory refresh', null, OBJ_INVENT, 1, true, false],
                    ['encumber', null, OBJ_INVENT, 1, true, false],
                ], currentCase.name);
            } else {
                assert.equal(held, null, currentCase.name);
                assert.equal(obj.where, OBJ_FLOOR, currentCase.name);
                assert.deepEqual(events, [
                    [
                        'message',
                        'Oops!  The heavy iron ball drops to the floor!',
                        OBJ_INVENT,
                        1,
                        true,
                        false,
                    ],
                    ['dropx', null, OBJ_INVENT, 0, true, false],
                    ['newsym', null, OBJ_FLOOR, 0, false, true],
                    ['encumber', null, OBJ_FLOOR, 0, false, true],
                ], currentCase.name);
            }
        }
    });

test('hold_another_object drops a nonmerging heavy wish onto ordinary ground',
    async () => {
        const state = carryingState();
        state.u.acurr.a[A_STR] = 3;
        state.u.acurr.a[A_CON] = 3;
        state.u.ux = 10;
        state.u.uy = 5;
        state.u.uz = { dnum: 0, dlevel: 1 };
        state.youmonst = {
            data: { mflags1: 0, msize: 2, mattk: [] },
        };
        state.level = new GameMap();
        state.level.at(10, 5).typ = ROOM;
        state.stairs = null;
        const ball = instance(HEAVY_IRON_BALL, state);
        const lines = [];
        let encumbered = 0;
        const hooks = {
            message: (text) => lines.push(text),
            preflightDropObject: preflight_dropx,
            dropObject: dropx,
            newsym: () => {},
            encumberMessage: () => { ++encumbered; },
            extractExternalObject: (object, env2) => remove_object(object, env2),
        };
        const env = { state, hooks };
        const admission = prepareHoldDropAdmission(ball, env);

        const held = await hold_another_object(
            ball,
            'Oops!  %s to the floor!',
            'The heavy iron ball drops',
            null,
            env,
            admission,
        );

        assert.equal(held, null);
        assert.equal(state.invent, null);
        assert.equal(state.level.objects[10][5], ball);
        assert.equal(ball.where, OBJ_FLOOR);
        assert.equal(ball.nomerge, 0);
        const second = instance(HEAVY_IRON_BALL, state);
        const secondAdmission = prepareHoldDropAdmission(second, env);
        assert.equal(await hold_another_object(
            second,
            'Oops!  %s to the floor!',
            'The heavy iron ball drops',
            null,
            env,
            secondAdmission,
        ), null);
        // place_object() prepends the new object to both independent source
        // indexes; oc_merge=0 leaves both nodes distinct through stackobj().
        assert.equal(state.level.objects[10][5], second);
        assert.equal(second.nexthere, ball);
        assert.equal(state.level.objlist, second);
        assert.equal(second.nobj, ball);
        assert.deepEqual(lines, [
            'Oops!  The heavy iron ball drops to the floor!',
            'Oops!  The heavy iron ball drops to the floor!',
        ]);
        assert.equal(encumbered, 2);
    });

test('heavy wish drops stay on an up staircase and a doorway', async () => {
    for (const [name, configure] of [
        ['up staircase', ({ state }) => {
            state.level.at(10, 5).typ = STAIRS;
            state.stairs = {
                // An up staircase makes dokick.c down_gate() return
                // MIGR_NOWHERE, so ship_object() leaves the ball here.
                sx: 10,
                sy: 5,
                up: true,
                isladder: false,
                tolev: { dnum: 0, dlevel: 0 },
                next: null,
            };
        }],
        ['doorway', ({ state }) => {
            const square = state.level.at(10, 5);
            square.typ = DOOR;
            square.flags = square.doormask = D_NODOOR;
        }],
    ]) {
        const fixture = ordinaryDropFixture();
        configure(fixture);

        await dropx(fixture.obj, {
            state: fixture.state,
            hooks: fixture.hooks,
        });

        assert.equal(fixture.state.level.objects[10][5], fixture.obj, name);
        assert.equal(fixture.obj.where, OBJ_FLOOR, name);
    }
});

test('ordinary drop preflight refuses excluded floor effects before mutation',
    () => {
        const state = carryingState();
        state.u.ux = 10;
        state.u.uy = 5;
        state.u.uz = { dnum: 0, dlevel: 1 };
        state.youmonst = {
            data: { mflags1: 0, msize: 2, mattk: [] },
        };
        state.level = new GameMap();
        state.level.at(10, 5).typ = ROOM;
        const ball = instance(HEAVY_IRON_BALL, state);
        ball.where = OBJ_INVENT;
        ball.invlet = 'a';
        state.invent = ball;
        // A shop level where the hero is NOT at a costly spot does not refuse
        // the drop -- sellobj() would be a no-op in C (shk.c:3938-3944).
        state.level.flags.has_shop = true;
        // Use a trap to trigger the guard before mutation, since the hero is
        // not at a costly spot and the narrowed shop guard is inert here.
        state.level.traps = [{ tx: 10, ty: 5 }];

        assert.throws(
            () => preflight_dropx(ball, { state, hooks: {} }),
            /trap/u,
        );
        assert.equal(state.invent, ball);
        assert.equal(ball.where, OBJ_INVENT);
        assert.equal(state.level.objects[10][5], null);

        state.level.traps = [];
        state.level.flags.has_shop = false;
        state.u.uprops[BLINDED].intrinsic = 1;
        assert.doesNotThrow(
            () => preflight_dropx(ball, {
                state,
                hooks: {
                    newsym() {},
                    encumberMessage() {},
                    extractExternalObject() {},
                },
            }),
            'grounded blindness has no special do.c dropz() effect',
        );
        state.u.uprops[BLINDED].intrinsic = 0;
        state.u.uprops[HALLUC].intrinsic = 1;
        assert.throws(
            () => preflight_dropx(ball, { state, hooks: {} }),
            /hallucinated/u,
        );
        state.u.uprops[HALLUC].intrinsic = 0;
        state.u.uinwater = true;
        assert.throws(
            () => preflight_dropx(ball, { state, hooks: {} }),
            /underwater/u,
        );
        state.u.uinwater = false;
        state.head_engr = { engr_x: 10, engr_y: 5, nxt_engr: null };
        assert.throws(
            () => preflight_dropx(ball, { state, hooks: {} }),
            /engraving/u,
        );
        state.head_engr = null;
        const region = create_region();
        region.visible = true;
        add_rect_to_reg(region, { lx: 10, ly: 5, hx: 10, hy: 5 });
        state.level.regions.push(region);
        assert.throws(
            () => preflight_dropx(ball, { state, hooks: {} }),
            /visible region/u,
        );
    });

test('ordinary drop preflight atomically refuses every excluded do.c tail',
    () => {
        const cases = [
            ['wrong ownership', /ownership/u, ({ obj }) => {
                obj.where = OBJ_FLOOR;
            }],
            // invent.c merged() asks its caller for an operation for each of
            // these two before it can absorb the landing object into a pile
            // member, and shk.c obfree() asks for both of them again. A timer
            // on the surviving dropped object follows it onto the floor.
            ['lit lamp', /lit or globby/u, ({ obj }) => {
                obj.lamplit = true;
            }, OIL_LAMP],
            ['globby object', /lit or globby/u, ({ obj }) => {
                obj.globby = true;
            }],
            // shk.c obfree()'s last operation: lock.c reset_pick(), for the
            // box whose lock the hero is in the middle of picking.
            ['box being picked', /lock is being picked/u, ({ state, obj }) => {
                state.xlock = { box: obj };
            }],
            ['swallowed hero', /swallowed/u, ({ state }) => {
                state.u.uswallow = true;
            }],
            ['air level', /special-level/u, ({ state }) => {
                state.air_level = { ...state.u.uz };
            }],
            ['water level', /special-level/u, ({ state }) => {
                state.water_level = { ...state.u.uz };
            }],
            ['unreachable floor', /unreachable/u, ({ state }) => {
                state.u.uprops[LEVITATION].intrinsic = 1;
            }],
            ['seen pit floor', /unreachable/u, ({ state }) => {
                state.level.traps.push({
                    tx: 10, ty: 5, ttyp: PIT, tseen: true,
                });
            }],
            ['worn ball', /worn/u, ({ obj }) => { obj.owornmask = W_WEP; }],
            ['wielded ball', /attached/u, ({ state, obj }) => {
                state.uwep = obj;
            }],
            ['quivered ball', /attached/u, ({ state, obj }) => {
                state.uquiver = obj;
            }],
            ['swap-wielded ball', /attached/u, ({ state, obj }) => {
                state.uswapwep = obj;
            }],
            ['attached ball', /attached/u, ({ state, obj }) => {
                state.uball = obj;
            }],
            ['unpaid ball', /unpaid/u, ({ obj }) => { obj.unpaid = true; }],
            ['altar', /altar/u, ({ state }) => {
                state.level.at(10, 5).typ = ALTAR;
            }],
            ['stair shipping', /shipping/u, ({ state }) => {
                state.stairs = { sx: 10, sy: 5, next: null };
            }],
            ['trap effects', /trap/u, ({ state }) => {
                state.level.traps.push({ tx: 10, ty: 5, ttyp: WEB });
            }],
            ['liquid effects', /liquid/u, ({ state }) => {
                state.level.at(10, 5).typ = LAVAPOOL;
            }],
            ['other terrain', /non-ordinary/u, ({ state }) => {
                state.level.at(10, 5).typ = SINK;
            }],
            ['nearby timed corpse impact', /buried corpse/u, ({ state }) => {
                state.level.buriedobjlist = {
                    nobj: null,
                    otmp: null,
                    otyp: CORPSE,
                    ox: 10,
                    oy: 5,
                    timed: true,
                };
            }],
            ['missing floor grid', /floor-object grid/u, ({ state }) => {
                state.level.objects[10] = null;
            }],
        ];

        for (const [name, reason, setup, otyp] of cases) {
            const fixture = ordinaryDropFixture(otyp);
            setup?.(fixture);
            const { hooks, lines, obj, state } = fixture;
            const before = {
                invent: state.invent,
                where: obj.where,
                floor: state.level.objects?.[10]?.[5] ?? null,
            };

            assert.throws(
                () => preflight_dropx(obj, { state, hooks }),
                reason,
                name,
            );
            assert.equal(state.invent, before.invent, `${name}: inventory`);
            assert.equal(obj.where, before.where, `${name}: ownership`);
            assert.equal(
                state.level.objects?.[10]?.[5] ?? null,
                before.floor,
                `${name}: floor`,
            );
            assert.deepEqual(lines, [], `${name}: output`);
        }
    });

test('drop preflight validates its object argument before reading ownership',
    () => {
        const { hooks, state } = ordinaryDropFixture();
        for (const value of [null, 7]) {
            assert.throws(
                () => preflight_dropx(value, { state, hooks }),
                /preflight_dropx requires an object/u,
            );
        }
    });

test('prepared drop admission rejects changed ownership and origin',
    async () => {
        const used = ordinaryDropFixture();
        const usedAdmission = preflight_dropx(used.obj, used);
        await dropx(used.obj, used, usedAdmission);
        await assert.rejects(
            dropx(used.obj, used, usedAdmission),
            /drop admission was already consumed/u,
        );

        const freed = ordinaryDropFixture();
        const freedAdmission = preflight_dropx(freed.obj, freed);
        freed.obj.where = OBJ_FREE;
        freed.state.invent = null;
        await assert.rejects(
            dropx(freed.obj, freed, freedAdmission),
            /drop admission is stale/u,
        );

        const wrongOrigin = ordinaryDropFixture();
        const wrongOriginAdmission = preflight_dropx(
            wrongOrigin.obj,
            wrongOrigin,
        );
        // No preflight can issue this value; corrupting the token isolates the
        // origin half of consumeDropAdmission's stale-token guard.
        wrongOriginAdmission.initialWhere = OBJ_FLOOR;
        await assert.rejects(
            dropx(wrongOrigin.obj, wrongOrigin, wrongOriginAdmission),
            /drop admission is stale/u,
        );
    });

test('buried-corpse impact preflight pins every coordinate boundary', () => {
    const refusing = [
        [9, 4], [9, 5], [9, 6],
        [10, 4], [10, 6],
        [11, 4], [11, 5], [11, 6],
    ];
    for (const [ox, oy] of refusing) {
        const { hooks, obj, state } = ordinaryDropFixture();
        state.level.buriedobjlist = {
            nobj: null, otyp: CORPSE, ox, oy, timed: true,
        };
        assert.throws(
            () => preflight_dropx(obj, { state, hooks }),
            /buried corpse/u,
            `${ox},${oy}`,
        );
    }

    for (const [name, buried] of [
        ['wrong type', { otyp: OIL_LAMP, timed: true, ox: 10, oy: 5 }],
        ['untimed', { otyp: CORPSE, timed: false, ox: 10, oy: 5 }],
        ['left', { otyp: CORPSE, timed: true, ox: 8, oy: 5 }],
        ['right', { otyp: CORPSE, timed: true, ox: 12, oy: 5 }],
        ['above', { otyp: CORPSE, timed: true, ox: 10, oy: 3 }],
        ['below', { otyp: CORPSE, timed: true, ox: 10, oy: 7 }],
    ]) {
        const { hooks, obj, state } = ordinaryDropFixture();
        state.level.buriedobjlist = { ...buried, nobj: null };
        assert.doesNotThrow(
            () => preflight_dropx(obj, { state, hooks }),
            name,
        );
    }
});

test('dropz refuses container impact before placing or announcing the object',
    async () => {
        const { hooks, lines, obj, state } = ordinaryDropFixture();
        obj.where = OBJ_FREE;
        state.invent = null;

        await assert.rejects(
            dropz(obj, true, { state, hooks }),
            /container impact/u,
        );
        assert.equal(obj.where, OBJ_FREE);
        assert.equal(state.level.objects[10][5], null);
        assert.deepEqual(lines, []);
    });

test('heavy wish-drop refusal restores capacity cache and leaves no trace',
    async () => {
        const state = carryingState();
        state.u.acurr.a[A_STR] = 3;
        state.u.acurr.a[A_CON] = 3;
        state.u.ux = 10;
        state.u.uy = 5;
        state.u.uz = { dnum: 0, dlevel: 1 };
        state.youmonst = {
            data: { mflags1: 0, msize: 2, mattk: [] },
        };
        state.level = new GameMap();
        state.level.at(10, 5).typ = ROOM;
        state.level.flags.has_shop = true;
        state.gw = { marker: 1 };
        const ball = instance(HEAVY_IRON_BALL, state, { dknown: false });
        const lines = [];

        await assert.rejects(
            () => hold_another_object(
                ball,
                'Oops!  %s to the floor!',
                'The heavy iron ball drops',
                null,
                {
                    state,
                    hooks: {
                        message: (line) => lines.push(line),
                        preflightDropObject: preflight_dropx,
                        dropObject: () => {},
                    },
                },
            ),
            UnsupportedDropError,
        );
        assert.deepEqual(state.gw, { marker: 1 });
        assert.equal(ball.dknown, false);
        assert.equal(ball.where, OBJ_FREE);
        assert.equal(state.invent, null);
        assert.deepEqual(lines, []);
    });

test('a missing heavy drop owner is refused before observation or inventory',
    async () => {
        const { obj, state } = ordinaryDropFixture();
        state.u.acurr.a[A_STR] = 3;
        state.u.acurr.a[A_CON] = 3;
        obj.where = OBJ_FREE;
        obj.dknown = false;
        state.invent = null;
        state.gw = { marker: 1 };
        const lines = [];

        await assert.rejects(
            () => hold_another_object(
                obj,
                'Oops!  %s to the floor!',
                'The heavy iron ball drops',
                null,
                {
                    state,
                    hooks: {
                        message: (line) => lines.push(line),
                        preflightDropObject: preflight_dropx,
                    },
                },
            ),
            /dropObject is not available/u,
        );
        assert.deepEqual(state.gw, { marker: 1 });
        assert.equal(obj.dknown, false);
        assert.equal(obj.where, OBJ_FREE);
        assert.equal(state.invent, null);
        assert.equal(state.level.objects[10][5], null);
        assert.deepEqual(lines, []);
    });

// C ref: youprop.h:65 Stone_resistance, read by invent.c
// will_feel_cockatrice(). The macro is (HStone_resistance ||
// EStone_resistance), so either field alone suppresses the feel. Without both
// rows nothing tells the two fields apart, and an `&&` there would make a
// hero resistant by one route alone feel the corpse anyway.
const STONE_RESISTANCE_ROWS = [
    ['neither field set, so the bare hand feels the corpse', {}, true],
    ['the intrinsic alone resists', { intrinsic: 1 }, false],
    ['the extrinsic alone resists', { extrinsic: 1 }, false],
];

test('will_feel_cockatrice reads both halves of Stone_resistance', () => {
    for (const [label, property, expected] of STONE_RESISTANCE_ROWS) {
        const state = initializedState();
        // touch_petrifies() is a species identity test, so the corpse needs
        // only the cockatrice's pmidx behind its corpsenm.
        state.mons = [{ pmidx: PM_COCKATRICE }];
        Object.assign(state.u.uprops[STONE_RES], property);
        const corpse = instance(CORPSE, state, {
            corpsenm: 0,
            owt: PLACEHOLDER_CORPSE_WEIGHT,
        });
        // force_touch stands in for blindness, which the hero fixture has no
        // other reason to carry.
        assert.equal(
            will_feel_cockatrice(corpse, true, state), expected, label,
        );
    }
});
