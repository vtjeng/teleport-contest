import assert from 'node:assert/strict';
import test from 'node:test';

import { init_artifacts } from '../js/artifacts.js';
import {
    ALTAR,
    AM_LAWFUL,
    FOUNTAIN,
    GRAVE,
    HEADSTONE,
    OBJ_BURIED,
    OBJ_FLOOR,
    OROOM,
    ROOM,
    SINK,
    THEMEROOM,
} from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { PM_ARCHEOLOGIST } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import {
    BELL,
    GEM_CLASS,
    GOLD_PIECE,
    objects_globals_init,
} from '../js/objects.js';
import {
    find_okay_roompos,
    mkaltar,
    mkfount,
    mkgrave,
    mksink,
} from '../js/room_features.js';

function mapState() {
    return { level: new GameMap(), iflags: {} };
}

function generationState(dlevel = 1) {
    const state = resetGame();
    Object.assign(state, {
        astral_level: { dnum: 0, dlevel: 0 },
        branches: [],
        context: { current_fruit: 1, ident: 2, mon_moving: false },
        dungeons: [{
            depth_start: 1,
            dunlev_ureached: dlevel,
            entry_lev: 1,
            flags: { align: 0, hellish: false },
            num_dunlevs: 40,
        }],
        flags: { initalign: 0 },
        head_engr: null,
        in_mklev: true,
        moves: 2,
        program_state: { gameover: false },
        quest_dnum: 1,
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
        specialLevels: [],
        u: {
            uhave: { amulet: 0 },
            ulevel: 1,
            uz: { dnum: 0, dlevel },
        },
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    });
    state.level = new GameMap();
    objects_globals_init(state);
    // A zero-returning setup stream makes object descriptions deterministic;
    // room-feature draws use their own explicit stream below.
    init_objects(state, () => 0);
    init_artifacts(state);
    return state;
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
            rn1: (range, base) => draw('rn1', `${range},${base}`),
            rne: (bound) => draw('rne', bound),
        },
        done() {
            assert.deepEqual(remaining, [], 'scripted RNG calls remain');
        },
    };
}

function fixedCoordinateHooks(x, y) {
    return {
        bydoor: () => false,
        somexyspace(_room, coordinate) {
            Object.assign(coordinate, { x, y });
            return true;
        },
    };
}

function floorPile(state, x, y) {
    const result = [];
    for (let object = state.level.objects[x][y]; object; object = object.nexthere)
        result.push(object);
    return result;
}

test('find_okay_roompos stops after exactly 200 occupied candidates', () => {
    const state = mapState();
    // A fountain is furniture, so occupied() short-circuits before bydoor().
    state.level.at(10, 5).typ = FOUNTAIN;
    let selections = 0;

    assert.equal(find_okay_roompos({}, { x: 0, y: 0 }, {
        state,
        hooks: {
            bydoor: () => assert.fail('bydoor must be short-circuited'),
            somexyspace(_room, coordinate) {
                ++selections;
                Object.assign(coordinate, { x: 10, y: 5 });
                return true;
            },
        },
    }), false);
    assert.equal(selections, 200);
});

test('find_okay_roompos retries a door-adjacent candidate without RNG', () => {
    const state = mapState();
    state.level.at(10, 5).typ = ROOM;
    state.level.at(11, 5).typ = ROOM;
    const choices = [{ x: 10, y: 5 }, { x: 11, y: 5 }];
    let selections = 0;
    let doorChecks = 0;
    const coordinate = { x: 0, y: 0 };

    assert.equal(find_okay_roompos({}, coordinate, {
        state,
        hooks: {
            bydoor(x, y) {
                ++doorChecks;
                return x === 10 && y === 5;
            },
            somexyspace(_room, target) {
                Object.assign(target, choices[selections++]);
                return true;
            },
        },
    }), true);
    assert.deepEqual(coordinate, { x: 11, y: 5 });
    assert.deepEqual([selections, doorChecks], [2, 2]);
});

test('mkfount preserves blessing and post-recount counter order', () => {
    const state = mapState();
    state.level.at(10, 5).typ = ROOM;
    state.level.at(12, 5).typ = FOUNTAIN;
    // Zero from rn2(7) selects the one-in-seven blessed-fountain branch.
    const stream = scriptedRandom([['rn2', 7, 0]]);

    mkfount({}, {
        state,
        random: stream.random,
        hooks: fixedCoordinateHooks(10, 5),
    });

    const fountain = state.level.at(10, 5);
    assert.equal(fountain.typ, FOUNTAIN);
    assert.equal(fountain.horizontal, true);
    // set_levltyp() recounts two fountains, then mkfount() increments once.
    assert.equal(state.level.flags.nfountains, 3);
    assert.equal(state.level.flags.nsinks, 0);
    stream.done();
});

test('mksink preserves the source post-recount counter increment', () => {
    const state = mapState();
    state.level.at(10, 5).typ = ROOM;
    state.level.at(12, 5).typ = SINK;
    state.level.at(13, 5).typ = FOUNTAIN;

    mksink({}, {
        state,
        hooks: fixedCoordinateHooks(10, 5),
    });

    assert.equal(state.level.at(10, 5).typ, SINK);
    // The recount sees two sinks and one fountain before the explicit ++.
    assert.deepEqual(
        [state.level.flags.nsinks, state.level.flags.nfountains],
        [3, 1],
    );
});

test('mkaltar rejects a theme room before coordinate selection or RNG', () => {
    const state = mapState();
    const stream = scriptedRandom([]);

    mkaltar({ rtype: THEMEROOM }, {
        state,
        random: stream.random,
        hooks: {
            bydoor: () => assert.fail('unexpected bydoor'),
            somexyspace: () => assert.fail('unexpected coordinate selection'),
        },
    });

    stream.done();
});

test('mkaltar writes the source alignment mask after terrain placement', () => {
    const state = mapState();
    state.level.at(10, 5).typ = ROOM;
    // rn2(3)=2 maps through 2-1 to lawful alignment.
    const stream = scriptedRandom([['rn2', 3, 2]]);

    mkaltar({ rtype: OROOM }, {
        state,
        random: stream.random,
        hooks: fixedCoordinateHooks(10, 5),
    });

    assert.equal(state.level.at(10, 5).typ, ALTAR);
    assert.equal(state.level.at(10, 5).flags, AM_LAWFUL);
    stream.done();
});

test('mkgrave draws for a bell before rejecting a non-ordinary room', () => {
    const state = mapState();
    // A nonzero rn2(10) result means no bell, but the declaration still draws.
    const stream = scriptedRandom([['rn2', 10, 1]]);

    mkgrave({ rtype: THEMEROOM }, {
        state,
        random: stream.random,
        hooks: {
            bydoor: () => assert.fail('unexpected bydoor'),
            somexyspace: () => assert.fail('unexpected coordinate selection'),
        },
    });

    stream.done();
});

test('mkgrave buries source-sized gold and leaves the selected bell', () => {
    const state = generationState();
    state.level.at(10, 5).typ = ROOM;
    const stream = scriptedRandom([
        ['rn2', 10, 0], // choose the one-in-ten bell grave
        ['rn2', 3, 0], // choose the one-in-three buried-gold branch
        ['rnd', 2, 1], // allocate the gold object id
        ['rnd', 20, 20], // maximum loose base-gold component
        ['rnd', 5, 5], // maximum D:1 depth-scaled component
        ['rn2', 5, 0], // bury no additional random objects
        ['rnd', 2, 1], // allocate the floor bell object id
    ]);

    mkgrave({ rtype: OROOM }, {
        state,
        random: stream.random,
        hooks: fixedCoordinateHooks(10, 5),
    });

    assert.equal(state.level.at(10, 5).typ, GRAVE);
    const engraving = engr_at(10, 5, state);
    assert.equal(engraving.engr_type, HEADSTONE);
    assert.equal(engraving.engr_txt[0], 'Saved by the bell!');

    const gold = state.level.buriedobjlist;
    assert.equal(gold.otyp, GOLD_PIECE);
    // At D:1, rnd(20)=20 plus 1*rnd(5)=5 produces 25 coins.
    assert.equal(gold.quan, 25);
    assert.equal(gold.owt, 1);
    assert.deepEqual([gold.where, gold.ox, gold.oy, gold.nobj], [
        OBJ_BURIED,
        10,
        5,
        null,
    ]);

    const pile = floorPile(state, 10, 5);
    assert.equal(pile.length, 1);
    assert.deepEqual(
        [pile[0].otyp, pile[0].where, pile[0].ox, pile[0].oy],
        [BELL, OBJ_FLOOR, 10, 5],
    );
    stream.done();
});

test('mkgrave curses and buries each real random object before the bell', () => {
    const state = generationState();
    state.level.at(10, 5).typ = ROOM;
    const gemProbabilityTotal = state.go.oclass_prob_totals[GEM_CLASS];
    const stream = scriptedRandom([
        ['rn2', 10, 0], // select a bell grave and avoid epitaph RNG
        ['rn2', 3, 1], // skip buried gold
        ['rn2', 5, 1], // request exactly one random buried object
        ['rnd', 100, 50], // cumulative class probability 50 selects gems
        ['rnd', gemProbabilityTotal, 1], // first positive-probability gem
        ['rnd', 2, 1], // allocate the gem object id
        ['rn2', 6, 1], // keep the generated gem at quantity one
        ['rnd', 2, 1], // allocate the floor bell object id
    ]);

    mkgrave({ rtype: OROOM }, {
        state,
        random: stream.random,
        hooks: fixedCoordinateHooks(10, 5),
    });

    const buried = state.level.buriedobjlist;
    assert.equal(buried.where, OBJ_BURIED);
    assert.equal(buried.oclass, GEM_CLASS);
    assert.equal(buried.cursed, true);
    assert.equal(buried.blessed, false);
    assert.deepEqual([buried.ox, buried.oy, buried.nobj], [10, 5, null]);
    assert.equal(floorPile(state, 10, 5)[0].otyp, BELL);
    stream.done();
});
