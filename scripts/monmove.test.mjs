import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    A_LAWFUL,
    AM_LAWFUL,
    AM_SHRINE,
    COLNO,
    DB_ICE,
    DB_MOAT,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_CLOSED,
    DUST,
    G_GENOD,
    HEADSTONE,
    INVIS,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    TEMPLE,
} from '../js/const.js';
import { make_engr_at, sengr_at } from '../js/engrave.js';
import {
    accessible,
    can_fog,
    can_ooze,
    distfleeck,
    in_your_sanctuary,
    monnear,
    onscary,
    set_apparxy,
} from '../js/monmove.js';
import {
    PM_ANGEL,
    PM_FOG_CLOUD,
    PM_GIANT_RAT,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_VAMPIRE_LEADER,
    PM_XORN,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    COIN_CLASS,
    DAGGER,
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
    const monster = ordinaryMonster(state, { mx: 6, my: 6 });

    assert.equal(in_your_sanctuary(monster, 0, 0, state), true);
    state.u.ualign.record = -4; // priest.c's sinned-or-worse cutoff.
    assert.equal(in_your_sanctuary(monster, 0, 0, state), false);
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
