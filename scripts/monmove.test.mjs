import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    AGGRAVATE_MONSTER,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TRAPS,
    ALLOW_TM,
    ALLOW_U,
    ALLOW_WALL,
    ALTAR,
    A_LAWFUL,
    A_NEUTRAL,
    AM_LAWFUL,
    AM_SHRINE,
    ARROW_TRAP,
    BEAR_TRAP,
    BUSTDOOR,
    COLNO,
    CONFLICT,
    DB_ICE,
    DB_MOAT,
    DEAF,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    DUST,
    FAINTED,
    G_GENOD,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    INVIS,
    LAVAPOOL,
    LAVAWALL,
    M_AP_OBJECT,
    NOGARLIC,
    NOTONL,
    OPENDOOR,
    PIT,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    RUST_TRAP,
    SLP_GAS_TRAP,
    STEALTH,
    STONE,
    TELEP_TRAP,
    TEMPLE,
    TREE,
    UNLOCKDOOR,
    WATER,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_ARM,
} from '../js/const.js';
import { make_engr_at, sengr_at } from '../js/engrave.js';
import { online2 } from '../js/hacklib.js';
import { create_region } from '../js/region.js';
import {
    accessible,
    bad_rock,
    can_fog,
    can_ooze,
    dochugw,
    distfleeck,
    disturb,
    in_your_sanctuary,
    m_can_break_boulder,
    m_everyturn_effect,
    m_harmless_trap,
    m_in_air,
    may_dig,
    may_passwall,
    mfndpos,
    mon_allowflags,
    monhaskey,
    monflee,
    monnear,
    onscary,
    set_apparxy,
} from '../js/monmove.js';
import {
    M1_CLING,
    M1_NEEDPICK,
    M1_TUNNEL,
    MS_LEADER,
    PM_AMOROUS_DEMON,
    PM_ANGEL,
    PM_DEATH,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_FLOATING_EYE,
    PM_ETTIN,
    PM_GIANT_RAT,
    PM_GIANT_EEL,
    PM_GHOST,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HILL_GIANT,
    PM_HUMAN,
    PM_HUMAN_ZOMBIE,
    PM_IRON_GOLEM,
    PM_JABBERWOCK,
    PM_LEPRECHAUN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_MINOTAUR,
    PM_PURPLE_WORM,
    PM_SALAMANDER,
    PM_SHRIEKER,
    PM_VAMPIRE_LEADER,
    PM_VROCK,
    PM_WHITE_UNICORN,
    PM_WOOD_NYMPH,
    PM_XORN,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    COIN_CLASS,
    AXE,
    BOULDER,
    CLOVE_OF_GARLIC,
    CREDIT_CARD,
    DAGGER,
    GOLD_DRAGON_SCALE_MAIL,
    LONG_SWORD,
    LOCK_PICK,
    SACK,
    SCR_SCARE_MONSTER,
    SKELETON_KEY,
    objects_globals_init,
} from '../js/objects.js';
import { S_poisoncloud } from '../js/symbols.js';

function makeState() {
    const locations = new Map();
    const floorObjects = Array.from(
        { length: COLNO },
        () => Array(ROWNO).fill(null),
    );
    const floorMonsters = Array.from(
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
    uprops[HALLUC] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
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
            flags: {
                arboreal: false,
                has_temple: false,
                sokoban_rules: false,
            },
            monlist: null,
            monsters: floorMonsters,
            objects: floorObjects,
            regions: [],
            rooms: [],
            traps: [],
            worms: [],
            at(x, y) {
                return locations.get(`${x},${y}`) ?? { typ: ROOM, flags: 0 };
            },
        },
        track: {
            utcnt: 0,
            utpnt: 0,
            utrack: [],
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

function sealNeighborhood(locations, x, y) {
    for (let nx = x - 1; nx <= x + 1; ++nx) {
        for (let ny = y - 1; ny <= y + 1; ++ny) {
            if (nx === x && ny === y) continue;
            locations.set(`${nx},${ny}`, {
                typ: STONE,
                flags: 0,
                wall_info: W_NONDIGGABLE | W_NONPASSWALL,
            });
        }
    }
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

test('monhaskey distinguishes credit-card unlocking from locking tools', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);

    monster.minvent = objectFor(state, CREDIT_CARD);
    assert.equal(monhaskey(monster, true, state), true);
    assert.equal(monhaskey(monster, false, state), false);

    monster.minvent = objectFor(state, SKELETON_KEY);
    assert.equal(monhaskey(monster, false, state), true);
    monster.minvent = objectFor(state, LOCK_PICK);
    assert.equal(monhaskey(monster, false, state), true);
});

test('m_everyturn_effect creates only unobstructed missing fog clouds', async () => {
    const { locations, state } = makeState();
    const ordinary = ordinaryMonster(state);
    await m_everyturn_effect(ordinary, { state });

    const fog = newMonster({
        data: state.mons[PM_FOG_CLOUD],
        mnum: PM_FOG_CLOUD,
        mx: 4,
        my: 4,
    });
    await assert.rejects(
        m_everyturn_effect(fog, { state }),
        /createGasCloud/,
    );

    const calls = [];
    const env = {
        state,
        createGasCloud(x, y, radius, damage) {
            calls.push({ x, y, radius, damage });
        },
    };
    await m_everyturn_effect(fog, env);
    assert.deepEqual(calls, [{ x: 4, y: 4, radius: 1, damage: 0 }]);

    locations.set('4,4', { typ: DOOR, flags: D_CLOSED, wall_info: 0 });
    await m_everyturn_effect(fog, env);
    assert.equal(calls.length, 1);

    locations.set('4,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const existing = create_region([{ lx: 4, ly: 4, hx: 4, hy: 4 }]);
    existing.visible = true;
    state.level.regions = [existing];
    await m_everyturn_effect(fog, env);
    assert.equal(calls.length, 1);

    state.youmonst.data = state.mons[PM_FOG_CLOUD];
    state.youmonst.mnum = PM_FOG_CLOUD;
    await m_everyturn_effect(state.youmonst, env);
    assert.deepEqual(calls.at(-1), {
        x: state.u.ux,
        y: state.u.uy,
        radius: 1,
        damage: 0,
    });
});

test('dochugw delegates movement and leaves an idle hero alone', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);
    const calls = [];

    assert.equal(await dochugw(monster, true, {
        state,
        async dochug(candidate) {
            calls.push(['dochug', candidate.mx, candidate.my]);
            candidate.mx = 5;
            return 2;
        },
        canSpotMonster: () => assert.fail('idle hero skips sensing'),
        couldSee: () => assert.fail('idle hero skips old visibility'),
        stopOccupation: () => assert.fail('idle hero has no occupation'),
    }), 2);
    assert.deepEqual(calls, [['dochug', 4, 4]]);

    assert.equal(await dochugw(monster, false, { state }), 0);
});

test('dochugw stops work for a newly nearby visible threat in source order', async () => {
    const { state } = makeState();
    state.occupation = () => {};
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mx: 1,
        my: 1,
    });
    const calls = [];
    const stop = deferred();

    const result = dochugw(monster, true, {
        state,
        canSpotMonster(candidate) {
            calls.push(['spot', candidate.mx, candidate.my]);
            return true;
        },
        async dochug(candidate) {
            calls.push(['dochug', candidate.mx, candidate.my]);
            candidate.mx = 9;
            candidate.my = 10;
            return 0;
        },
        couldSee(x, y) {
            calls.push(['couldSee', x, y]);
            return true;
        },
        async stopOccupation() {
            calls.push(['stop']);
            await stop.promise;
        },
    });

    await Promise.resolve();
    assert.deepEqual(calls, [
        ['spot', 1, 1],
        ['dochug', 1, 1],
        ['couldSee', 1, 1],
        ['spot', 9, 10],
        ['couldSee', 9, 10],
        ['stop'],
    ]);
    let settled = false;
    result.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    stop.resolve();
    assert.equal(await result, 0);
});

test('dochugw hallucination bypasses hostility only without resistance', async () => {
    const { state } = makeState();
    state.occupation = () => {};
    state.u.uprops[HALLUC].intrinsic = 5;
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mpeaceful: true,
        mx: 9,
        my: 10,
    });
    let stops = 0;
    const env = {
        state,
        canSpotMonster: () => true,
        couldSee: () => true,
        stopOccupation() { ++stops; },
    };

    assert.equal(await dochugw(monster, false, env), 0);
    assert.equal(stops, 1);

    state.u.uprops[HALLUC_RES].extrinsic = 1;
    assert.equal(await dochugw(monster, false, env), 0);
    assert.equal(stops, 1);
});

test('dochugw rechecks occupation after the monster action', async () => {
    const { state } = makeState();
    state.occupation = () => {};
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mx: 9,
        my: 10,
    });

    assert.equal(await dochugw(monster, true, {
        state,
        canSpotMonster: () => true,
        couldSee: () => true,
        dochug() {
            state.occupation = null;
            return 0;
        },
        stopOccupation: () => assert.fail('action already stopped work'),
    }), 0);
});

test('dochugw retains every threat-interruption rejection gate', async () => {
    const cases = [
        ['action result', ({ env }) => { env.dochug = () => 1; }],
        ['peaceful', ({ context, monster }) => {
            context.chug = false;
            monster.mpeaceful = true;
        }],
        ['attackless', ({ context, monster }) => {
            context.chug = false;
            monster.data = { mattk: [] };
        }],
        ['too far', ({ context, monster }) => {
            context.chug = false;
            monster.mx = monster.my = 1;
        }],
        ['already visible nearby', () => {}],
        ['not spotted now', ({ env, monster }) => {
            monster.mx = monster.my = 1;
            env.dochug = (candidate) => {
                candidate.mx = 9;
                candidate.my = 10;
                return 0;
            };
            let spots = 0;
            env.canSpotMonster = () => ++spots === 1;
        }],
        ['not visible now', ({ env, monster }) => {
            monster.mx = monster.my = 1;
            env.dochug = (candidate) => {
                candidate.mx = 9;
                candidate.my = 10;
                return 0;
            };
            let visibilityChecks = 0;
            env.couldSee = () => ++visibilityChecks === 1;
        }],
        ['immobile', ({ context, monster }) => {
            context.chug = false;
            monster.mcanmove = false;
        }],
        ['scared', ({ context, state }) => {
            context.chug = false;
            state.level.objects[state.u.ux][state.u.uy] = objectFor(
                state,
                SCR_SCARE_MONSTER,
            );
        }],
    ];

    for (const [name, configure] of cases) {
        const { state } = makeState();
        state.occupation = () => {};
        const monster = ordinaryMonster(state, {
            mcanmove: true,
            mx: 9,
            my: 10,
        });
        let stops = 0;
        const context = { chug: true };
        const env = {
            state,
            dochug: () => 0,
            canSpotMonster: () => true,
            couldSee: () => true,
            stopOccupation() { ++stops; },
        };
        configure({ context, env, monster, state });

        assert.equal(
            await dochugw(monster, context.chug, env) >= 0,
            true,
            name,
        );
        assert.equal(stops, 0, name);
    }
});

test('dochugw preflights occupation owners before monster action', async () => {
    const { state } = makeState();
    state.occupation = () => {};
    const monster = ordinaryMonster(state);
    let actions = 0;
    const dochug = () => { ++actions; return 0; };

    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        stopOccupation() {},
    }), /canSpotMonster/);
    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        canSpotMonster: () => true,
    }), /stopOccupation/);
    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        canSpotMonster: () => true,
        couldSee: true,
        stopOccupation() {},
    }), /couldSee/);
    assert.equal(actions, 0);

    await assert.rejects(dochugw(monster, true, { state }), /dochug/);
    assert.equal(actions, 0);
});

test('m_can_break_boulder preserves rider and cooldown exceptions', () => {
    const { state } = makeState();
    const rider = newMonster({
        data: state.mons[PM_DEATH],
        mspec_used: 12,
    });
    assert.equal(m_can_break_boulder(rider), true);

    for (const overrides of [
        { isshk: true },
        { ispriest: true },
        { data: { ...state.mons[PM_HUMAN], msound: MS_LEADER } },
    ]) {
        const monster = ordinaryMonster(state, overrides);
        assert.equal(m_can_break_boulder(monster), true);
        monster.mspec_used = 1;
        assert.equal(m_can_break_boulder(monster), false);
    }
});

test('mon_allowflags combines disposition, doors, and species identity', () => {
    const { state } = makeState();
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mnum: PM_HUMAN,
        minvent: objectFor(state, SKELETON_KEY),
    });
    assert.equal(
        mon_allowflags(human, { state }),
        ALLOW_U | ALLOW_SSM | OPENDOOR | UNLOCKDOOR,
    );

    const tame = ordinaryMonster(state, { mtame: 5 });
    const disposition = ALLOW_U | ALLOW_M | ALLOW_TRAPS
        | ALLOW_SANCT | ALLOW_SSM;
    assert.equal(mon_allowflags(tame, { state }) & disposition,
        ALLOW_M | ALLOW_TRAPS | ALLOW_SANCT | ALLOW_SSM);

    const minotaur = newMonster({ data: state.mons[PM_MINOTAUR] });
    const minotaurFlags = mon_allowflags(minotaur, { state });
    assert.ok(minotaurFlags & ALLOW_SSM);
    const giant = newMonster({ data: state.mons[PM_HILL_GIANT] });
    assert.ok(mon_allowflags(giant, { state }) & BUSTDOOR);
});

test('mon_allowflags preserves tunnel distance and rogue-level rules', () => {
    const { state } = makeState();
    const species = {
        ...state.mons[PM_HUMAN],
        mflags1: state.mons[PM_HUMAN].mflags1 | M1_TUNNEL | M1_NEEDPICK,
    };
    const monster = newMonster({
        data: species,
        mx: 4,
        my: 4,
        mux: 5,
        muy: 5,
    });

    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), false);
    monster.mux = 10;
    monster.muy = 10;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), true);

    monster.mux = 5;
    monster.muy = 5;
    monster.mpeaceful = true;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), true);

    state.rogue_level = { ...state.u.uz };
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), false);
});

test('mon_allowflags retains terrain, bars, garlic, and unicorn clauses', () => {
    const { state } = makeState();
    const xorn = newMonster({ data: state.mons[PM_XORN] });
    let flags = mon_allowflags(xorn, { state });
    assert.ok(flags & ALLOW_ROCK);
    assert.ok(flags & ALLOW_WALL);
    assert.ok(flags & ALLOW_BARS);

    state.u.ustuck = xorn;
    state.youmonst.data = state.mons[PM_HUMAN];
    flags = mon_allowflags(xorn, { state });
    assert.equal(Boolean(flags & ALLOW_BARS), false);
    state.youmonst.data = state.mons[PM_FOG_CLOUD];
    flags = mon_allowflags(xorn, { state });
    assert.ok(flags & ALLOW_BARS);

    const zombie = newMonster({ data: state.mons[PM_HUMAN_ZOMBIE] });
    assert.ok(mon_allowflags(zombie, { state }) & NOGARLIC);
    const ghost = newMonster({ data: state.mons[PM_GHOST] });
    assert.equal(Boolean(mon_allowflags(ghost, { state }) & NOGARLIC), false);

    const unicorn = newMonster({ data: state.mons[PM_WHITE_UNICORN] });
    assert.ok(mon_allowflags(unicorn, { state }) & NOTONL);
    state.level.flags = { noteleport: true, stasis_until: 0 };
    assert.equal(Boolean(mon_allowflags(unicorn, { state }) & NOTONL), false);
});

test('mon_allowflags draws once for conflict resistance', () => {
    const { state } = makeState();
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.ulevel = 3;
    const peaceful = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 8,
        mpeaceful: true,
    });
    const bounds = [];

    let flags = mon_allowflags(peaceful, {
        state,
        random: {
            rnd(bound) {
                bounds.push(bound);
                return 5;
            },
        },
    });
    assert.ok(flags & ALLOW_U);
    assert.deepEqual(bounds, [20]);

    flags = mon_allowflags(peaceful, {
        state,
        random: { rnd: () => 6 },
    });
    assert.equal(Boolean(flags & ALLOW_U), false);

    const hostile = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 8,
        mpeaceful: false,
    });
    bounds.length = 0;
    flags = mon_allowflags(hostile, {
        state,
        random: {
            rnd(bound) {
                bounds.push(bound);
                return 19;
            },
        },
    });
    assert.ok(flags & ALLOW_U);
    assert.deepEqual(bounds, [20]);
});

test('mon_allowflags uses polymorphed Charisma for conflict resistance', () => {
    const { state } = makeState();
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    // Equal level 5 values cancel, so stored CHA 10 versus the form floor 18
    // alone decides whether a roll of 15 resists Conflict.
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.ulevel = 5;
    const peaceful = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 5,
        mpeaceful: true,
    });
    const env = { state, random: { rnd: () => 15 } };

    state.youmonst.data = state.mons[PM_HUMAN];
    state.u.umonnum = PM_HUMAN;
    assert.equal(Boolean(mon_allowflags(peaceful, env) & ALLOW_U), false);

    state.youmonst.data = state.mons[PM_WOOD_NYMPH];
    assert.ok(mon_allowflags(peaceful, env) & ALLOW_U);

    state.youmonst.data = state.mons[PM_HUMAN];
    state.u.umonnum = PM_AMOROUS_DEMON;
    assert.ok(mon_allowflags(peaceful, env) & ALLOW_U);
});

test('movement terrain helpers preserve walls, boulders, and ceilings', () => {
    const { locations, state } = makeState();
    locations.set('3,3', { typ: STONE, flags: 0, wall_info: 0 });
    assert.equal(may_dig(3, 3, state), true);
    assert.equal(may_passwall(3, 3, state), true);
    locations.get('3,3').wall_info = W_NONDIGGABLE | W_NONPASSWALL;
    assert.equal(may_dig(3, 3, state), false);
    assert.equal(may_passwall(3, 3, state), false);

    const human = state.mons[PM_HUMAN];
    assert.equal(bad_rock(human, 3, 3, state), true);
    locations.get('3,3').wall_info = 0;
    assert.equal(bad_rock(state.mons[PM_XORN], 3, 3, state), false);

    locations.set('6,6', { typ: ROOM, flags: 0, wall_info: 0 });
    state.level.flags.sokoban_rules = true;
    state.level.objects[6][6] = objectFor(state, BOULDER);
    assert.equal(bad_rock(human, 6, 6, state), true);

    const floater = newMonster({ data: state.mons[PM_FLOATING_EYE] });
    assert.equal(m_in_air(floater, state), true);
    const clinger = newMonster({
        data: { ...human, mflags1: human.mflags1 | M1_CLING },
        mundetected: true,
    });
    assert.equal(m_in_air(clinger, state), true);
    state.u.uz = { dnum: state.astral_level.dnum, dlevel: 1 };
    state.earth_level = { dnum: state.astral_level.dnum, dlevel: 2 };
    assert.equal(m_in_air(clinger, state), false);
});

test('m_harmless_trap keeps structural cases local to movement legality', () => {
    const { state } = makeState();
    const floater = newMonster({ data: state.mons[PM_FLOATING_EYE] });
    assert.equal(m_harmless_trap(floater, { ttyp: ARROW_TRAP }, { state }), true);

    const rat = ordinaryMonster(state);
    assert.equal(m_harmless_trap(rat, { ttyp: BEAR_TRAP }, { state }), true);
    const human = newMonster({ data: state.mons[PM_HUMAN] });
    assert.equal(m_harmless_trap(human, { ttyp: RUST_TRAP }, { state }), true);
    const ironGolem = newMonster({ data: state.mons[PM_IRON_GOLEM] });
    assert.equal(
        m_harmless_trap(ironGolem, { ttyp: RUST_TRAP }, { state }),
        false,
    );

    assert.throws(
        () => m_harmless_trap(human, { ttyp: SLP_GAS_TRAP }, { state }),
        /resistsTrapEffect/,
    );
    assert.equal(m_harmless_trap(human, { ttyp: SLP_GAS_TRAP }, {
        state,
        resistsTrapEffect: () => true,
    }), true);

    const clinger = newMonster({
        data: {
            ...state.mons[PM_HUMAN],
            mflags1: state.mons[PM_HUMAN].mflags1 | M1_CLING,
        },
    });
    assert.equal(m_harmless_trap(clinger, { ttyp: PIT }, { state }), true);

    state.level.flags.sokoban_rules = true;
    assert.equal(
        m_harmless_trap(floater, { ttyp: ARROW_TRAP }, { state }),
        false,
    );
    assert.equal(m_harmless_trap(clinger, { ttyp: PIT }, { state }), false);
});

test('online2 recognizes source rows, columns, and both diagonals', () => {
    const cases = [
        // Endpoints are separated enough to distinguish the four source lines.
        { from: [2, 4], to: [7, 4], expected: true },
        { from: [4, 2], to: [4, 7], expected: true },
        { from: [2, 2], to: [7, 7], expected: true },
        { from: [2, 7], to: [7, 2], expected: true },
        { from: [2, 2], to: [7, 6], expected: false },
    ];
    for (const { from, to, expected } of cases)
        assert.equal(online2(...from, ...to), expected);
});

test('mfndpos enumerates neighbors in source x-major order', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};

    assert.equal(mfndpos(monster, data, 0, {
        state,
        onScary: () => false,
    }), 8);
    assert.deepEqual(data.poss.slice(0, data.cnt), [
        { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 },
        { x: 4, y: 3 }, { x: 4, y: 5 },
        { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
    ]);

    const gridBug = newMonster({
        data: state.mons[PM_GRID_BUG],
        mnum: PM_GRID_BUG,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(gridBug, data, 0, {
        state,
        onScary: () => false,
    }), 4);
    assert.deepEqual(data.poss.slice(0, data.cnt), [
        { x: 3, y: 4 }, { x: 4, y: 3 },
        { x: 4, y: 5 }, { x: 5, y: 4 },
    ]);
});

test('mfndpos records scary squares and adjacent hero discovery', () => {
    const { state } = makeState();
    state.u.ux = 5;
    state.u.uy = 4;
    const monster = ordinaryMonster(state, {
        mux: 12,
        muy: 12,
        mcansee: true,
    });
    const data = {};
    const onScary = (x, y) => x === 3 && y === 4;

    assert.equal(mfndpos(monster, data, ALLOW_U, { state, onScary }), 7);
    assert.deepEqual([monster.mux, monster.muy], [5, 4]);
    const heroIndex = data.poss.findIndex(
        ({ x, y }) => x === state.u.ux && y === state.u.uy,
    );
    assert.ok(heroIndex >= 0);
    assert.ok(data.info[heroIndex] & ALLOW_U);

    assert.equal(mfndpos(monster, data, ALLOW_U | ALLOW_SSM, {
        state,
        onScary,
    }), 8);
    const scaryIndex = data.poss.findIndex(({ x, y }) => x === 3 && y === 4);
    assert.ok(data.info[scaryIndex] & ALLOW_SSM);
});

test('mfndpos remaps a displaced scary image to the real hero square', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    state.u.uprops[DISPLACED].intrinsic = 1;
    // The remembered image is adjacent at (3,4); the real hero remains at
    // makeState()'s distant (10,10), so the callback coordinate is decisive.
    const monster = ordinaryMonster(state, { mux: 3, muy: 4 });
    const checked = [];

    assert.equal(mfndpos(monster, {}, 0, {
        state,
        onScary(x, y) {
            checked.push([x, y]);
            return false;
        },
    }), 0);
    assert.deepEqual(checked, [[10, 10]]);
});

test('mfndpos reveals an adjacent hero before rejecting the square', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    state.u.ux = 3;
    state.u.uy = 4;
    const monster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const data = {};

    assert.equal(mfndpos(monster, data, 0, {
        state,
        onScary: () => false,
    }), 0);
    assert.deepEqual([monster.mux, monster.muy], [3, 4]);
    assert.equal(data.cnt, 0);
});

test('mfndpos reuses caller-owned fixed scratch buffers', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, 0, env), 8);
    const positions = data.poss;
    const positionEntries = [...data.poss];
    const info = data.info;
    const firstResult = data.poss.slice(0, data.cnt).map((position, index) => ({
        ...position,
        info: data.info[index],
    }));

    assert.equal(mfndpos(monster, data, 0, env), 8);
    assert.equal(data.poss, positions);
    assert.equal(data.info, info);
    for (let index = 0; index < positionEntries.length; ++index)
        assert.equal(data.poss[index], positionEntries[index]);
    assert.deepEqual(
        data.poss.slice(0, data.cnt).map((position, index) => ({
            ...position,
            info: data.info[index],
        })),
        firstResult,
    );
});

test('mfndpos rolls back partial output when trap resistance is unavailable', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('5,5', { typ: ROOM, flags: 0, wall_info: 0 });
    // x-major enumeration accepts the adjacent hero at (3,3) before reaching
    // the sleep trap at the last candidate, (5,5).
    state.u.ux = 3;
    state.u.uy = 3;
    state.level.traps = [{ tx: 5, ty: 5, ttyp: SLP_GAS_TRAP }];
    const monster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const positions = Array.from({ length: 9 }, (_, index) => ({
        x: 100 + index,
        y: 200 + index,
    }));
    const info = Array.from({ length: 9 }, (_, index) => 300 + index);
    const data = { cnt: 7, poss: positions, info };
    const before = {
        cnt: data.cnt,
        poss: data.poss.map((position) => ({ ...position })),
        info: [...data.info],
    };
    const env = { state, onScary: () => false };

    assert.throws(
        () => mfndpos(monster, data, ALLOW_U, env),
        /resistsTrapEffect/,
    );
    assert.deepEqual([monster.mux, monster.muy], [12, 12]);
    assert.equal(data.poss, positions);
    assert.equal(data.info, info);
    assert.deepEqual(data, before);

    const configured = {
        ...env,
        resistsTrapEffect: () => false,
    };
    const retryCount = mfndpos(monster, data, ALLOW_U, configured);
    const cleanMonster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const cleanData = {};
    const cleanCount = mfndpos(
        cleanMonster,
        cleanData,
        ALLOW_U,
        configured,
    );
    assert.equal(retryCount, cleanCount);
    assert.deepEqual(data.poss.slice(0, data.cnt),
        cleanData.poss.slice(0, cleanData.cnt));
    assert.deepEqual(data.info.slice(0, data.cnt),
        cleanData.info.slice(0, cleanData.cnt));
});

test('mfndpos applies door and digging tools before candidate metadata', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    const door = { typ: DOOR, flags: D_CLOSED, wall_info: 0 };
    locations.set('3,4', door);
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};

    assert.equal(mfndpos(human, data, 0, {
        state,
        onScary: () => false,
    }), 0);
    assert.equal(mfndpos(human, data, OPENDOOR, {
        state,
        onScary: () => false,
    }), 1);
    door.flags = D_LOCKED;
    assert.equal(mfndpos(human, data, OPENDOOR, {
        state,
        onScary: () => false,
    }), 0);
    assert.equal(mfndpos(human, data, UNLOCKDOOR, {
        state,
        onScary: () => false,
    }), 1);

    locations.set('3,4', { typ: TREE, flags: 0, wall_info: 0 });
    const tunneler = newMonster({
        data: {
            ...state.mons[PM_HUMAN],
            mflags1: state.mons[PM_HUMAN].mflags1
                | M1_TUNNEL | M1_NEEDPICK,
        },
        minvent: objectFor(state, AXE),
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(tunneler, data, ALLOW_DIG, {
        state,
        onScary: () => false,
    }), 1);
});

test('mfndpos preserves boulder, garlic, and trap information bits', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};
    const env = { state, onScary: () => false };

    state.level.objects[3][4] = objectFor(state, BOULDER);
    assert.equal(mfndpos(human, data, 0, env), 0);
    assert.equal(mfndpos(human, data, ALLOW_ROCK, env), 1);
    assert.ok(data.info[0] & ALLOW_ROCK);

    state.level.objects[3][4] = objectFor(state, CLOVE_OF_GARLIC);
    const zombie = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(zombie, data, NOGARLIC, env), 0);
    assert.equal(mfndpos(human, data, 0, env), 1);
    assert.ok(data.info[0] & NOGARLIC);

    state.level.objects[3][4] = null;
    state.level.traps = [{ tx: 3, ty: 4, ttyp: ARROW_TRAP }];
    human.mtrapseen = 1 << (ARROW_TRAP - 1);
    assert.equal(mfndpos(human, data, 0, env), 0);
    human.mtrapseen = 0;
    assert.equal(mfndpos(human, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_TRAPS);

    const floater = newMonster({
        data: state.mons[PM_FLOATING_EYE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(floater, data, 0, env), 1);
    assert.equal(Boolean(data.info[0] & ALLOW_TRAPS), false);
});

test('mfndpos applies monster aggression and displacement at occupancy', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const data = {};
    const env = { state, onScary: () => false };
    const attacker = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const defender = ordinaryMonster(state, {
        mx: 5,
        my: 4,
        m_lev: 1,
    });
    state.level.monsters[5][4] = defender;

    assert.equal(mfndpos(attacker, data, 0, env), 0);
    assert.equal(mfndpos(attacker, data, ALLOW_M, env), 1);
    assert.ok(data.info[0] & ALLOW_M);
    defender.mtame = 5;
    assert.equal(mfndpos(attacker, data, ALLOW_M, env), 0);
    assert.equal(mfndpos(attacker, data, ALLOW_M | ALLOW_TM, env), 1);
    assert.ok(data.info[0] & ALLOW_TM);

    attacker.data = state.mons[PM_PURPLE_WORM];
    attacker.mnum = PM_PURPLE_WORM;
    defender.data = state.mons[PM_SHRIEKER];
    defender.mnum = PM_SHRIEKER;
    defender.mtame = 0;
    assert.equal(mfndpos(attacker, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_M);

    attacker.data = state.mons[PM_DISPLACER_BEAST];
    attacker.mnum = PM_DISPLACER_BEAST;
    attacker.m_lev = 10;
    defender.data = state.mons[PM_GIANT_RAT];
    defender.mnum = PM_GIANT_RAT;
    assert.equal(mfndpos(attacker, data, ALLOW_MDISP, env), 1);
    assert.ok(data.info[0] & ALLOW_MDISP);
});

test('mfndpos clears inherited displacement permission across candidates', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const attacker = newMonster({
        data: state.mons[PM_DISPLACER_BEAST],
        mnum: PM_DISPLACER_BEAST,
        mx: 4,
        my: 4,
        m_lev: 10,
        mcansee: false,
    });
    const eligible = ordinaryMonster(state, { mx: 3, my: 3, m_lev: 1 });
    const trapped = ordinaryMonster(state, {
        mx: 3,
        my: 4,
        m_lev: 1,
        mtrapped: true,
    });
    state.level.monsters[3][3] = eligible;
    state.level.monsters[3][4] = trapped;
    const data = {};

    assert.equal(mfndpos(attacker, data, ALLOW_MDISP, {
        state,
        onScary: () => false,
    }), 1);
    assert.deepEqual(data.poss[0], { x: 3, y: 3 });
    assert.ok(data.info[0] & ALLOW_MDISP);
});

test('mfndpos applies zombie aggression and Wizard Tower partitioning', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const attacker = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mnum: PM_HUMAN_ZOMBIE,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const defender = newMonster({
        data: state.mons[PM_HUMAN],
        mnum: PM_HUMAN,
        mx: 5,
        my: 4,
    });
    state.level.monsters[5][4] = defender;
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(attacker, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_M);

    attacker.mgenmklev = true;
    defender.mgenmklev = true;
    assert.equal(mfndpos(attacker, data, 0, env), 0);

    attacker.mgenmklev = false;
    defender.mgenmklev = false;
    state.wiz1_level = { ...state.u.uz };
    // The hero and defender are outside this one-square tower boundary while
    // the attacker is inside, so cross-partition aggression is suppressed.
    state.dndest = { nlx: 4, nly: 4, nhx: 4, nhy: 4 };
    assert.equal(mfndpos(attacker, data, 0, env), 0);
});

test('mfndpos retries eel movement on land only when no pool is adjacent', () => {
    const { locations, state } = makeState();
    const eel = newMonster({
        data: state.mons[PM_GIANT_EEL],
        mnum: PM_GIANT_EEL,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(eel, data, 0, env), 8);
    locations.set('3,4', { typ: POOL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(eel, data, 0, env), 1);
    assert.deepEqual(data.poss[0], { x: 3, y: 4 });
});

test('mfndpos preserves water, lava-wall, and poison-cloud preferences', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    const data = {};
    const env = { state, onScary: () => false };
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });

    locations.set('3,4', { typ: WATER, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(human, data, 0, env), 0);
    const eel = newMonster({
        data: state.mons[PM_GIANT_EEL],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(eel, data, 0, env), 1);

    locations.set('3,4', { typ: LAVAPOOL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(human, data, 0, env), 0);
    const salamander = newMonster({
        data: state.mons[PM_SALAMANDER],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(salamander, data, 0, env), 1);
    locations.set('3,4', { typ: LAVAWALL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(salamander, data, 0, env), 0);
    assert.equal(mfndpos(salamander, data, ALLOW_WALL, env), 1);

    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const cloud = create_region([{ lx: 3, ly: 4, hx: 3, hy: 4 }]);
    cloud.visible = true;
    cloud.glyph = S_poisoncloud;
    state.level.regions = [cloud];
    assert.equal(mfndpos(human, data, 0, env), 0);
    const zombie = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(zombie, data, 0, env), 1);

    cloud.rects.push({ lx: 4, ly: 4, hx: 4, hy: 4 });
    cloud.bounding_box.hx = 4;
    assert.equal(mfndpos(human, data, 0, env), 1);
});

test('mfndpos blocks source diagonal door and worm crossings', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('4,4', { typ: DOOR, flags: D_CLOSED, wall_info: 0 });
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, 0, env), 0);
    locations.get('4,4').flags = D_BROKEN;
    assert.equal(mfndpos(monster, data, 0, env), 1);

    locations.set('4,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const giant = newMonster({
        data: state.mons[PM_HILL_GIANT],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(giant, data, 0, env), 0);

    const worm = newMonster({
        data: state.mons[PM_LONG_WORM],
        mnum: PM_LONG_WORM,
        wormno: 1,
    });
    state.level.monsters[3][4] = worm;
    state.level.monsters[4][3] = worm;
    state.level.worms[1] = {
        segments: [{ x: 3, y: 4 }, { x: 4, y: 3 }],
    };
    assert.equal(mfndpos(monster, data, 0, env), 0);

    state.level.worms[1].segments.splice(1, 0, { x: 2, y: 4 });
    assert.equal(mfndpos(monster, data, 0, env), 1);
});

test('mfndpos records line, sanctuary, and fixed-teleport constraints', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const monster = ordinaryMonster(state, {
        mcansee: true,
        mux: 8,
        muy: 4,
    });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, NOTONL, env), 0);
    assert.equal(mfndpos(monster, data, 0, env), 1);
    assert.ok(data.info[0] & NOTONL);

    monster.mcansee = false;
    const roomNumber = ROOMOFFSET;
    state.level.flags.has_temple = true;
    state.level.rooms[0] = { rtype: TEMPLE };
    locations.set('5,4', {
        typ: ROOM,
        flags: 0,
        wall_info: 0,
        roomno: roomNumber,
    });
    assert.equal(mfndpos(monster, data, 0, {
        ...env,
        inYourSanctuary: () => true,
    }), 0);
    assert.equal(mfndpos(monster, data, ALLOW_SANCT, {
        ...env,
        inYourSanctuary: () => true,
    }), 1);
    assert.ok(data.info[0] & ALLOW_SANCT);

    state.level.flags.has_temple = false;
    state.level.traps = [{
        tx: 5,
        ty: 4,
        ttyp: TELEP_TRAP,
        teledest: { x: 12, y: 12 },
    }];
    state.track.utcnt = 1;
    state.track.utrack = [{ x: 5, y: 4 }];
    assert.equal(mfndpos(monster, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_TRAPS);
});

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
