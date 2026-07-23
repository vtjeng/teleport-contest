import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    AGGRAVATE_MONSTER,
    ALTAR,
    A_LAWFUL,
    A_NEUTRAL,
    AM_LAWFUL,
    AM_SHRINE,
    COLNO,
    DB_ICE,
    DB_MOAT,
    DEAF,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_CLOSED,
    DUST,
    FAINTED,
    G_GENOD,
    HEADSTONE,
    INVIS,
    M_AP_OBJECT,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    STEALTH,
    TEMPLE,
    W_ARM,
} from '../js/const.js';
import { make_engr_at, sengr_at } from '../js/engrave.js';
import {
    accessible,
    can_fog,
    can_ooze,
    distfleeck,
    disturb,
    in_your_sanctuary,
    monflee,
    monnear,
    onscary,
    set_apparxy,
} from '../js/monmove.js';
import {
    PM_ANGEL,
    PM_DEATH,
    PM_FOG_CLOUD,
    PM_ETTIN,
    PM_GIANT_RAT,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_JABBERWOCK,
    PM_LEPRECHAUN,
    PM_LITTLE_DOG,
    PM_VAMPIRE_LEADER,
    PM_VROCK,
    PM_WOOD_NYMPH,
    PM_XORN,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    COIN_CLASS,
    DAGGER,
    GOLD_DRAGON_SCALE_MAIL,
    LONG_SWORD,
    SACK,
    SCR_SCARE_MONSTER,
    objects_globals_init,
} from '../js/objects.js';

function makeState() {
    const locations = new Map();
    const floorObjects = Array.from(
        { length: COLNO },
        () => Array(ROWNO).fill(null),
    );
    const uprops = [];
    uprops[INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[DEAF] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[STEALTH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[AGGRAVATE_MONSTER] = {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    };
    uprops[DISPLACED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    };
    const state = {
        invent: null,
        moves: 1,
        dungeons: [{ flags: { hellish: false } }],
        astral_level: { dnum: 99, dlevel: 1 },
        level: {
            monlist: null,
            objects: floorObjects,
            rooms: [],
            at(x, y) {
                return locations.get(`${x},${y}`) ?? { typ: ROOM, flags: 0 };
            },
        },
        u: {
            ux: 10,
            uy: 10,
            uinwater: false,
            uprops,
            ustuck: null,
            ualign: { record: 10, type: A_LAWFUL },
            urooms: [0, 0, 0, 0, 0],
            uz: { dnum: 0, dlevel: 1 },
        },
        youmonst: newMonster(),
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return { locations, state };
}

function ordinaryMonster(state, overrides = {}) {
    return newMonster({
        data: state.mons[PM_GIANT_RAT],
        mnum: PM_GIANT_RAT,
        mx: 4,
        my: 4,
        mux: 0,
        muy: 0,
        mcansee: true,
        ...overrides,
    });
}

function objectFor(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        ...overrides,
    });
}

function sequenceRandom(values, calls) {
    return {
        rn2(bound) {
            calls.push(bound);
            assert.ok(values.length, `unexpected rn2(${bound})`);
            const value = values.shift();
            assert.ok(value >= 0 && value < bound);
            return value;
        },
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

function sanctuaryFixture() {
    const { locations, state } = makeState();
    const roomNumber = ROOMOFFSET;
    state.level.rooms[0] = { rtype: TEMPLE };
    state.u.urooms[0] = roomNumber;
    locations.set('6,6', { typ: ROOM, flags: 0, roomno: roomNumber });
    locations.set('7,7', { typ: ROOM, flags: 0, roomno: roomNumber });
    locations.set('8,8', {
        typ: ALTAR,
        flags: AM_SHRINE | AM_LAWFUL,
        roomno: roomNumber,
    });
    const priest = newMonster({
        data: state.mons[PM_HUMAN],
        ispriest: true,
        mpeaceful: true,
        mhp: 1,
        mx: 7,
        my: 7,
        mextra: {
            epri: {
                shralign: A_LAWFUL,
                shroom: roomNumber,
                shrpos: { x: 8, y: 8 },
                shrlevel: { ...state.u.uz },
            },
        },
    });
    state.level.monlist = priest;
    return {
        locations,
        monster: ordinaryMonster(state, { mx: 6, my: 6 }),
        priest,
        roomNumber,
        state,
    };
}

test('set_apparxy keeps exact knowledge for pets and remembered hero squares', () => {
    const { state } = makeState();
    const noDraws = { rn2: () => assert.fail('direct knowledge must not draw') };

    const pet = ordinaryMonster(state, { mtame: 5, mux: 2, muy: 3 });
    set_apparxy(pet, { state, random: noDraws });
    assert.deepEqual([pet.mux, pet.muy], [state.u.ux, state.u.uy]);

    const remembered = ordinaryMonster(state, {
        mux: state.u.ux,
        muy: state.u.uy,
    });
    set_apparxy(remembered, { state, random: noDraws });
    assert.deepEqual(
        [remembered.mux, remembered.muy],
        [state.u.ux, state.u.uy],
    );
});

test('set_apparxy gives a visible ordinary monster the real hero square', () => {
    const { state } = makeState();
    // A blocked invisibility property is inactive under the Invis macro.
    state.u.uprops[INVIS] = { intrinsic: 1, extrinsic: 0, blocked: 1 };
    const monster = ordinaryMonster(state, { mux: 2, muy: 3 });

    set_apparxy(monster, {
        state,
        random: { rn2: () => assert.fail('visible hero must not draw') },
        couldSee: () => assert.fail('visible hero needs no guess'),
    });

    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy lets a blind xorn smell any carried money', () => {
    const { state } = makeState();
    // A one-coin stack is enough for money_cnt() to make the location exact.
    state.invent = objectFor(state, COIN_CLASS, { quan: 1 });
    const monster = newMonster({
        data: state.mons[PM_XORN],
        mnum: PM_XORN,
        mx: 4,
        my: 4,
        mcansee: false,
    });

    set_apparxy(monster, {
        state,
        random: { rn2: () => assert.fail('xorn smell must not draw') },
        couldSee: () => assert.fail('xorn smell needs no guess'),
    });

    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy zero rolls immediately recover the real hero square', () => {
    const unseen = makeState().state;
    unseen.u.uprops[INVIS].intrinsic = 1;
    const blindMonster = ordinaryMonster(unseen, { mux: 2, muy: 3 });
    const unseenCalls = [];

    set_apparxy(blindMonster, {
        state: unseen,
        random: sequenceRandom([0], unseenCalls),
        couldSee: () => assert.fail('exact unseen roll skips guessing'),
    });
    assert.deepEqual(unseenCalls, [3]);
    assert.deepEqual(
        [blindMonster.mux, blindMonster.muy],
        [unseen.u.ux, unseen.u.uy],
    );

    const displaced = makeState().state;
    displaced.u.uprops[DISPLACED].extrinsic = 1;
    const displacedMonster = ordinaryMonster(displaced, { mux: 7, muy: 7 });
    const displacedCalls = [];
    const seen = [];
    set_apparxy(displacedMonster, {
        state: displaced,
        random: sequenceRandom([0], displacedCalls),
        couldSee(x, y) {
            seen.push([x, y]);
            return true;
        },
    });
    assert.deepEqual(displacedCalls, [4]);
    assert.deepEqual(seen, [[7, 7]]);
    assert.deepEqual(
        [displacedMonster.mux, displacedMonster.muy],
        [displaced.u.ux, displaced.u.uy],
    );
});

test('set_apparxy uses the source unseen draw and retries its own square', () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, { mx: 9, my: 9 });
    const calls = [];
    // Miss the 1-in-3 exact-location chance, reject <9,9>, then accept <11,10>.
    const values = [1, 0, 0, 2, 1];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3, 3, 3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [11, 10]);
    assert.deepEqual(values, []);
});

test('set_apparxy displacement uses radius two when the old image is visible', () => {
    const { state } = makeState();
    state.u.uprops[DISPLACED].extrinsic = 1;
    const monster = ordinaryMonster(state, {
        mx: 8,
        my: 8,
        mux: 7,
        muy: 7,
    });
    const calls = [];
    const seen = [];
    // Miss the 1-in-4 exact-location chance, then select the monster square.
    const values = [1, 0, 0];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee(x, y) {
            seen.push([x, y]);
            return true;
        },
    });

    assert.deepEqual(calls, [4, 5, 5]);
    assert.deepEqual(seen, [[7, 7], [8, 8]]);
    assert.deepEqual([monster.mux, monster.muy], [8, 8]);
});

test('set_apparxy underwater guesses do not add an exact-location draw', () => {
    const { state } = makeState();
    state.u.uinwater = true;
    const monster = ordinaryMonster(state);
    const calls = [];
    // Radius-one offsets choose <9,11>; there is no preceding rn2(3/4).
    const values = [0, 2];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [9, 11]);
});

test('set_apparxy punts to the hero after 200 rejected guesses', () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, { mx: 9, my: 9 });
    let draws = 0;
    const random = {
        rn2() {
            // First miss the exact-location chance; every radius-one pair
            // thereafter selects the monster's own square and is rejected.
            return draws++ === 0 ? 1 : 0;
        },
    };

    set_apparxy(monster, {
        state,
        random,
        couldSee: () => assert.fail('own-square rejection comes first'),
    });

    // One exact-location draw plus two coordinate draws for each source try.
    assert.equal(draws, 1 + 2 * 200);
    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy permits an amorphous monster to guess a closed door', () => {
    const { locations, state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    locations.set('9,10', { typ: DOOR, flags: D_CLOSED });
    const monster = newMonster({
        data: state.mons[PM_FOG_CLOUD],
        mnum: PM_FOG_CLOUD,
        mx: 4,
        my: 4,
        mcansee: true,
    });
    const calls = [];
    // Miss exact knowledge, then choose the closed door immediately west.
    const values = [1, 0, 1];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [9, 10]);
});

test('accessible uses closed-door and raised-drawbridge surface rules', () => {
    const { locations, state } = makeState();
    locations.set('1,1', { typ: ROOM, flags: 0 });
    locations.set('2,1', { typ: DOOR, flags: D_CLOSED });
    locations.set('3,1', { typ: DRAWBRIDGE_UP, drawbridgemask: DB_ICE });
    locations.set('4,1', { typ: DRAWBRIDGE_UP, drawbridgemask: DB_MOAT });

    assert.equal(accessible(1, 1, state), true);
    assert.equal(accessible(2, 1, state), false);
    assert.equal(accessible(3, 1, state), true);
    assert.equal(accessible(4, 1, state), false);
});

test('can_ooze preserves the source inventory-width whitelist', () => {
    const { state } = makeState();
    const monster = newMonster({ data: state.mons[PM_FOG_CLOUD] });

    assert.equal(can_ooze(monster, state), true);
    assert.equal(can_ooze(ordinaryMonster(state), state), false);

    monster.minvent = objectFor(state, DAGGER);
    assert.equal(can_ooze(monster, state), true);

    monster.minvent = objectFor(state, LONG_SWORD);
    assert.equal(can_ooze(monster, state), false);

    const sack = objectFor(state, SACK);
    sack.cobj = objectFor(state, DAGGER);
    monster.minvent = sack;
    assert.equal(can_ooze(monster, state), false);

    // monmove.c tests the generic coin otyp and rejects quantities above 100.
    monster.minvent = objectFor(state, COIN_CLASS, { quan: 101 });
    assert.equal(can_ooze(monster, state), false);
});

test('can_fog checks vampire form, genocide, protection, and inventory', () => {
    const { state } = makeState();
    const monster = newMonster({
        cham: PM_VAMPIRE_LEADER,
        data: state.mons[PM_VAMPIRE_LEADER],
    });

    assert.equal(can_fog(monster, state), true);

    state.mvitals[PM_FOG_CLOUD].mvflags |= G_GENOD;
    assert.equal(can_fog(monster, state), false);
    state.mvitals[PM_FOG_CLOUD].mvflags &= ~G_GENOD;

    state.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 1;
    assert.equal(can_fog(monster, state), false);
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 0;

    monster.minvent = objectFor(state, LONG_SWORD);
    assert.equal(can_fog(monster, state), false);

    monster.minvent = null;
    monster.cham = 0;
    assert.equal(can_fog(monster, state), false);
});

test('sengr_at preserves strict, timing, headstone, and case rules', () => {
    const { state } = makeState();
    state.moves = 20;
    const engraving = make_engr_at(
        10,
        10,
        'Elbereth',
        'Elbereth',
        19, // Already complete on the current source turn.
        DUST,
        { state },
    );

    assert.equal(sengr_at('elbereth', 10, 10, true, state), engraving);
    assert.equal(sengr_at('beret', 10, 10, true, state), null);
    assert.equal(sengr_at('beret', 10, 10, false, state), engraving);

    engraving.engr_time = 21; // Completion lies one turn in the future.
    assert.equal(sengr_at('Elbereth', 10, 10, true, state), null);
    engraving.engr_time = 19;
    engraving.engr_type = HEADSTONE;
    assert.equal(sengr_at('Elbereth', 10, 10, true, state), null);
});

test('onscary applies immunity before auditory and map-based scares', () => {
    const { state } = makeState();
    const ordinary = ordinaryMonster(state);
    assert.equal(onscary(0, 0, ordinary, state), true);

    ordinary.iswiz = true;
    assert.equal(onscary(0, 0, ordinary, state), false);

    const angel = newMonster({ data: state.mons[PM_ANGEL] });
    assert.equal(onscary(0, 0, angel, state), false);

    const human = newMonster({ data: state.mons[PM_HUMAN] });
    assert.equal(onscary(10, 10, human, state), false);
});

test('onscary recognizes vampire altars and scare-monster scrolls', () => {
    const { locations, state } = makeState();
    locations.set('6,6', { typ: ALTAR, flags: AM_LAWFUL });
    const vampire = newMonster({
        data: state.mons[PM_VAMPIRE_LEADER],
        cham: PM_VAMPIRE_LEADER,
    });
    assert.equal(onscary(6, 6, vampire, state), true);

    state.level.objects[7][7] = objectFor(state, SCR_SCARE_MONSTER);
    assert.equal(onscary(7, 7, ordinaryMonster(state), state), true);
});

test('onscary requires an active whole Elbereth and an eligible monster', () => {
    const { state } = makeState();
    state.moves = 20;
    make_engr_at(
        state.u.ux,
        state.u.uy,
        'Elbereth',
        'Elbereth',
        19, // The engraving is complete before this movement phase.
        DUST,
        { state },
    );
    const monster = ordinaryMonster(state, { mcansee: true });

    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), true);
    monster.mpeaceful = true;
    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), false);

    monster.mpeaceful = false;
    state.head_engr.engr_txt[0] = 'Elbereth Elbereth';
    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), false);
});

test('in_your_sanctuary validates room, priest, shrine, and alignment', () => {
    const baseline = sanctuaryFixture();
    assert.equal(in_your_sanctuary(
        baseline.monster,
        0,
        0,
        baseline.state,
    ), true);
    assert.equal(in_your_sanctuary(null, 6, 6, baseline.state), true);

    for (const [name, invalidate] of [
        ['alignment record', ({ state }) => { state.u.ualign.record = -4; }],
        ['occupied temple', ({ state }) => { state.u.urooms[0] = 0; }],
        ['target room', ({ locations }) => {
            locations.set('6,6', { typ: ROOM, flags: 0, roomno: 0 });
        }],
        ['priest lookup', ({ state }) => { state.level.monlist = null; }],
        ['shrine', ({ locations, roomNumber }) => {
            locations.set('8,8', {
                typ: ALTAR,
                flags: AM_LAWFUL,
                roomno: roomNumber,
            });
        }],
        ['coalignment', ({ state }) => {
            state.u.ualign.type = A_NEUTRAL;
        }],
        ['peaceful priest', ({ priest }) => { priest.mpeaceful = false; }],
    ]) {
        const fixture = sanctuaryFixture();
        invalidate(fixture);
        assert.equal(in_your_sanctuary(
            fixture.monster,
            0,
            0,
            fixture.state,
        ), false, name);
    }

    for (const [name, pmidx] of [
        ['minion', PM_ANGEL],
        ['rider', PM_DEATH],
    ]) {
        const fixture = sanctuaryFixture();
        const immune = newMonster({
            data: fixture.state.mons[pmidx],
            mnum: pmidx,
            mx: 6,
            my: 6,
        });
        assert.equal(in_your_sanctuary(
            immune,
            0,
            0,
            fixture.state,
        ), false, name);
    }
});

test('monnear excludes only grid-bug diagonal adjacency', () => {
    const { state } = makeState();
    const ordinary = ordinaryMonster(state, { mx: 5, my: 5 });
    const gridBug = newMonster({
        data: state.mons[PM_GRID_BUG],
        mnum: PM_GRID_BUG,
        mx: 5,
        my: 5,
    });

    assert.equal(monnear(ordinary, 6, 6, state), true);
    assert.equal(monnear(gridBug, 6, 6, state), false);
    assert.equal(monnear(gridBug, 6, 5, state), true);
    assert.equal(monnear(ordinary, 7, 5, state), false);
});

test('disturb rejects unseen, distant, and stealth-shielded monsters drawlessly', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const noDraw = { rn2: () => assert.fail('rejected wake must not draw') };

    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => false,
    }), 0);

    monster.mx = 1;
    monster.my = 1;
    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => true,
    }), 0);

    monster.mx = 9;
    monster.my = 10;
    state.u.uprops[STEALTH].intrinsic = 1;
    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => true,
    }), 0);
    assert.equal(monster.msleeping, true);
});

test('disturb treats blocked Stealth as inactive without an Ettin draw', async () => {
    const { state } = makeState();
    state.u.uprops[STEALTH].intrinsic = 1;
    state.u.uprops[STEALTH].blocked = 1;
    const dog = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    assert.equal(await disturb(dog, {
        state,
        random: { rn2: () => assert.fail('blocked Stealth is inactive') },
        couldSee: () => true,
        wakeMessage() {},
    }), 1);

    const ettin = newMonster({
        data: state.mons[PM_ETTIN],
        mnum: PM_ETTIN,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const calls = [];
    assert.equal(await disturb(ettin, {
        state,
        random: sequenceRandom([0], calls),
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
    assert.deepEqual(calls, [7]);
});

test('disturb preserves Ettin and hard-sleeper random order', async () => {
    const { state } = makeState();
    state.u.uprops[STEALTH].intrinsic = 1;
    const ettin = newMonster({
        data: state.mons[PM_ETTIN],
        mnum: PM_ETTIN,
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const ettinCalls = [];

    assert.equal(await disturb(ettin, {
        state,
        random: sequenceRandom([1, 0], ettinCalls),
        couldSee: () => true,
        wakeMessage(candidate, hostile) {
            assert.equal(candidate.msleeping, true);
            assert.equal(hostile, true);
        },
    }), 1);
    assert.deepEqual(ettinCalls, [10, 7]);
    assert.equal(ettin.msleeping, false);

    state.u.uprops[STEALTH].intrinsic = 0;
    for (const pmidx of [PM_WOOD_NYMPH, PM_JABBERWOCK, PM_LEPRECHAUN]) {
        const hardSleeper = newMonster({
            data: state.mons[pmidx],
            mnum: pmidx,
            mx: 9,
            my: 10,
            msleeping: true,
        });
        const calls = [];
        assert.equal(await disturb(hardSleeper, {
            state,
            random: sequenceRandom([1], calls),
            couldSee: () => true,
            wakeMessage: () => assert.fail('failed rare wake stays asleep'),
        }), 0);
        assert.deepEqual(calls, [50]);
        assert.equal(hardSleeper.msleeping, true);
    }

    const nymph = newMonster({
        data: state.mons[PM_WOOD_NYMPH],
        mnum: PM_WOOD_NYMPH,
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const nymphCalls = [];
    assert.equal(await disturb(nymph, {
        state,
        random: sequenceRandom([0, 0], nymphCalls),
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
    assert.deepEqual(nymphCalls, [50, 7]);
});

test('disturb lets dogs and aggravation bypass the final random draw', async () => {
    const { state } = makeState();
    const dog = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        mpeaceful: true,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const noDraw = { rn2: () => assert.fail('readily awakened without draw') };
    let dogHostile;

    assert.equal(await disturb(dog, {
        state,
        random: noDraw,
        couldSee: () => true,
        wakeMessage(_candidate, hostile) {
            dogHostile = hostile;
        },
    }), 1);
    assert.equal(dogHostile, false);

    const ordinary = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        msleeping: true,
    });
    state.u.uprops[AGGRAVATE_MONSTER].extrinsic = 1;
    assert.equal(await disturb(ordinary, {
        state,
        random: noDraw,
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
});

test('disturb draws before rejecting a concealed ordinary monster', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        m_ap_type: M_AP_OBJECT,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const calls = [];

    assert.equal(await disturb(monster, {
        state,
        random: sequenceRandom([0], calls),
        couldSee: () => true,
        wakeMessage: () => assert.fail('concealed monster stays asleep'),
    }), 0);
    assert.deepEqual(calls, [7]);
    assert.equal(monster.msleeping, true);
});

test('disturb preflights wake-message ownership before consuming randomness', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        msleeping: true,
        mx: 9,
        my: 10,
    });

    await assert.rejects(disturb(monster, {
        state,
        random: { rn2: () => assert.fail('missing wake owner preflights') },
        couldSee: () => true,
    }), /wakeMessage/);
    assert.equal(monster.msleeping, true);
});

test('disturb keeps sleep state behind the asynchronous wake owner', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const wake = deferred();
    let settled = false;
    const pending = disturb(monster, {
        state,
        random: { rn2: () => assert.fail('dogs wake without a draw') },
        couldSee: () => true,
        wakeMessage: () => wake.promise,
    });
    pending.then(() => { settled = true; });

    assert.equal(monster.msleeping, true);
    await Promise.resolve();
    assert.equal(settled, false);
    wake.resolve();
    assert.equal(await pending, 1);
    assert.equal(monster.msleeping, false);
    assert.equal(settled, true);
});

test('monflee preserves timer extension, untimed fear, and first-call rules', async () => {
    const { state } = makeState();
    const fresh = ordinaryMonster(state, {
        mhp: 5,
        mtrack: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });
    await monflee(fresh, 1, true, false, { state });
    assert.equal(fresh.mflee, true);
    assert.equal(fresh.mfleetim, 2);
    assert.deepEqual(fresh.mtrack, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);

    const timed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 120,
    });
    await monflee(timed, 20, false, false, { state });
    assert.equal(timed.mfleetim, 127);

    const newlyUntimed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 9,
    });
    await monflee(newlyUntimed, 0, false, false, { state });
    assert.equal(newlyUntimed.mfleetim, 0);

    const untimed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 0,
    });
    await monflee(untimed, 20, false, false, { state });
    assert.equal(untimed.mfleetim, 0);

    const alreadyFleeing = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 9,
        mtrack: [{ x: 6, y: 7 }, { x: 8, y: 9 }],
    });
    await monflee(alreadyFleeing, 20, true, false, { state });
    assert.equal(alreadyFleeing.mfleetim, 9);
    assert.deepEqual(alreadyFleeing.mtrack, [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ]);
});

test('monflee releases the hero before timing and emits before setting mflee', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: true,
        mfleetim: 0,
    });
    state.u.ustuck = monster;
    const events = [];

    await monflee(monster, 1, true, true, {
        state,
        random: {
            rn2: () => assert.fail('ordinary flight message must not draw'),
        },
        couldSee: () => true,
        releaseHero(candidate) {
            events.push(`release:${candidate.mfleetim}`);
            state.u.ustuck = null;
        },
        canSeeMonster(candidate) {
            events.push(`see:${candidate.mfleetim}:${candidate.mflee}`);
            return true;
        },
        fleesLight(candidate) {
            events.push(`light:${candidate.mflee}`);
            return false;
        },
        fleeMessage(candidate, message) {
            events.push(`message:${message.kind}:${candidate.mflee}`);
        },
    });

    assert.deepEqual(events, [
        'release:0',
        'see:2:false',
        'light:false',
        'message:turns-to-flee:false',
    ]);
    assert.equal(monster.mflee, true);
});

test('monflee awaits release, message, and gas owners before later state', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mcanmove: true,
        mflee: false,
        mfleetim: 0,
        mspec_used: 0,
        mtrack: [{ x: 2, y: 3 }],
        mx: 6,
        my: 7,
    });
    state.u.ustuck = monster;
    const release = deferred();
    const message = deferred();
    const messageStarted = deferred();
    const gas = deferred();
    const gasStarted = deferred();
    const events = [];

    const pending = monflee(monster, 1, true, true, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 25);
                return 9;
            },
        },
        couldSee: () => true,
        async releaseHero() {
            events.push('release:start');
            await release.promise;
            state.u.ustuck = null;
            events.push('release:end');
        },
        canSeeMonster: () => true,
        fleesLight: () => false,
        async fleeMessage() {
            events.push('message:start');
            messageStarted.resolve();
            await message.promise;
            events.push('message:end');
        },
        async createGasCloud() {
            events.push('gas:start');
            gasStarted.resolve();
            await gas.promise;
            events.push('gas:end');
        },
    });

    assert.deepEqual(events, ['release:start']);
    assert.equal(monster.mfleetim, 0);
    assert.equal(monster.mflee, false);

    release.resolve();
    await messageStarted.promise;
    assert.equal(monster.mfleetim, 2);
    assert.equal(monster.mflee, false);
    assert.deepEqual(monster.mtrack, [{ x: 2, y: 3 }]);

    message.resolve();
    await gasStarted.promise;
    assert.equal(monster.mspec_used, 84);
    assert.equal(monster.mflee, false);
    assert.deepEqual(monster.mtrack, [{ x: 2, y: 3 }]);

    gas.resolve();
    await pending;
    assert.equal(monster.mflee, true);
    assert.deepEqual(monster.mtrack, [{ x: 0, y: 0 }]);
    assert.deepEqual(events, [
        'release:start',
        'release:end',
        'message:start',
        'message:end',
        'rn2(25)',
        'gas:start',
        'gas:end',
    ]);
});

test('monflee uses the immobile message before testing emitted light', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: false,
    });
    let message;

    await monflee(monster, 0, true, true, {
        state,
        random: { rn2: () => assert.fail('immobile flight does not draw') },
        couldSee: () => assert.fail('immobile flight skips light checks'),
        canSeeMonster: () => true,
        fleesLight: () => assert.fail('immobile branch precedes light'),
        fleeMessage(_candidate, selected) {
            message = selected;
        },
    });

    assert.deepEqual(message, { kind: 'immobile-flinch' });
    assert.equal(monster.mflee, true);
});

test('monflee checks visibility before concealed appearance suppression', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: true,
        m_ap_type: M_AP_OBJECT,
    });
    const events = [];

    await monflee(monster, 0, true, true, {
        state,
        random: { rn2: () => assert.fail('concealed flight does not draw') },
        couldSee: () => assert.fail('concealed flight skips light checks'),
        canSeeMonster() {
            events.push('see');
            return true;
        },
        fleesLight: () => assert.fail('appearance gate precedes light'),
        fleeMessage: () => assert.fail('concealed monster has no message'),
    });

    assert.deepEqual(events, ['see']);
    assert.equal(monster.mflee, true);
});

test('monflee selects every light-flight message in source order', async () => {
    const { state } = makeState();
    const sword = {
        otyp: LONG_SWORD,
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: 0,
    };
    state.uwep = sword;

    async function lightMessage(overrides = {}, roll = null) {
        const monster = newMonster({
            data: state.mons[PM_GREMLIN],
            mnum: PM_GREMLIN,
            mhp: 5,
            mcanmove: true,
            mcansee: true,
            mx: 4,
            my: 4,
            ...overrides,
        });
        const calls = [];
        let message;
        await monflee(monster, 0, true, true, {
            state,
            random: {
                rn2(bound) {
                    calls.push(bound);
                    if (roll == null) assert.fail('unaware hero must not draw');
                    return roll;
                },
            },
            couldSee: () => true,
            canSeeMonster: () => true,
            fleeMessage(_candidate, selected) {
                message = selected;
            },
        });
        return { calls, message };
    }

    state.multi = -1;
    state.u.usleep = 1;
    assert.deepEqual(await lightMessage(), {
        calls: [],
        message: { kind: 'frightened' },
    });

    state.u.usleep = 0;
    state.u.uhs = FAINTED;
    assert.deepEqual(await lightMessage(), {
        calls: [],
        message: { kind: 'frightened' },
    });

    state.multi = 0;
    state.u.uhs = 0;
    assert.deepEqual(await lightMessage({}, 0), {
        calls: [10],
        message: { kind: 'bright-light' },
    });

    state.u.uprops[DEAF].intrinsic = 1;
    assert.deepEqual(await lightMessage({}, 0), {
        calls: [10],
        message: { kind: 'painful-light', lightSource: sword },
    });

    state.u.uprops[DEAF].intrinsic = 0;
    sword.lamplit = false;
    state.uarm = {
        otyp: GOLD_DRAGON_SCALE_MAIL,
        lamplit: true,
        owornmask: W_ARM,
    };
    const sourceQuirk = await lightMessage({}, 1);
    assert.deepEqual(sourceQuirk.calls, [10]);
    assert.equal(sourceQuirk.message.kind, 'painful-light');
    // Source naming prefers an artifact weapon even when the armor supplied
    // the actual visible light for this branch.
    assert.equal(sourceQuirk.message.lightSource, sword);
});

test('monflee gives a newly fleeing Vrock its gas cooldown before the cloud', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mx: 6,
        my: 7,
        mtrack: [{ x: 2, y: 3 }],
    });
    const events = [];

    await monflee(monster, 0, true, false, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 25);
                return 9;
            },
        },
        createGasCloud(x, y, radius, damage) {
            events.push(`gas:${x},${y},${radius},${damage}`);
            assert.equal(monster.mspec_used, 84);
            assert.equal(monster.mflee, false);
        },
    });

    assert.deepEqual(events, ['rn2(25)', 'gas:6,7,5,8']);
    assert.equal(monster.mspec_used, 84);
    assert.equal(monster.mflee, true);
    assert.deepEqual(monster.mtrack, [{ x: 0, y: 0 }]);
});

test('monflee preflights downstream ownership and ignores dead monsters', async () => {
    const { state } = makeState();
    const dead = ordinaryMonster(state, {
        mhp: 0,
        mtrack: [{ x: 1, y: 2 }],
    });
    await monflee(dead, 5, true, true, {
        get state() {
            assert.fail('dead monsters return before environment access');
        },
    });
    assert.deepEqual(dead.mtrack, [{ x: 1, y: 2 }]);

    const stuck = ordinaryMonster(state, {
        mhp: 5,
        mfleetim: 6,
        mtrack: [{ x: 1, y: 2 }],
    });
    state.u.ustuck = stuck;
    await assert.rejects(
        monflee(stuck, 5, true, false, { state }),
        /releaseHero/,
    );
    assert.equal(stuck.mfleetim, 6);
    assert.deepEqual(stuck.mtrack, [{ x: 1, y: 2 }]);

    state.u.ustuck = null;
    const visible = ordinaryMonster(state, { mhp: 5, mfleetim: 6 });
    await assert.rejects(
        monflee(visible, 5, true, true, { state }),
        /canSeeMonster/,
    );
    assert.equal(visible.mfleetim, 6);

    const vrock = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mfleetim: 6,
    });
    await assert.rejects(
        monflee(vrock, 5, true, false, {
            state,
            random: { rn2: () => assert.fail('missing gas owner preflights') },
        }),
        /createGasCloud/,
    );
    assert.equal(vrock.mfleetim, 6);
    assert.equal(vrock.mspec_used, 0);
});

test('distfleeck always draws brave-gremlin before checking a far monster', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 1,
        my: 1,
        mux: 10,
        muy: 10,
    });
    const events = [];

    const result = await distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                return 1;
            },
            rnd: () => assert.fail('a far monster does not flee'),
        },
        onScary() {
            events.push('onscary');
            return false;
        },
        fleesLight: () => assert.fail('nearby gate comes first'),
        inYourSanctuary: () => assert.fail('nearby gate comes first'),
        monFlee: () => assert.fail('a far monster does not flee'),
    });

    assert.deepEqual(events, ['rn2(5)', 'onscary']);
    assert.deepEqual(result, { inrange: false, nearby: false, scared: false });
});

test('distfleeck validates its action owner before consuming randomness', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);

    await assert.rejects(
        distfleeck(monster, {
            state,
            random: {
                rn2: () => assert.fail('missing monFlee must preflight'),
                rnd: () => assert.fail('missing monFlee must preflight'),
            },
        }),
        /requires a monFlee operation/,
    );
});

test('distfleeck preserves scare duration draws and monflee arguments', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        mux: 10,
        muy: 10,
    });
    const events = [];

    const result = await distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                // The rn2(7) result selects the ten-turn rnd bound.
                return bound === 7 ? 1 : 2;
            },
            rnd(bound) {
                events.push(`rnd(${bound})`);
                return 6; // Representative non-edge flee duration.
            },
        },
        onScary() {
            events.push('onscary');
            return true;
        },
        fleesLight: () => assert.fail('a seen scare short-circuits light'),
        inYourSanctuary: () => assert.fail('a seen scare short-circuits temple'),
        async monFlee(candidate, duration, first, message) {
            events.push(`monflee(${duration},${first},${message})`);
            assert.equal(candidate, monster);
        },
    });

    assert.deepEqual(events, [
        'rn2(5)',
        'onscary',
        'rn2(7)',
        'rnd(10)',
        'monflee(6,true,true)',
    ]);
    assert.deepEqual(result, { inrange: true, nearby: true, scared: true });
});

test('distfleeck awaits the asynchronous flee owner before returning', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        mux: 10,
        muy: 10,
    });
    const flee = deferred();
    const fleeStarted = deferred();
    let settled = false;
    const pending = distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                assert.ok(bound === 5 || bound === 7);
                return 1;
            },
            rnd(bound) {
                assert.equal(bound, 10);
                return 6;
            },
        },
        onScary: () => true,
        fleesLight: () => assert.fail('scary square short-circuits light'),
        inYourSanctuary: () => assert.fail('scary square short-circuits temple'),
        async monFlee() {
            fleeStarted.resolve();
            await flee.promise;
        },
    });
    pending.then(() => { settled = true; });

    await fleeStarted.promise;
    await Promise.resolve();
    assert.equal(settled, false);
    flee.resolve();
    assert.deepEqual(await pending, {
        inrange: true,
        nearby: true,
        scared: true,
    });
    assert.equal(settled, true);
});

test('distfleeck independently recognizes light and sanctuary fear', async () => {
    async function runCause({ brave, light, peaceful, sanctuary }) {
        const { state } = makeState();
        const monster = ordinaryMonster(state, {
            mpeaceful: peaceful,
            mx: 9,
            my: 10,
            mux: 10,
            muy: 10,
        });
        const events = [];
        const result = await distfleeck(monster, {
            state,
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    if (bound === 5) return brave ? 0 : 1;
                    assert.equal(bound, 7);
                    return 1;
                },
                rnd(bound) {
                    events.push(`rnd(${bound})`);
                    return 6;
                },
            },
            onScary() {
                events.push('onscary');
                return false;
            },
            fleesLight() {
                events.push('light');
                return light;
            },
            inYourSanctuary() {
                events.push('sanctuary');
                return sanctuary;
            },
            monFlee(candidate, duration, first, message) {
                events.push(`monflee(${duration},${first},${message})`);
                assert.equal(candidate, monster);
            },
        });
        return { events, result };
    }

    assert.deepEqual(await runCause({
        brave: false,
        light: true,
        peaceful: false,
        sanctuary: false,
    }), {
        events: [
            'rn2(5)',
            'onscary',
            'light',
            'rn2(7)',
            'rnd(10)',
            'monflee(6,true,true)',
        ],
        result: { inrange: true, nearby: true, scared: true },
    });
    assert.deepEqual(await runCause({
        brave: true,
        light: true,
        peaceful: true,
        sanctuary: false,
    }), {
        events: ['rn2(5)', 'onscary', 'light'],
        result: { inrange: true, nearby: true, scared: false },
    });
    assert.deepEqual(await runCause({
        brave: false,
        light: false,
        peaceful: false,
        sanctuary: true,
    }), {
        events: [
            'rn2(5)',
            'onscary',
            'light',
            'sanctuary',
            'rn2(7)',
            'rnd(10)',
            'monflee(6,true,true)',
        ],
        result: { inrange: true, nearby: true, scared: true },
    });
});

test('distfleeck checks an invisible hero at the guessed square', async () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, {
        mpeaceful: true,
        mx: 8,
        my: 8,
        mux: 9,
        muy: 9,
        mcansee: true,
    });
    const checked = [];

    const result = await distfleeck(monster, {
        state,
        random: { rn2: () => 1, rnd: () => assert.fail('not scared') },
        onScary(x, y) {
            checked.push([x, y]);
            return false;
        },
        fleesLight: () => false,
        monFlee: () => assert.fail('not scared'),
    });

    assert.deepEqual(checked, [[monster.mux, monster.muy]]);
    assert.deepEqual(result, { inrange: true, nearby: true, scared: false });
});
