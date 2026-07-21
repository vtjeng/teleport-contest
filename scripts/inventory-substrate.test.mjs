import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    BLINDED,
    HALLUC,
    HALLUC_RES,
    LAST_PROP,
    LOST_THROWN,
    NON_PM,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_ONBILL,
    W_QUIVER,
    W_WEP,
} from '../js/const.js';
import {
    add_to_container,
    addinv,
    addinv_nomerge,
    assigninvlet,
    freeinv,
    INVLET_BASIC,
    initializeInventory,
    inventoryObjects,
    mergable,
    merged,
    money_cnt,
    obj_extract_self,
    resetInventory,
    update_inventory,
    useupall,
} from '../js/invent.js';
import {
    newObject,
    UnsupportedObjectOperationError,
    weight,
} from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    APPLE,
    AKLYS,
    BAG_OF_HOLDING,
    CORPSE,
    DART,
    EGG,
    FIGURINE,
    FOOD_RATION,
    GLOB_OF_GRAY_OOZE,
    GOLD_PIECE,
    LUCKSTONE,
    SACK,
    objects_globals_init,
} from '../js/objects.js';

// Any valid non-sentinel monster index works for identity-only object tests.
const TEST_SPECIES = 4;
const LETTERS_PER_CASE = 26; // a-z or A-Z inventory slots
// Construct corpse fixtures without invoking the monster seam before the test.
const PLACEHOLDER_CORPSE_WEIGHT = 1;

function initializedState() {
    const state = {
        // Object/monster id 1 is reserved; startup begins from 2.
        context: { ident: 2 },
        disp: {},
        flags: { invlet_constant: true },
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
    addinv(carried, {
        state,
        hooks: { recalculateLuck: () => {} },
    });

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
            recalculateLuck: () => {},
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

test('freeinv checks luck side effects before unlinking', () => {
    const state = initializedState();
    const luckstone = instance(LUCKSTONE, state);
    addinv(luckstone, {
        state,
        hooks: { recalculateLuck: () => {} },
    });
    assert.throws(
        () => freeinv(luckstone, { state }),
        (error) => error instanceof UnsupportedObjectOperationError
            && error.operation === 'recalculateLuck',
    );
    assert.equal(state.invent, luckstone);
    assert.equal(luckstone.where, OBJ_INVENT);
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
