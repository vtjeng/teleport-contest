import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ICE,
    OBJ_BURIED,
    OBJ_FLOOR,
    REVIVE_MON,
    ROT_CORPSE,
    ROT_ORGANIC,
    TIMER_OBJECT,
} from '../js/const.js';
import { ART_LONGBOW_OF_DIANA } from '../js/artifacts.js';
import {
    UnsupportedBurialError,
    bury_an_obj,
} from '../js/bury.js';
import { GameMap } from '../js/game.js';
import { newObject, place_object } from '../js/obj.js';
import {
    APPLE,
    AMULET_OF_YENDOR,
    BOW,
    CHEST,
    CORPSE,
    FOOD_RATION,
    HEAVY_IRON_BALL,
    IRON_CHAIN,
    LEASH,
    OIL_LAMP,
    POT_HEALING,
    ROCK,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_DEATH,
    PM_HUMAN,
    PM_TROLL,
    monst_globals_init,
} from '../js/monsters.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function burialState(moves = 20) {
    const state = {
        level: new GameMap(),
        moves,
        program_state: { gameover: false },
    };
    objects_globals_init(state);
    monst_globals_init(state);
    timeout_globals_init(state);
    return state;
}

let nextObjectId = 2;

function objectInstance(otyp, state, overrides = {}) {
    const type = state.objects[otyp];
    return newObject({
        age: state.moves,
        corpsenm: PM_HUMAN,
        o_id: nextObjectId++,
        oclass: type.oc_class,
        otyp,
        quan: 1,
        ...overrides,
    });
}

function scriptedRandom(expectedCalls) {
    const remaining = [...expectedCalls];
    const draw = (name, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${bound})`);
        assert.deepEqual(
            [name, bound],
            expected.slice(0, 2),
            `wrong RNG call before scripted result ${expected[2]}`,
        );
        return expected[2];
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', bound),
            rnd: (bound) => draw('rnd', bound),
        },
        done() {
            assert.deepEqual(remaining, [], 'scripted RNG calls remain');
        },
    };
}

function pileAt(state, x, y) {
    const pile = [];
    for (let obj = state.level.objects[x][y]; obj; obj = obj.nexthere)
        pile.push(obj);
    return pile;
}

function floorList(state) {
    const list = [];
    for (let obj = state.level.objlist; obj; obj = obj.nobj) list.push(obj);
    return list;
}

test('bury_an_obj schedules ordinary organic rot in source RNG order', () => {
    const state = burialState(40);
    const chest = objectInstance(CHEST, state);
    // An arbitrary interior room square keeps both floor indexes observable.
    const x = 11;
    const y = 7;
    place_object(chest, x, y, { state });
    const script = scriptedRandom([
        // Even zero must be drawn for obj_resists(otmp, 0, 0); 0 < 0 is false.
        ['rn2', 100, 0],
        // Five is the first ordinary result which does not resist 5 percent.
        ['rn2', 100, 5],
        // The maximum rnd(250) result makes the 250-turn base visible.
        ['rnd', 250, 250],
    ]);

    const result = bury_an_obj(chest, { state, random: script.random });

    assert.deepEqual(result, { next: null, deallocated: false });
    assert.equal(chest.where, OBJ_BURIED);
    assert.deepEqual([chest.ox, chest.oy], [x, y]);
    assert.equal(state.level.objects[x][y], null);
    assert.equal(state.level.objlist, null);
    assert.equal(state.level.buriedobjlist, chest);
    assert.equal(chest.nobj, null);
    assert.equal(chest.nexthere, null);
    assert.equal(chest.timed, 1);
    assert.equal(peek_timer(ROT_ORGANIC, chest, state), 540);
    script.done();
});

test('bury_an_obj leaves a corpse timer in place and unlinks both floor indexes', () => {
    const state = burialState(20);
    const lower = objectInstance(APPLE, state);
    const corpse = objectInstance(CORPSE, state);
    const upper = objectInstance(FOOD_RATION, state);
    // Three objects at one interior square put corpse in the middle of both
    // source chains, exercising predecessor updates rather than head removal.
    const x = 13;
    const y = 8;
    place_object(lower, x, y, { state });
    start_timer(300, TIMER_OBJECT, ROT_CORPSE, corpse, state);
    place_object(corpse, x, y, { state });
    place_object(upper, x, y, { state });
    const script = scriptedRandom([
        // A non-Rider corpse still takes the zero-percent resistance draw.
        ['rn2', 100, 99],
    ]);

    const result = bury_an_obj(corpse, { state, random: script.random });

    assert.deepEqual(result, { next: lower, deallocated: false });
    assert.deepEqual(pileAt(state, x, y), [upper, lower]);
    assert.deepEqual(floorList(state), [upper, lower]);
    assert.equal(state.level.buriedobjlist, corpse);
    assert.equal(corpse.where, OBJ_BURIED);
    assert.equal(corpse.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 320);
    assert.equal(peek_timer(ROT_ORGANIC, corpse, state), 0);
    script.done();
});

test('bury_an_obj applies the source off-ice corpse timer adjustment', () => {
    const state = burialState(100);
    const corpse = objectInstance(CORPSE, state, {
        // An age of 80 represents 20 turns spent under the two-times ice rate.
        age: 80,
        on_ice: true,
    });
    // This ordinary room square is no longer ice when the corpse is removed.
    const x = 15;
    const y = 9;
    start_timer(80, TIMER_OBJECT, ROT_CORPSE, corpse, state);
    place_object(corpse, x, y, { state });
    const script = scriptedRandom([
        // Ordinary corpse burial consumes only its zero-percent resist draw.
        ['rn2', 100, 37],
    ]);

    bury_an_obj(corpse, { state, random: script.random });

    assert.equal(corpse.on_ice, false);
    assert.equal(corpse.age, 90);
    assert.equal(corpse.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 140);
    script.done();
});

test('bury_an_obj uses the under-ice potion timer delay without the 250 base', () => {
    const state = burialState(30);
    const potion = objectInstance(POT_HEALING, state);
    const x = 17;
    const y = 10;
    state.level.at(x, y).typ = ICE;
    place_object(potion, x, y, { state });
    const script = scriptedRandom([
        // The first draw is the mandatory zero-percent burial resistance.
        ['rn2', 100, 61],
        // Ninety-nine does not resist the ordinary five-percent rot check.
        ['rn2', 100, 99],
        // One exposes that under-ice delay is rnd(250), with no added base.
        ['rnd', 250, 1],
    ]);

    bury_an_obj(potion, { state, random: script.random });

    assert.equal(potion.where, OBJ_BURIED);
    assert.equal(peek_timer(ROT_ORGANIC, potion, state), 31);
    script.done();
});

test('protected objects resist burial without consuming RNG', () => {
    const state = burialState();
    const amulet = objectInstance(AMULET_OF_YENDOR, state);
    const x = 19;
    const y = 11;
    place_object(amulet, x, y, { state });
    const script = scriptedRandom([]);

    const result = bury_an_obj(amulet, {
        state,
        random: script.random,
    });

    assert.deepEqual(result, { next: null, deallocated: false });
    assert.equal(amulet.where, OBJ_FLOOR);
    assert.equal(state.level.objects[x][y], amulet);
    assert.equal(state.level.objlist, amulet);
    assert.equal(state.level.buriedobjlist, null);
    script.done();
});

test('a Rider corpse resists before RNG or floor ownership changes', () => {
    const state = burialState();
    const lower = objectInstance(APPLE, state);
    const rider = objectInstance(CORPSE, state, { corpsenm: PM_DEATH });
    const upper = objectInstance(FOOD_RATION, state);
    // Three objects at one interior square make the Rider the middle member
    // of both floor indexes, exposing either predecessor-link mutation.
    const x = 20;
    const y = 12;
    place_object(lower, x, y, { state });
    start_timer(60, TIMER_OBJECT, REVIVE_MON, rider, state);
    place_object(rider, x, y, { state });
    place_object(upper, x, y, { state });
    const script = scriptedRandom([]);

    const result = bury_an_obj(rider, { state, random: script.random });

    assert.deepEqual(result, { next: lower, deallocated: false });
    assert.equal(state.level.objects[x][y], upper);
    assert.equal(upper.nexthere, rider);
    assert.equal(rider.nexthere, lower);
    assert.equal(lower.nexthere, null);
    assert.equal(state.level.objlist, upper);
    assert.equal(upper.nobj, rider);
    assert.equal(rider.nobj, lower);
    assert.equal(lower.nobj, null);
    assert.equal(rider.where, OBJ_FLOOR);
    assert.deepEqual([rider.ox, rider.oy], [x, y]);
    assert.equal(state.level.buriedobjlist, null);
    // The 60-turn Rider revival remains due at move 80.
    assert.equal(peek_timer(REVIVE_MON, rider, state), 80);
    script.done();
});

test('an organic artifact uses 95-percent burial-rot resistance', () => {
    const state = burialState(30);
    const bow = objectInstance(BOW, state, {
        // The base type and artifact index form the source Longbow of Diana.
        oartifact: ART_LONGBOW_OF_DIANA,
    });
    const x = 21;
    const y = 13;
    place_object(bow, x, y, { state });
    const script = scriptedRandom([
        // obj_resists(0, 0) still draws; zero cannot satisfy its threshold.
        ['rn2', 100, 0],
        // Ninety-four resists the artifact's 95 percent, but would not resist
        // the ordinary object's five percent, distinguishing the two paths.
        ['rn2', 100, 94],
    ]);

    const result = bury_an_obj(bow, { state, random: script.random });

    assert.deepEqual(result, { next: null, deallocated: false });
    assert.equal(bow.where, OBJ_BURIED);
    assert.deepEqual([bow.ox, bow.oy], [x, y]);
    assert.equal(state.level.objects[x][y], null);
    assert.equal(state.level.objlist, null);
    assert.equal(state.level.buriedobjlist, bow);
    assert.equal(bow.timed, 0);
    assert.equal(peek_timer(ROT_ORGANIC, bow, state), 0);
    script.done();
});

test('off-ice corpse adjustment falls back to a revival timer', () => {
    const state = burialState(100);
    const corpse = objectInstance(CORPSE, state, {
        // Troll corpses can validly carry REVIVE_MON; age 80 represents 20
        // turns accumulated at the two-times ice rate.
        age: 80,
        corpsenm: PM_TROLL,
        on_ice: true,
    });
    const x = 22;
    const y = 14;
    start_timer(80, TIMER_OBJECT, REVIVE_MON, corpse, state);
    place_object(corpse, x, y, { state });
    const script = scriptedRandom([
        // A non-Rider corpse takes the zero-percent burial-resistance draw.
        ['rn2', 100, 73],
    ]);

    bury_an_obj(corpse, { state, random: script.random });

    assert.equal(corpse.where, OBJ_BURIED);
    assert.equal(corpse.on_ice, false);
    assert.equal(corpse.age, 90);
    assert.equal(corpse.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
    assert.equal(peek_timer(REVIVE_MON, corpse, state), 140);
    script.done();
});

test('punishment chain and ball branches preserve floor ownership without RNG', () => {
    const cases = [
        {
            name: 'chain',
            object: IRON_CHAIN,
            stateKey: 'uchain',
            stateOwner: 'direct',
            expectedOperation: null,
        },
        {
            name: 'ball',
            object: HEAVY_IRON_BALL,
            stateKey: 'uball',
            stateOwner: 'go',
            expectedOperation: 'buried-ball punishment',
        },
    ];

    for (const [index, entry] of cases.entries()) {
        const state = burialState();
        const lower = objectInstance(APPLE, state);
        const punished = objectInstance(entry.object, state);
        const upper = objectInstance(FOOD_RATION, state);
        // Separate interior squares make failures attributable to each branch;
        // the three-object pile exposes mutation to either ownership chain.
        const x = 23 + index;
        const y = 15;
        place_object(lower, x, y, { state });
        place_object(punished, x, y, { state });
        place_object(upper, x, y, { state });
        if (entry.stateOwner === 'go') {
            state.go = { [entry.stateKey]: punished };
        } else {
            state[entry.stateKey] = punished;
        }
        const script = scriptedRandom([]);

        if (entry.expectedOperation) {
            assert.throws(
                () => bury_an_obj(punished, {
                    state,
                    random: script.random,
                }),
                (error) => error instanceof UnsupportedBurialError
                    && error.operation === entry.expectedOperation,
                entry.name,
            );
        } else {
            assert.deepEqual(
                bury_an_obj(punished, { state, random: script.random }),
                { next: lower, deallocated: false },
            );
        }

        assert.equal(state.level.objects[x][y], upper, entry.name);
        assert.equal(upper.nexthere, punished, entry.name);
        assert.equal(punished.nexthere, lower, entry.name);
        assert.equal(lower.nexthere, null, entry.name);
        assert.equal(state.level.objlist, upper, entry.name);
        assert.equal(upper.nobj, punished, entry.name);
        assert.equal(punished.nobj, lower, entry.name);
        assert.equal(lower.nobj, null, entry.name);
        assert.equal(punished.where, OBJ_FLOOR, entry.name);
        assert.deepEqual([punished.ox, punished.oy], [x, y], entry.name);
        assert.equal(state.level.buriedobjlist, null, entry.name);
        assert.equal(
            entry.stateOwner === 'go'
                ? state.go[entry.stateKey]
                : state[entry.stateKey],
            punished,
            entry.name,
        );
        script.done();
    }
});

test('unported burial side effects fail before changing ownership', () => {
    const cases = [
        {
            // Nonzero leashmon reaches dig.c o_unleash().
            name: 'attached leash',
            object: LEASH,
            overrides: { leashmon: 41 },
            operation: 'o_unleash',
        },
        {
            // A lit non-oil object reaches dig.c end_burn().
            name: 'lit lamp',
            object: OIL_LAMP,
            overrides: { lamplit: true },
            operation: 'end_burn',
        },
        {
            // A non-ice rock reaches dig.c obfree().
            name: 'ordinary rock',
            object: ROCK,
            overrides: {},
            operation: 'object deallocation',
        },
    ];

    for (const [index, entry] of cases.entries()) {
        const state = burialState();
        const obj = objectInstance(entry.object, state, entry.overrides);
        // Distinct nearby squares prevent one case's floor state from masking
        // another; their exact coordinates carry no gameplay significance.
        const x = 21 + index;
        const y = 12;
        place_object(obj, x, y, { state });
        const script = scriptedRandom([
            // Each ordinary object first consumes obj_resists(otmp, 0, 0).
            ['rn2', 100, 50],
        ]);

        assert.throws(
            () => bury_an_obj(obj, { state, random: script.random }),
            (error) => error instanceof UnsupportedBurialError
                && error.operation === entry.operation,
            entry.name,
        );
        assert.equal(obj.where, OBJ_FLOOR, entry.name);
        assert.equal(state.level.objects[x][y], obj, entry.name);
        assert.equal(state.level.objlist, obj, entry.name);
        assert.equal(state.level.buriedobjlist, null, entry.name);
        script.done();
    }
});
