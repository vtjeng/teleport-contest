import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    ALTAR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    ARROW_TRAP,
    BURN,
    BURN_OBJECT,
    COLNO,
    CORR,
    COURT,
    DOOR,
    FOUNTAIN,
    HWALL,
    ICE,
    I_SPECIAL,
    LS_OBJECT,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_MINVENT,
    ONAME_LEVEL_DEF,
    OROOM,
    ROLLING_BOULDER_TRAP,
    ROWNO,
    ROT_CORPSE,
    ROOM,
    ROOMOFFSET,
    SDOOR,
    STAIRS,
    STATUE_TRAP,
    STONE,
    STRAT_WAITFORU,
    THEMEROOM,
    TELEP_TRAP,
    TIMER_LEVEL,
    TIMER_OBJECT,
    W_AMUL,
    W_ARMC,
    W_ARMH,
    WEB,
    TREE,
    VWALL,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    ART_ORCRIST,
    artifact_exists,
    init_artifacts,
} from '../js/artifacts.js';
import { GameMap } from '../js/game.js';
import { engr_at } from '../js/engrave.js';
import { add_to_minv } from '../js/invent.js';
import { light_globals_init } from '../js/light.js';
import { dmonsfree } from '../js/makemon_create.js';
import { newMonster, place_monster } from '../js/monst.js';
import { init_objects } from '../js/o_init.js';
import { mksobj } from '../js/obj.js';
import {
    create_monster,
    initialize_themeroom_postprocess_branch,
    run_themeroom_fill,
    run_themeroom_postprocess,
    themeroom_fill,
} from '../js/themeroom_fill.js';
import { THEMEROOM_FILL_DEFINITIONS } from '../js/themerooms.js';
import {
    AMULET_OF_LIFE_SAVING,
    ARMOR_CLASS,
    APPLE,
    ARROW,
    BOULDER,
    BOW,
    CHEST,
    CORPSE,
    DAGGER,
    ELVEN_BROADSWORD,
    MUMMY_WRAPPING,
    ORCISH_HELM,
    RING_CLASS,
    SCROLL_CLASS,
    STATUE,
    WEAPON_CLASS,
    OIL_LAMP,
    NUM_OBJECTS,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_ABBOT,
    PM_ACOLYTE,
    PM_ALIGNED_CLERIC,
    PM_APPRENTICE,
    PM_ARCHEOLOGIST,
    PM_ATTENDANT,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CHIEFTAIN,
    PM_DWARF,
    PM_ELF,
    PM_ETTIN,
    PM_GIANT,
    PM_GNOME,
    PM_GOBLIN,
    PM_GHOST,
    PM_FOG_CLOUD,
    PM_GIANT_MIMIC,
    PM_HEALER,
    PM_HUMAN,
    PM_HUMAN_MUMMY,
    PM_HUNTER,
    PM_KNIGHT,
    PM_KOBOLD,
    PM_MONK,
    PM_NEANDERTHAL,
    PM_NINJA,
    PM_ORC,
    PM_PAGE,
    PM_PONY,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_STUDENT,
    PM_THUG,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WARRIOR,
    PM_WIZARD,
    PM_WOOD_NYMPH,
    S_MIMIC,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    lspo_object,
    new_sp_lev_object_context,
} from '../js/sp_lev_object.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';
import { set_levltyp } from '../js/terrain.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

function fillById(id) {
    return THEMEROOM_FILL_DEFINITIONS.find((fill) => fill.id === id);
}

function twoByTwoRoom() {
    const level = new GameMap();
    const room = {
        lx: 2,
        ly: 3,
        hx: 3,
        hy: 4,
        roomnoidx: 0,
        rlit: 1,
    };
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            const location = level.at(x, y);
            location.typ = ROOM;
            location.roomno = ROOMOFFSET;
            location.edge = false;
        }
    }
    return { level, room };
}

function threeByTwoRoom() {
    const { level, room } = twoByTwoRoom();
    room.hx = 4;
    for (let y = room.ly; y <= room.hy; ++y) {
        const location = level.at(room.hx, y);
        location.typ = ROOM;
        location.roomno = ROOMOFFSET;
        location.edge = false;
    }
    return { level, room };
}

function fourByTwoRoom() {
    const { level, room } = threeByTwoRoom();
    room.hx = 5;
    for (let y = room.ly; y <= room.hy; ++y) {
        const location = level.at(room.hx, y);
        location.typ = ROOM;
        location.roomno = ROOMOFFSET;
        location.edge = false;
    }
    return { level, room };
}

function themedGenerationState(level, dlevel) {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 0, dlevel: 0 },
        context: { current_fruit: 1, ident: 2, mon_moving: false },
        flags: { initalign: 0 },
        gz: { zombify: false },
        in_mklev: true,
        level,
        moves: 2,
        program_state: { gameover: false },
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    state.u.uz.dlevel = dlevel;
    state.dungeons[0].dunlev_ureached = dlevel;
    objects_globals_init(state);
    init_objects(state, () => 0);
    monst_globals_init(state);
    reset_mvitals(state);
    init_artifacts(state);
    timeout_globals_init(state);
    light_globals_init(state);
    return state;
}

function boulderGenerationFixture() {
    const level = new GameMap();
    const room = {
        lx: 10,
        ly: 5,
        hx: 11,
        hy: 5,
        roomnoidx: 0,
        rlit: 1,
    };
    for (let x = 6; x <= 15; ++x)
        level.at(x, 5).typ = ROOM;
    for (let x = room.lx; x <= room.hx; ++x) {
        const location = level.at(x, room.ly);
        location.roomno = ROOMOFFSET;
        location.edge = false;
    }

    const state = themedGenerationState(level, 4);
    return { level, room, state };
}

function statuaryGenerationFixture() {
    const { level, room } = twoByTwoRoom();
    const state = themedGenerationState(level, 1);
    return { level, room, state };
}

function floorPile(level, x, y) {
    const objects = [];
    for (let obj = level.objects[x][y]; obj; obj = obj.nexthere)
        objects.push(obj);
    return objects;
}

function randomWithRn2(rn2) {
    return {
        d: () => { throw new Error('unexpected d'); },
        rn1: () => { throw new Error('unexpected rn1'); },
        rn2,
        rnd: () => { throw new Error('unexpected rnd'); },
        rne: () => { throw new Error('unexpected rne'); },
        rnz: () => { throw new Error('unexpected rnz'); },
    };
}

// Choose the last ordinary branch for every bounded draw.  This keeps object
// fixtures non-artifact, unenchanted, uneroded, and ungreased without hiding
// a scripted PRNG trace in tests which exercise only descriptor ownership.
function quietObjectRandom() {
    return {
        d(number, sides) { return number * sides; },
        rn1(_bound, base) { return base; },
        rn2(bound) { return Math.max(0, bound - 1); },
        rnd() { return 1; },
        rne() { return 1; },
        rnz(value) { return value; },
    };
}

function monsterDescriptorFixture() {
    const { level, room } = twoByTwoRoom();
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 },
        flags: { initalign: 0 },
        in_mklev: true,
        level,
        moves: 7,
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    objects_globals_init(state);
    init_artifacts(state);
    monst_globals_init(state);
    reset_mvitals(state);
    return {
        context: new_sp_lev_object_context(),
        level,
        random: quietObjectRandom(),
        room,
        state,
    };
}

function clippedEnextoTailSwapSteps() {
    // The fixed coordinate <2,3> clips enexto()'s outer rings at the left map
    // boundary. Each bound-minus-one draw swaps the current scan head with the
    // last remaining entry in the resulting 8-, 11-, and 15-point rings.
    return [8, 11, 15].flatMap((start) => Array.from(
        { length: start - 1 },
        (_, index) => {
            const bound = start - index;
            return step('rn2', [bound], bound - 1);
        },
    ));
}

function occupiedFogRandom({ create }) {
    return scriptedRandom([
        step('rn2', [2], 1), // descriptor gender
        step('rn2', [3], 2), // induced_align() fallback
        ...clippedEnextoTailSwapSteps(),
        ...(create ? [
            step('rnd', [2], 1), // monster identifier
            step('d', [2, 8], 16), // adjusted fog-cloud hit points
            step('rn2', [50], 49), // no defensive item
            step('rn2', [100], 99), // no miscellaneous item
            step('rn2', [100], 99), // no saddle
        ] : []),
    ]);
}

function occupyFixedRoomCoordinate(level, room, state) {
    const occupant = newMonster({
        data: state.mons[PM_GOBLIN],
        mhp: 1,
        mhpmax: 1,
        m_id: 700,
    });
    level.monlist = occupant;
    place_monster(occupant, room.lx, room.ly, state);
    return occupant;
}

test('Ice room selects in source order and starts timers y-major', () => {
    const { level, room } = twoByTwoRoom();
    const calls = [];
    const terrain = [];
    const timers = [];
    let reservoirCalls = 0;
    const random = randomWithRn2((bound) => {
        calls.push(bound);
        if (reservoirCalls++ < 13) {
            // Retain Ice at cumulative weight one; every later eligible fill
            // declines to replace it.
            return bound - 1;
        }
        if (bound === 100) return 0; // take the 25% melt-timer branch
        return bound === 1000 ? timers.length : bound - 1;
    });

    const chosen = themeroom_fill(room, 1, {
        state: { level },
        random,
        hooks: {
            setTerrain(x, y, typ) {
                assert.equal(typ, ICE);
                terrain.push([x, y]);
                level.at(x, y).typ = typ;
            },
            startMeltTimer(x, y, when) {
                timers.push([x, y, when]);
            },
        },
    });

    assert.equal(chosen.id, 'ice_room');
    assert.deepEqual(calls.slice(0, 13), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.deepEqual(calls.slice(13), [100, 1000, 1000, 1000, 1000]);
    assert.deepEqual(terrain, [
        [2, 3], [2, 4],
        [3, 3], [3, 4],
    ]);
    assert.deepEqual(timers, [
        [2, 3, 900], [3, 3, 901],
        [2, 4, 902], [3, 4, 903],
    ]);
});

test('Cloud room creates all fog monsters before its unchanged selection region', () => {
    const { level, room } = fourByTwoRoom();
    const events = [];
    let retainedSelection;
    const random = randomWithRn2(() => {
        assert.fail('replacement hooks should contain Cloud creation RNG');
    });

    run_themeroom_fill(fillById('cloud_room'), room, 1, {
        state: { level },
        random,
        hooks: {
            createMonster(specification) {
                events.push(['monster', specification]);
                return {};
            },
            createGasCloudSelection(selection, damage) {
                events.push(['region', damage]);
                retainedSelection = selection;
                return {};
            },
        },
    });

    assert.deepEqual(events, [
        ['monster', { id: PM_FOG_CLOUD, asleep: true }],
        ['monster', { id: PM_FOG_CLOUD, asleep: true }],
        ['region', 0],
    ]);
    assert.equal(retainedSelection.numpoints(), 8);
    assert.ok(retainedSelection.get(2, 3));
    assert.ok(retainedSelection.get(5, 4));
});

test('Cloud room default path owns sleeping fog and a visible gas region', () => {
    const { level, room, state, random } = monsterDescriptorFixture();
    level.rooms[0] = { ...room, rtype: THEMEROOM };

    run_themeroom_fill(fillById('cloud_room'), room, 1, {
        state,
        random,
    });

    const fog = level.monlist;
    assert.equal(fog.data.pmidx, PM_FOG_CLOUD);
    assert.equal(fog.msleeping, true);
    assert.equal(level.regions.length, 1);
    const [cloud] = level.regions;
    assert.equal(cloud.visible, true);
    assert.equal(cloud.ttl, -1);
    assert.equal(cloud.arg, 0);
    assert.deepEqual(cloud.monsters, [fog.m_id]);
    assert.deepEqual(cloud.rects, [
        { lx: 2, ly: 3, hx: 2, hy: 3 },
        { lx: 2, ly: 4, hx: 2, hy: 4 },
        { lx: 3, ly: 3, hx: 3, hy: 3 },
        { lx: 3, ly: 4, hx: 3, hy: 4 },
    ]);
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y)
            assert.equal(level.at(x, y).typ, ROOM);
    }
});

test('Storeroom samples x-major but invokes independent placements y-major', () => {
    const { level, room } = threeByTwoRoom();
    const draws = [99, 0, 99, 99, 0, 99, 99, 0];
    const events = [];
    const random = randomWithRn2((bound) => {
        assert.equal(bound, 100);
        return draws.shift();
    });

    run_themeroom_fill(fillById('storeroom'), room, 1, {
        state: { level },
        random,
        hooks: {
            createMonster(specification) {
                events.push(['monster', specification]);
                return {};
            },
            createObject(specification) {
                events.push(['object', specification]);
                return {};
            },
        },
    });

    assert.deepEqual(draws, []);
    assert.deepEqual(events, [
        ['monster', {
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: CHEST },
        }],
        ['object', { id: CHEST }],
    ]);
});

test('Storeroom scripts class selection and preserves pre-override mimic metadata', () => {
    const { level, room, state } = monsterDescriptorFixture();
    level.rooms[0] = { ...room, rtype: THEMEROOM };
    const random = scriptedRandom([
        step('rn2', [3], 2), // induced_align(): lawful fallback
        step('rn2', [9], 8), // small mimic generation filter
        step('rn2', [9], 8), // large mimic generation filter
        step('rn2', [2], 0), // retain the above-level large mimic
        step('rn2', [9], 8), // giant mimic generation filter
        step('rn2', [2], 0), // retain the above-level giant mimic
        step('rnd', [4], 4), // select the giant mimic from full class weight
        step('rn1', [2, 2], 2), // x coordinate
        step('rn1', [2, 3], 3), // y coordinate
        step('rnd', [2], 2), // monster identifier
        step('d', [8, 8], 64), // giant mimic hit points
        step('rn2', [2], 0), // makemon gender draw
        step('rn2', [17], 0), // automatic mimic shape: furniture
        step('rn2', [8], 4), // automatic furniture shape: altar
        step('rn2', [3], 0), // altar metadata: chaotic
        step('rn2', [50], 49), // no random inventory weapon
        step('rn2', [100], 99), // no defensive item
        step('rn2', [100], 99), // no miscellaneous item
    ]);

    const mimic = create_monster({
        class: S_MIMIC,
        appearAs: { type: M_AP_OBJECT, id: CHEST },
    }, room, { state, random: random.random });

    random.assertExhausted();
    assert.equal(mimic.data.pmidx, PM_GIANT_MIMIC);
    assert.equal(mimic.female, false);
    assert.equal(mimic.m_ap_type, M_AP_OBJECT);
    assert.equal(mimic.mappearance, CHEST);
    assert.equal(mimic.mextra.mcorpsenm, AM_CHAOTIC);
});

test('automatic mimic setup accepts only ordinary and themed room types', () => {
    for (const roomType of [OROOM, THEMEROOM]) {
        const { level, room, state } = monsterDescriptorFixture();
        level.rooms[0] = { ...room, rtype: roomType };
        const mimic = create_monster({
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: CHEST },
        }, room, { state, random: quietObjectRandom() });
        assert.ok(mimic, `${roomType}`);
        assert.equal(mimic.mappearance, CHEST);
    }

    const { level, room, state } = monsterDescriptorFixture();
    level.rooms[0] = { ...room, rtype: COURT };
    assert.throws(
        () => create_monster({
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: CHEST },
        }, room, { state, random: quietObjectRandom() }),
        /mimic room type/u,
    );
});

test('unsupported appearance pairs fail before hooks, RNG, or level mutation', () => {
    const { level, room, state } = monsterDescriptorFixture();
    const random = {};
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
        random[name] = () => assert.fail(`unexpected ${name}`);
    }
    const env = {
        state,
        random,
        hooks: {
            createMonster() {
                assert.fail('unsupported appearance reached creation hook');
            },
        },
    };
    const invalid = [
        {
            id: PM_FOG_CLOUD,
            appearAs: { type: M_AP_OBJECT, id: CHEST },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_FURNITURE, id: 0 },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_MONSTER, id: PM_GOBLIN },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: BOULDER },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: -1 },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: NUM_OBJECTS },
        },
        {
            class: S_MIMIC,
            appearAs: { type: M_AP_OBJECT, id: 'chest' },
        },
    ];

    for (const specification of invalid) {
        assert.throws(
            () => create_monster(specification, room, env),
            /unsupported initial-level monster creation/u,
        );
        assert.equal(level.monlist, null);
    }
});

test('create_monster relocates an occupied fixed coordinate inside its room', () => {
    const { level, room, state } = monsterDescriptorFixture();
    level.rooms[0] = { ...room, rtype: THEMEROOM };
    const occupant = occupyFixedRoomCoordinate(level, room, state);
    const random = occupiedFogRandom({ create: true });

    const fog = create_monster({
        id: PM_FOG_CLOUD,
        coordinate: { x: 0, y: 0 },
    }, room, { state, random: random.random });

    random.assertExhausted();
    assert.ok(fog);
    assert.equal(level.monsters[room.lx][room.ly], occupant);
    assert.deepEqual([fog.mx, fog.my], [3, 4]);
    assert.equal(level.monsters[fog.mx][fog.my], fog);
});

test('create_monster rejects occupied-coordinate relocation outside its room', () => {
    const { level, room, state } = monsterDescriptorFixture();
    level.rooms[0] = { ...room, rtype: THEMEROOM };
    const occupant = occupyFixedRoomCoordinate(level, room, state);
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            if (x !== room.lx || y !== room.ly)
                level.at(x, y).typ = STONE;
        }
    }
    // This is the only valid enexto() destination and lies beyond the
    // regular room's one-square border accepted by inside_room().
    level.at(room.lx, room.ly - 2).typ = ROOM;
    const random = occupiedFogRandom({ create: false });

    const fog = create_monster({
        id: PM_FOG_CLOUD,
        coordinate: { x: 0, y: 0 },
    }, room, { state, random: random.random });

    random.assertExhausted();
    assert.equal(fog, null);
    assert.equal(level.monlist, occupant);
    assert.equal(level.monsters[room.lx][room.ly], occupant);
});

test('Spider nest samples x-major and creates webs y-major', () => {
    const { level, room } = threeByTwoRoom();
    // X-major sampling retains <2,4> and <4,3>. Those points reverse under
    // the Lua callback's y-major traversal, so this fixture distinguishes
    // both the percentage draw order and the later callback order.
    const percentageDraws = [99, 0, 99, 99, 0, 99];
    const bounds = [];
    const traps = [];
    const random = randomWithRn2((bound) => {
        bounds.push(bound);
        assert.equal(bound, 100);
        return percentageDraws.shift();
    });

    run_themeroom_fill(fillById('spider_nest'), room, 1, {
        state: { level },
        random,
        hooks: {
            createTrap(...args) {
                traps.push(args.slice(0, 4));
            },
        },
    });

    assert.deepEqual(bounds, [100, 100, 100, 100, 100, 100]);
    assert.deepEqual(traps, [
        [WEB, MKTRAP_MAZEFLAG | MKTRAP_NOSPIDERONWEB, 4, 3],
        [WEB, MKTRAP_MAZEFLAG | MKTRAP_NOSPIDERONWEB, 2, 4],
    ]);
});

test('Trap room shuffles before sampling and invokes callbacks y-major', () => {
    const { level, room } = threeByTwoRoom();
    const bounds = [];
    // As above, the retained points distinguish x-major sampling from the
    // y-major callback traversal.
    const percentageDraws = [99, 0, 99, 99, 0, 99];
    const traps = [];
    const random = randomWithRn2((bound) => {
        bounds.push(bound);
        if (bound <= 8 && bound >= 2) return bound - 1; // leave source order
        assert.equal(bound, 100);
        return percentageDraws.shift();
    });

    run_themeroom_fill(fillById('trap_room'), room, 1, {
        state: { level },
        random,
        hooks: {
            createTrap(...args) {
                traps.push(args.slice(0, 4));
            },
        },
    });

    assert.deepEqual(bounds, [
        8, 7, 6, 5, 4, 3, 2,
        100, 100, 100, 100, 100, 100,
    ]);
    assert.deepEqual(traps, [
        [ARROW_TRAP, MKTRAP_MAZEFLAG, 4, 3],
        [ARROW_TRAP, MKTRAP_MAZEFLAG, 2, 4],
    ]);
});

test('Boulder room samples x-major and invokes mixed callbacks y-major', () => {
    const { level, room } = threeByTwoRoom();
    // The first six draws retain <2,3>, <3,4>, and <4,3> in x-major order.
    // The final three then choose object, trap, object in y-major order.
    const draws = [0, 99, 99, 0, 0, 99, 0, 99, 0];
    const bounds = [];
    const events = [];
    const random = randomWithRn2((bound) => {
        bounds.push(bound);
        assert.equal(bound, 100);
        return draws.shift();
    });

    run_themeroom_fill(fillById('boulder_room'), room, 4, {
        state: { level },
        random,
        hooks: {
            createObject(specification) {
                events.push(['object', specification]);
                return {};
            },
            createTrap(type, flags, x, y) {
                events.push(['trap', { type, flags, x, y }]);
                return {};
            },
        },
    });

    assert.deepEqual(bounds, Array(9).fill(100));
    assert.deepEqual(draws, []);
    assert.deepEqual(events, [
        ['object', { id: BOULDER, coordinate: { x: 0, y: 0 } }],
        ['trap', {
            type: ROLLING_BOULDER_TRAP,
            flags: MKTRAP_MAZEFLAG,
            x: 4,
            y: 3,
        }],
        ['object', { id: BOULDER, coordinate: { x: 1, y: 1 } }],
    ]);
});

test('Boulder traps preserve create_trap room relocation', () => {
    const { level, room } = threeByTwoRoom();
    const percentageDraws = [0, 99, 99, 99, 99, 99];
    const oneBasedCalls = [];
    const traps = [];
    let coreCalls = 0;
    const random = {
        d: () => assert.fail('unexpected d'),
        rn1(bound, base) {
            oneBasedCalls.push([bound, base]);
            return base + bound - 1;
        },
        rn2(bound) {
            assert.equal(bound, 100);
            ++coreCalls;
            if (coreCalls <= 6) return percentageDraws.shift();
            // The selection snapshot already contains <2,3>. Changing it to
            // corridor terrain now exercises create_trap's relocation path.
            level.at(2, 3).typ = CORR;
            return 99;
        },
        rnd: () => assert.fail('unexpected rnd'),
        rne: () => assert.fail('unexpected rne'),
        rnz: () => assert.fail('unexpected rnz'),
    };

    run_themeroom_fill(fillById('boulder_room'), room, 4, {
        state: { level },
        random,
        hooks: {
            createTrap(type, flags, x, y) {
                traps.push([type, flags, x, y]);
                return {};
            },
        },
    });

    assert.equal(coreCalls, 7);
    assert.deepEqual(percentageDraws, []);
    assert.deepEqual(oneBasedCalls, [[3, 2], [2, 3]]);
    assert.deepEqual(traps, [[
        ROLLING_BOULDER_TRAP,
        MKTRAP_MAZEFLAG,
        4,
        4,
    ]]);
});

test('Boulder room composes real object, trap, launch, and victim boundaries', () => {
    const { level, room, state } = boulderGenerationFixture();
    const scripted = scriptedRandom([
        step('rn2', [100], 0), // retain room-relative <0,0>
        step('rn2', [100], 0), // retain room-relative <1,0>
        step('rn2', [100], 0), // first callback creates a floor boulder
        step('rnd', [2], 1), // direct boulder identifier
        step('rn2', [100], 99), // second callback creates a trap
        step('rn1', [5, 4], 4), // launch distance
        step('rn2', [8], 7), // southwest fails, then west succeeds
        step('rnd', [2], 1), // launch boulder identifier
        step('rnd', [4], 1), // difficulty-four victim gate fails
    ]);
    const events = [];
    const random = {};
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
        random[name] = (...args) => {
            events.push([name, ...args]);
            return scripted.random[name](...args);
        };
    }

    run_themeroom_fill(fillById('boulder_room'), room, 4, {
        state,
        random,
        hooks: {
            newsym(x, y) {
                events.push(['newsym', x, y]);
            },
        },
    });
    scripted.assertExhausted();

    assert.deepEqual(events, [
        ['rn2', 100], ['rn2', 100],
        ['rn2', 100], ['rnd', 2],
        ['rn2', 100], ['rn1', 5, 4], ['rn2', 8], ['rnd', 2],
        ['newsym', 7, 5], ['rnd', 4],
    ]);
    assert.deepEqual(
        floorPile(level, 10, 5).map((obj) => [
            obj.otyp, obj.quan, obj.where, obj.ox, obj.oy,
        ]),
        [[BOULDER, 1, OBJ_FLOOR, 10, 5]],
    );
    assert.equal(level.traps.length, 1);
    assert.deepEqual(
        [level.traps[0].tx, level.traps[0].ty, level.traps[0].ttyp],
        [11, 5, ROLLING_BOULDER_TRAP],
    );
    assert.deepEqual(level.traps[0].launch, { x: 7, y: 5 });
    assert.deepEqual(level.traps[0].launch2, { x: 15, y: 5 });
    assert.deepEqual(
        floorPile(level, 7, 5).map((obj) => [
            obj.otyp, obj.quan, obj.where, obj.ox, obj.oy,
        ]),
        [[BOULDER, 1, OBJ_FLOOR, 7, 5]],
    );
});

test('Buried zombies preserves pool thresholds and appended source order', () => {
    const cases = [
        [3, 4, [PM_ORC, PM_DWARF]],
        [4, 6, [PM_ELF, PM_HUMAN]],
        [6, 6, [PM_ELF, PM_HUMAN]],
        [7, 8, [PM_ETTIN, PM_GIANT]],
    ];

    for (const [difficulty, poolSize, expectedTail] of cases) {
        for (const [tailOffset, expectedSpecies] of expectedTail.entries()) {
            const { level, room } = twoByTwoRoom();
            // A one-by-two room creates exactly one corpse.
            room.hx = room.lx;
            const state = { level, moves: 7 };
            timeout_globals_init(state);
            const calls = [];
            let corpse = null;
            const random = randomWithRn2((bound) => {
                calls.push(bound);
                if (bound === 21) return 0;
                // First leave the last entry in place.  Selecting index zero
                // on the next requested suffix moves either the second-last
                // or last source entry into the pool's first slot.
                if (tailOffset === 0)
                    return bound === poolSize - 1 ? 0 : bound - 1;
                return bound === poolSize ? 0 : bound - 1;
            });
            let request = null;

            run_themeroom_fill(fillById('buried_zombies'), room, difficulty, {
                state,
                random,
                hooks: {
                    createObject(specification) {
                        request = specification;
                        corpse = { timed: 0 };
                        return corpse;
                    },
                },
            });

            assert.deepEqual(calls, [
                ...Array.from(
                    { length: poolSize - 1 },
                    (_, index) => poolSize - index,
                ),
                21,
            ]);
            assert.deepEqual(request, {
                id: CORPSE,
                corpsenm: expectedSpecies,
                buried: true,
            });
            assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 997);
        }
    }
});

test('Buried zombies reuses its shuffled pool and replaces timers after delay', () => {
    const { level, room } = twoByTwoRoom();
    room.hx = room.lx + 2;
    room.hy = room.ly + 2;
    const state = { level, moves: 7 };
    timeout_globals_init(state);
    const calls = [];
    const corpses = [];
    const requests = [];
    let reservoirCalls = 0;
    const random = randomWithRn2((bound) => {
        calls.push(bound);
        if (reservoirCalls++ < 13) {
            // Buried zombies is the seventh eligible lit D:1 fill.
            return bound === 7 ? 0 : bound - 1;
        }
        if (bound === 21) {
            const corpse = corpses.at(-1);
            // stop_timer("rot-corpse") precedes evaluation of the delay;
            // replacement of the old zombification timer follows it.
            assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
            assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 57);
            return corpses.length - 1;
        }
        return 0;
    });

    const chosen = themeroom_fill(room, 1, {
        state,
        random,
        hooks: {
            createObject(specification) {
                requests.push(specification);
                const corpse = { timed: 0 };
                start_timer(40, TIMER_OBJECT, ROT_CORPSE, corpse, state);
                start_timer(50, TIMER_OBJECT, ZOMBIFY_MON, corpse, state);
                corpses.push(corpse);
                return corpse;
            },
        },
    });

    assert.equal(chosen.id, 'buried_zombies');
    assert.deepEqual(calls.slice(0, 13), [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    assert.deepEqual(calls.slice(13), [
        4, 3, 2, 21,
        4, 3, 2, 21,
        4, 3, 2, 21,
        4, 3, 2, 21,
    ]);
    // Reapplying the same swaps to one mutable pool cycles each base species
    // through the first slot; recreating the pool would repeat PM_GNOME.
    assert.deepEqual(
        requests.map((request) => request.corpsenm),
        [PM_GNOME, PM_ORC, PM_DWARF, PM_KOBOLD],
    );
    assert.ok(requests.every((request) => request.id === CORPSE));
    assert.ok(requests.every((request) => request.buried === true));
    for (const [index, corpse] of corpses.entries()) {
        assert.equal(corpse.timed, 1);
        assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
        assert.equal(
            peek_timer(ZOMBIFY_MON, corpse, state),
            state.moves + 990 + index,
        );
    }
});

test('Buried zombies default path owns buried corpses and final timers', () => {
    const { level, room } = twoByTwoRoom();
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 },
        flags: { initalign: 0 },
        gz: { zombify: false },
        in_mklev: true,
        level,
        moves: 7,
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    objects_globals_init(state);
    init_artifacts(state);
    monst_globals_init(state);
    reset_mvitals(state);
    timeout_globals_init(state);

    run_themeroom_fill(fillById('buried_zombies'), room, 1, {
        state,
        random: quietObjectRandom(),
    });

    const second = level.buriedobjlist;
    const first = second.nobj;
    assert.ok(first);
    assert.equal(first.nobj, null);
    assert.equal(level.objlist, null);
    assert.equal(level.objects[room.lx][room.ly], null);
    for (const corpse of [first, second]) {
        assert.deepEqual(
            [
                corpse.otyp,
                corpse.corpsenm,
                corpse.spe,
                corpse.quan,
                corpse.where,
                corpse.ox,
                corpse.oy,
                corpse.timed,
            ],
            [
                CORPSE,
                PM_KOBOLD,
                0,
                1,
                OBJ_BURIED,
                room.lx,
                room.ly,
                1,
            ],
        );
        assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
        assert.equal(
            peek_timer(ZOMBIFY_MON, corpse, state),
            state.moves + 1010,
        );
    }
    // Equal-expiry timers are newest first, matching the buried LIFO chain.
    assert.equal(state.gt.timer_base.arg, second);
    assert.equal(state.gt.timer_base.next.arg, first);
    assert.equal(state.gt.timer_base.next.next, null);
});

test('Massacre preserves the source species table order', () => {
    const sourceSpecies = [
        PM_APPRENTICE,
        PM_WARRIOR,
        PM_NINJA,
        PM_THUG,
        PM_HUNTER,
        PM_ACOLYTE,
        PM_ABBOT,
        PM_PAGE,
        PM_ATTENDANT,
        PM_NEANDERTHAL,
        PM_CHIEFTAIN,
        PM_STUDENT,
        PM_WIZARD,
        PM_VALKYRIE,
        PM_TOURIST,
        PM_SAMURAI,
        PM_ROGUE,
        PM_RANGER,
        PM_ALIGNED_CLERIC, // source "priestess": first matching pmname
        PM_ALIGNED_CLERIC, // source "priest": first matching pmname
        PM_MONK,
        PM_KNIGHT,
        PM_HEALER,
        PM_CAVE_DWELLER, // source "cavewoman"
        PM_CAVE_DWELLER, // source "caveman"
        PM_BARBARIAN,
        PM_ARCHEOLOGIST,
    ];
    const { level, room } = twoByTwoRoom();

    for (const [tableIndex, species] of sourceSpecies.entries()) {
        const random = scriptedRandom([
            // Lua math.random(#mon) becomes zero-based rn2(27).
            step('rn2', [sourceSpecies.length], tableIndex),
            // Five minimum-valued dice keep each table-index case compact.
            ...Array.from(
                { length: 5 },
                () => step('rn2', [5], 0),
            ),
            ...Array.from(
                { length: 5 },
                () => step('rn2', [100], 99), // miss each 10% reselection
            ),
        ]);
        const requests = [];
        run_themeroom_fill(fillById('massacre'), room, 1, {
            state: { level },
            random: random.random,
            hooks: {
                createObject(specification) {
                    requests.push(specification);
                    return {};
                },
            },
        });

        random.assertExhausted();
        assert.deepEqual(
            requests,
            Array.from(
                { length: 5 },
                () => ({ id: CORPSE, corpsenm: species }),
            ),
            `source table index ${tableIndex + 1}`,
        );
    }
});

test('Massacre creates the full 25 corpses at the five-die maximum', () => {
    const { level, room } = twoByTwoRoom();
    const random = scriptedRandom([
        step('rn2', [27], 0),
        ...Array.from({ length: 5 }, () => step('rn2', [5], 4)),
        ...Array.from({ length: 25 }, () => step('rn2', [100], 99)),
    ]);
    const requests = [];

    run_themeroom_fill(fillById('massacre'), room, 1, {
        state: { level },
        random: random.random,
        hooks: {
            createObject(specification) {
                requests.push(specification);
                return {};
            },
        },
    });

    random.assertExhausted();
    assert.equal(requests.length, 25);
    assert.ok(requests.every((request) => request.id === CORPSE));
    assert.ok(requests.every(
        (request) => request.corpsenm === PM_APPRENTICE,
    ));
});

test('Massacre reselects before creating a corpse and retains that species', () => {
    const { level, room } = twoByTwoRoom();
    const random = scriptedRandom([
        step('rn2', [27], 0), // initial apprentice selection
        // nhlib d(5,5) is five independent math.random(1,5) calls.
        ...Array.from({ length: 5 }, () => step('rn2', [5], 0)),
        step('rn2', [100], 10), // threshold is strict: retain apprentice
        step('rn2', [100], 9), // pass the 10% reselection gate
        step('rn2', [27], 1), // switch to warrior before corpse two
        step('rn2', [100], 99), // retain warrior for corpse three
        step('rn2', [100], 0), // pass the reselection gate again
        step('rn2', [27], 18), // priestess finds aligned cleric first
        step('rn2', [100], 99), // retain aligned cleric for corpse five
    ]);
    const requests = [];

    run_themeroom_fill(fillById('massacre'), room, 1, {
        state: { level },
        random: random.random,
        hooks: {
            createObject(specification) {
                requests.push(specification);
                return {};
            },
        },
    });

    random.assertExhausted();
    assert.deepEqual(
        requests.map((specification) => specification.corpsenm),
        [
            PM_APPRENTICE,
            PM_WARRIOR,
            PM_WARRIOR,
            PM_ALIGNED_CLERIC,
            PM_ALIGNED_CLERIC,
        ],
    );
});

test('Massacre default path creates exact floor corpses', () => {
    const { level, room } = twoByTwoRoom();
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 },
        flags: { initalign: 0 },
        in_mklev: true,
        level,
        moves: 7,
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    objects_globals_init(state);
    init_artifacts(state);
    monst_globals_init(state);
    reset_mvitals(state);
    timeout_globals_init(state);
    const random = quietObjectRandom();
    const quietRn2 = random.rn2;
    // Five minimum-valued dice exercise real object construction without
    // making the fixture depend on all twenty-five possible corpse objects.
    random.rn2 = (bound) => bound === 5 ? 0 : quietRn2(bound);

    run_themeroom_fill(fillById('massacre'), room, 1, { state, random });

    // All five random coordinates land at the upper-left square. Exact
    // same-age corpses merge there, preserving their aggregate quantity.
    const corpse = level.objlist;
    assert.equal(corpse.nobj, null);
    assert.deepEqual(
        [
            corpse.otyp,
            corpse.corpsenm,
            corpse.spe,
            corpse.quan,
            corpse.where,
            corpse.ox,
            corpse.oy,
        ],
        [CORPSE, PM_ARCHEOLOGIST, 0, 5, OBJ_FLOOR, room.lx, room.ly],
    );
});

test('Ice room default path changes terrain and queues packed level timers', () => {
    const { level, room } = twoByTwoRoom();
    const state = { level, moves: 7 };
    timeout_globals_init(state);
    // nh.start_timer_at() replaces an existing timer of the same type at the
    // same coordinate before scheduling the new one.
    start_timer(
        50,
        TIMER_LEVEL,
        MELT_ICE_AWAY,
        3 * 0x10000 + 3,
        state,
    );
    const bounds = [];
    // The first zero takes the 25% timer branch. Delays deliberately include
    // an equal pair so newest-first insertion at equal expiry is covered.
    const draws = [0, 300, 100, 100, 200];
    const random = randomWithRn2((bound) => {
        bounds.push(bound);
        return draws.shift();
    });

    run_themeroom_fill(fillById('ice_room'), room, 1, {
        state,
        random,
    });

    assert.deepEqual(bounds, [100, 1000, 1000, 1000, 1000]);
    assert.deepEqual(draws, []);
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y)
            assert.equal(level.at(x, y).typ, ICE);
    }

    const timers = [];
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        timers.push({
            timeout: timer.timeout,
            tid: timer.tid,
            kind: timer.kind,
            func_index: timer.func_index,
            arg: timer.arg,
            needs_fixup: timer.needs_fixup,
        });
    }
    assert.deepEqual(timers, [
        {
            timeout: 1007,
            tid: 4,
            kind: TIMER_LEVEL,
            func_index: MELT_ICE_AWAY,
            arg: 2 * 0x10000 + 4,
            needs_fixup: false,
        },
        {
            timeout: 1007,
            tid: 3,
            kind: TIMER_LEVEL,
            func_index: MELT_ICE_AWAY,
            arg: 3 * 0x10000 + 3,
            needs_fixup: false,
        },
        {
            timeout: 1107,
            tid: 5,
            kind: TIMER_LEVEL,
            func_index: MELT_ICE_AWAY,
            arg: 3 * 0x10000 + 4,
            needs_fixup: false,
        },
        {
            timeout: 1207,
            tid: 2,
            kind: TIMER_LEVEL,
            func_index: MELT_ICE_AWAY,
            arg: 2 * 0x10000 + 3,
            needs_fixup: false,
        },
    ]);
    assert.equal(state.svt.timer_id, 6);
});

test('Light source places and burns an oil lamp through default paths', () => {
    const { level, room } = twoByTwoRoom();
    room.rlit = 0; // The source fill is eligible only in a dark room.
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 },
        in_mklev: true,
        level,
        moves: 7,
    };
    objects_globals_init(state);
    timeout_globals_init(state);
    light_globals_init(state);
    const random = scriptedRandom([
        step('rn1', [2, 2], 3), // get_location_coord: room x
        step('rn1', [2, 3], 4), // get_location_coord: room y
        step('rnd', [2], 1), // advance the shared object/monster identifier
        step('rn1', [500, 1000], 1000), // minimum generated lamp fuel
        step('rn2', [5], 1), // leave the lamp uncursed and unblessed
    ]);

    run_themeroom_fill(fillById('light_source'), room, 1, {
        state,
        random: random.random,
    });
    random.assertExhausted();

    const lamp = level.objects[3][4];
    assert.equal(level.objlist, lamp);
    assert.deepEqual(
        [lamp.otyp, lamp.where, lamp.ox, lamp.oy],
        [OIL_LAMP, OBJ_FLOOR, 3, 4],
    );
    assert.deepEqual([lamp.lamplit, lamp.timed, lamp.age], [true, 1, 150]);
    assert.equal(peek_timer(BURN_OBJECT, lamp, state), 857);
    assert.deepEqual(
        {
            timeout: state.gt.timer_base.timeout,
            kind: state.gt.timer_base.kind,
            func_index: state.gt.timer_base.func_index,
            arg: state.gt.timer_base.arg,
            next: state.gt.timer_base.next,
        },
        {
            timeout: 857,
            kind: TIMER_OBJECT,
            func_index: BURN_OBJECT,
            arg: lamp,
            next: null,
        },
    );
    assert.deepEqual(
        {
            x: state.gl.light_base.x,
            y: state.gl.light_base.y,
            range: state.gl.light_base.range,
            type: state.gl.light_base.type,
            id: state.gl.light_base.id,
            next: state.gl.light_base.next,
        },
        { x: 3, y: 4, range: 3, type: LS_OBJECT, id: lamp, next: null },
    );
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(state.context.ident, 3);
});

test('Temple of the gods places the branch-shuffled alignments in order', () => {
    const { level, room } = threeByTwoRoom();
    const state = {
        level,
        themeroom_align: {
            2: ['neutral', 'chaos', 'law'],
        },
        u: { uz: { dnum: 2, dlevel: 1 } },
    };
    const random = scriptedRandom([
        step('rn1', [3, 2], 2), // first altar: left column
        step('rn1', [2, 3], 3), // first altar: top row
        step('rn1', [3, 2], 3), // second altar: middle column
        step('rn1', [2, 3], 3), // second altar: top row
        step('rn1', [3, 2], 4), // third altar: right column
        step('rn1', [2, 3], 3), // third altar: top row
    ]);

    run_themeroom_fill(
        fillById('temple_of_the_gods'),
        room,
        1,
        { state, random: random.random },
    );

    random.assertExhausted();
    assert.deepEqual(
        [2, 3, 4].map((x) => [
            level.at(x, 3).typ,
            level.at(x, 3).flags,
        ]),
        [
            [ALTAR, AM_NEUTRAL],
            [ALTAR, AM_CHAOTIC],
            [ALTAR, AM_LAWFUL],
        ],
    );
});

test('Ghost fill shares one coordinate and preserves equipment order', () => {
    const { level, room } = twoByTwoRoom();
    const bounds = [];
    const requests = [];
    const chanceDraws = [0, 99, 0, 0, 99, 0];
    const random = randomWithRn2((bound) => {
        bounds.push(bound);
        if (bound === 4) return 2; // x-major selection => relative <1,0>
        assert.equal(bound, 100);
        return chanceDraws.shift();
    });

    run_themeroom_fill(fillById('ghost_of_an_adventurer'), room, 1, {
        state: { level },
        random,
        hooks: {
            createMonster(specification) {
                requests.push(['monster', specification]);
                return {};
            },
            createObject(specification) {
                requests.push(['object', specification]);
                return {};
            },
        },
    });

    assert.deepEqual(bounds, [4, 100, 100, 100, 100, 100, 100]);
    assert.equal(requests[0][1].id, PM_GHOST);
    assert.deepEqual(requests[0][1].coordinate, { x: 1, y: 0 });
    assert.equal(requests[0][1].asleep, true);
    assert.equal(requests[0][1].waiting, true);
    assert.deepEqual(
        requests.slice(1).map(([, spec]) => spec.id ?? spec.class),
        [DAGGER, BOW, ARROW, ARMOR_CLASS, SCROLL_CLASS],
    );
    for (const [, specification] of requests.slice(1)) {
        assert.deepEqual(specification.coordinate, { x: 1, y: 0 });
        assert.equal(specification.buc, 'not-blessed');
    }
    assert.ok(!requests.some(([, spec]) => spec.class === WEAPON_CLASS));
    assert.ok(!requests.some(([, spec]) => spec.class === RING_CLASS));
});

test('custom inventory discards worn defaults and reverses artifacts', () => {
    const { context, level, random, room, state } = monsterDescriptorFixture();
    const monster = newMonster({
        data: state.mons[PM_GOBLIN],
        mnum: PM_GOBLIN,
        m_id: 40,
        mcanmove: true,
    });
    const generatedArtifact = mksobj(
        ELVEN_BROADSWORD,
        true,
        false,
        { state, random },
    );
    generatedArtifact.oextra = { oname: 'Orcrist' };
    artifact_exists(
        generatedArtifact,
        'Orcrist',
        true,
        ONAME_LEVEL_DEF,
        state,
    );
    assert.equal(generatedArtifact.oartifact, ART_ORCRIST);
    assert.equal(state.artiexist[ART_ORCRIST].exists, 1);
    let artifactNameReads = 0;
    Object.defineProperty(generatedArtifact.oextra, 'oname', {
        configurable: true,
        get() {
            ++artifactNameReads;
            assert.equal(generatedArtifact.where, OBJ_FREE);
            assert.equal(generatedArtifact.ocarry, null);
            assert.equal(monster.minvent, null);
            assert.equal(generatedArtifact.oartifact, ART_ORCRIST);
            assert.equal(state.artiexist[ART_ORCRIST].exists, 1);
            return 'Orcrist';
        },
    });
    const generatedHelm = mksobj(
        ORCISH_HELM,
        true,
        false,
        { state, random },
    );
    generatedHelm.owornmask = W_ARMH;
    monster.misc_worn_check = W_ARMH;
    add_to_minv(monster, generatedArtifact, { state, random });
    add_to_minv(monster, generatedHelm, { state, random });

    let customHelm = null;
    const created = create_monster({
        id: PM_GOBLIN,
        coordinate: { x: 0, y: 0 },
        inventory(callbackMonster, callbackEnv) {
            assert.equal(callbackMonster, monster);
            customHelm = lspo_object({
                id: ORCISH_HELM,
                coordinate: { x: 0, y: 0 },
            }, room, callbackEnv);
        },
    }, room, {
        state,
        random,
        hooks: { createMonster: () => monster },
        spObjectContext: context,
    });

    assert.equal(created, monster);
    assert.equal(generatedHelm.where, OBJ_DELETED);
    assert.equal(generatedHelm.owornmask, 0);
    assert.equal(generatedArtifact.where, OBJ_DELETED);
    assert.equal(generatedArtifact.oartifact, 0);
    assert.equal(state.artiexist[ART_ORCRIST].exists, 0);
    assert.equal(artifactNameReads, 1);
    assert.equal(customHelm.where, OBJ_MINVENT);
    assert.equal(customHelm.ocarry, monster);
    assert.equal(customHelm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, I_SPECIAL | W_ARMH);
    assert.equal(context.inventCarryingMonster, null);

    const laterApple = lspo_object({
        id: APPLE,
        coordinate: { x: 1, y: 0 },
    }, room, { state, random, spObjectContext: context });
    assert.equal(laterApple.where, OBJ_FLOOR);
    assert.equal(level.objects[3][3], laterApple);
});

test('explicit false discards default inventory without a custom callback', () => {
    const { context, random, room, state } = monsterDescriptorFixture();
    const monster = newMonster({
        data: state.mons[PM_GOBLIN],
        mnum: PM_GOBLIN,
        m_id: 44,
        mcanmove: true,
    });
    const generatedHelm = mksobj(
        ORCISH_HELM,
        true,
        false,
        { state, random },
    );
    generatedHelm.owornmask = W_ARMH;
    monster.misc_worn_check = W_ARMH;
    add_to_minv(monster, generatedHelm, { state, random });

    const created = create_monster({
        id: PM_GOBLIN,
        coordinate: { x: 0, y: 0 },
        keepDefaultInventory: false,
    }, room, {
        state,
        random,
        hooks: { createMonster: () => monster },
        spObjectContext: context,
    });

    assert.equal(created, monster);
    assert.equal(monster.minvent, null);
    assert.equal(generatedHelm.where, OBJ_DELETED);
    assert.equal(generatedHelm.owornmask, 0);
    assert.equal(monster.misc_worn_check, I_SPECIAL);
    assert.equal(context.inventCarryingMonster, null);
});

test('discarding live default wrapping restores permanent invisibility', () => {
    const { context, random, room, state } = monsterDescriptorFixture();
    const monster = newMonster({
        data: state.mons[PM_HUMAN_MUMMY],
        mnum: PM_HUMAN_MUMMY,
        m_id: 45,
        mhp: 10,
        minvis: false,
        perminvis: true,
        invis_blkd: true,
        mcanmove: true,
    });
    const generatedWrapping = mksobj(
        MUMMY_WRAPPING,
        true,
        false,
        { state, random },
    );
    generatedWrapping.owornmask = W_ARMC;
    monster.misc_worn_check = W_ARMC;
    add_to_minv(monster, generatedWrapping, { state, random });

    const created = create_monster({
        id: PM_HUMAN_MUMMY,
        coordinate: { x: 0, y: 0 },
        keepDefaultInventory: false,
    }, room, {
        state,
        random,
        hooks: { createMonster: () => monster },
        spObjectContext: context,
    });

    assert.equal(created, monster);
    assert.equal(monster.minvent, null);
    assert.equal(generatedWrapping.where, OBJ_DELETED);
    assert.equal(generatedWrapping.owornmask, 0);
    assert.equal(monster.misc_worn_check, I_SPECIAL);
    assert.equal(monster.invis_blkd, false);
    assert.equal(monster.minvis, true);
    assert.equal(context.inventCarryingMonster, null);
});

test('kept default inventory preserves an amulet and upgrades a weaker helm', () => {
    const { context, random, room, state } = monsterDescriptorFixture();
    const monster = newMonster({
        data: state.mons[PM_GOBLIN],
        mnum: PM_GOBLIN,
        m_id: 42,
        mcanmove: true,
    });
    const oldAmulet = mksobj(
        AMULET_OF_LIFE_SAVING,
        true,
        false,
        { state, random },
    );
    const oldHelm = mksobj(ORCISH_HELM, true, false, { state, random });
    oldHelm.spe = 0;
    add_to_minv(monster, oldAmulet, { state, random });
    add_to_minv(monster, oldHelm, { state, random });
    oldAmulet.owornmask = W_AMUL;
    oldHelm.owornmask = W_ARMH;
    monster.misc_worn_check = W_AMUL | W_ARMH;

    let newAmulet = null;
    let newHelm = null;
    create_monster({
        id: PM_GOBLIN,
        coordinate: { x: 0, y: 0 },
        keepDefaultInventory: true,
        inventory(_callbackMonster, callbackEnv) {
            newAmulet = lspo_object({
                id: AMULET_OF_LIFE_SAVING,
                coordinate: { x: 0, y: 0 },
            }, room, callbackEnv);
            newHelm = lspo_object({
                id: ORCISH_HELM,
                spe: 3,
                coordinate: { x: 0, y: 0 },
            }, room, callbackEnv);
        },
    }, room, {
        state,
        random,
        hooks: { createMonster: () => monster },
        spObjectContext: context,
    });

    assert.equal(oldAmulet.owornmask, W_AMUL);
    assert.equal(newAmulet.owornmask, 0);
    assert.equal(oldHelm.owornmask, 0);
    assert.equal(newHelm.owornmask, W_ARMH);
    assert.equal(monster.misc_worn_check, W_AMUL | W_ARMH);
});

test('animal carriers keep custom armor in inventory without wearing it', () => {
    const { context, random, room, state } = monsterDescriptorFixture();
    const pony = newMonster({
        data: state.mons[PM_PONY],
        mnum: PM_PONY,
        m_id: 43,
        mcanmove: true,
    });
    let helm = null;

    create_monster({
        id: PM_PONY,
        coordinate: { x: 0, y: 0 },
        inventory(_callbackMonster, callbackEnv) {
            helm = lspo_object({
                id: ORCISH_HELM,
                coordinate: { x: 0, y: 0 },
            }, room, callbackEnv);
        },
    }, room, {
        state,
        random,
        hooks: { createMonster: () => pony },
        spObjectContext: context,
    });

    assert.equal(helm.where, OBJ_MINVENT);
    assert.equal(helm.ocarry, pony);
    assert.equal(helm.owornmask, 0);
    assert.equal(pony.misc_worn_check & W_ARMH, 0);
});

test('failed monster creation runs custom inventory with a null carrier', () => {
    const { context, level, random, room, state } = monsterDescriptorFixture();
    let callbackObject = null;

    const monster = create_monster({
        id: PM_GOBLIN,
        coordinate: { x: 0, y: 0 },
        inventory(callbackMonster, callbackEnv) {
            assert.equal(callbackMonster, null);
            callbackObject = lspo_object({
                id: APPLE,
                coordinate: { x: 0, y: 0 },
            }, room, callbackEnv);
        },
    }, room, {
        state,
        random,
        hooks: { createMonster: () => null },
        spObjectContext: context,
    });

    assert.equal(monster, null);
    assert.equal(callbackObject.where, OBJ_FLOOR);
    assert.equal(level.objects[2][3], callbackObject);
    assert.equal(context.inventCarryingMonster, null);
});

test('a failed nested descriptor uses then clears the outer scalar carrier', () => {
    const { context, level, random, room, state } = monsterDescriptorFixture();
    const outer = newMonster({
        data: state.mons[PM_GOBLIN],
        mnum: PM_GOBLIN,
        m_id: 45,
        mcanmove: true,
    });
    let creationCalls = 0;
    let inheritedHelm = null;
    let laterApple = null;

    create_monster({
        id: PM_GOBLIN,
        coordinate: { x: 0, y: 0 },
        inventory(_outerMonster, outerEnv) {
            const inner = create_monster({
                id: PM_GOBLIN,
                coordinate: { x: 0, y: 0 },
                inventory(innerMonster, innerEnv) {
                    assert.equal(innerMonster, null);
                    inheritedHelm = lspo_object({
                        id: ORCISH_HELM,
                        coordinate: { x: 0, y: 0 },
                    }, room, innerEnv);
                },
            }, room, outerEnv);
            assert.equal(inner, null);
            assert.equal(inheritedHelm.owornmask, W_ARMH);
            assert.equal(outer.misc_worn_check & W_ARMH, W_ARMH);
            laterApple = lspo_object({
                id: APPLE,
                coordinate: { x: 1, y: 0 },
            }, room, outerEnv);
        },
    }, room, {
        state,
        random,
        hooks: {
            createMonster() {
                return creationCalls++ === 0 ? outer : null;
            },
        },
        spObjectContext: context,
    });

    assert.equal(inheritedHelm.where, OBJ_MINVENT);
    assert.equal(inheritedHelm.ocarry, outer);
    assert.equal(outer.minvent, inheritedHelm);
    assert.equal(creationCalls, 2);
    assert.equal(laterApple.where, OBJ_FLOOR);
    assert.equal(level.objects[3][3], laterApple);
    assert.equal(context.inventCarryingMonster, null);
});

test('throwing monster inventory callbacks still clear their carrier', () => {
    const { context, random, room, state } = monsterDescriptorFixture();
    const monster = newMonster({
        data: state.mons[PM_GOBLIN],
        mnum: PM_GOBLIN,
        m_id: 41,
        mcanmove: true,
    });
    const marker = new Error('inventory failed');

    assert.throws(
        () => create_monster({
            id: PM_GOBLIN,
            coordinate: { x: 0, y: 0 },
            inventory() { throw marker; },
        }, room, {
            state,
            random,
            hooks: { createMonster: () => monster },
            spObjectContext: context,
        }),
        (error) => error === marker,
    );
    assert.equal(context.inventCarryingMonster, null);
});

test('Ghost fill default path preserves the complete creation draw order', () => {
    const { level, room } = twoByTwoRoom();
    const state = {
        ...rawMonsterGenerationState(),
        context: { ident: 2 },
        flags: { initalign: 0 },
        in_mklev: true,
        level,
        moves: 0,
        plname: 'Alice',
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    };
    level.flags.rndmongen = true;
    objects_globals_init(state);
    init_artifacts(state);
    monst_globals_init(state);
    reset_mvitals(state);
    const random = scriptedRandom([
        step('rn2', [4], 2), // x-major rndcoord chooses relative <1,0>
        step('rn2', [2], 0), // parser chooses a male ghost
        step('rn2', [3], 2), // induced_align() random-mask fallback
        step('rnd', [2], 1), // ghost identifier advances from two to three
        step('d', [9, 8], 30), // level-nine ghost hit points
        step('rn2', [2], 1), // makemon independently chooses female
        step('rn2', [7], 6), // select the built-in ghost-name branch
        step('rn2', [34], 33), // select the last built-in ghost name
        step('rn2', [50], 49), // no random defensive item
        step('rn2', [100], 99), // no random miscellaneous item
        step('rn2', [100], 99), // no initial saddle
        step('rn2', [100], 0), // pass the 65% dagger equipment gate
        step('rnd', [2], 1), // dagger identifier advances three to four
        step('rn2', [11], 10), // no positive dagger enchantment
        step('rn2', [10], 9), // no negative dagger enchantment
        step('rn2', [10], 9), // dagger remains uncursed and unblessed
        step('rn2', [20], 19), // no randomly generated dagger artifact
        step('rn2', [100], 99), // dagger is not erosion-proof
        step('rn2', [80], 79), // no primary erosion
        step('rn2', [80], 79), // no secondary erosion
        step('rn2', [1000], 999), // dagger is not greased
        step('rn2', [100], 99), // miss the random-weapon gate
        step('rn2', [100], 99), // miss the bow-and-arrow gate
        step('rn2', [100], 99), // miss the armor gate
        step('rn2', [100], 99), // miss the ring gate
        step('rn2', [100], 99), // miss the scroll gate
    ]);

    run_themeroom_fill(fillById('ghost_of_an_adventurer'), room, 1, {
        state,
        random: random.random,
    });
    random.assertExhausted();

    const ghost = level.monsters[3][3];
    assert.equal(level.monlist, ghost);
    assert.equal(ghost.data, state.mons[PM_GHOST]);
    assert.equal(ghost.mnum, PM_GHOST);
    assert.deepEqual([ghost.mx, ghost.my], [3, 3]);
    assert.equal(ghost.msleeping, true);
    assert.equal(ghost.mstrategy & STRAT_WAITFORU, STRAT_WAITFORU);
    assert.equal(ghost.mgenmklev, true);
    // create_monster() overwrites makemon's gender with the parser choice.
    assert.equal(ghost.female, false);
    assert.equal(state.mvitals[PM_GHOST].born, 1);
    assert.equal(state.context.ident, 4);

    const dagger = level.objects[3][3];
    assert.equal(level.objlist, dagger);
    assert.deepEqual(
        [dagger.otyp, dagger.where, dagger.ox, dagger.oy],
        [DAGGER, OBJ_FLOOR, 3, 3],
    );
    assert.deepEqual(
        [dagger.blessed, dagger.cursed, dagger.spe],
        [false, false, 0],
    );
    assert.deepEqual(
        [
            dagger.oeroded,
            dagger.oeroded2,
            dagger.oerodeproof,
            dagger.greased,
        ],
        [0, 0, false, false],
    );
});

test('Ghost equipment descriptors clear generated blessing and wear state', () => {
    const cases = [
        {
            name: 'erosion, blessing, and grease',
            middle: [
                step('rn2', [11], 0), // take positive enchantment branch
                step('rne', [3], 1), // generate a +1 enchantment
                step('rn2', [2], 1), // generate the dagger blessed
                step('rn2', [20], 19), // do not turn it into an artifact
                step('rn2', [100], 99), // skip erosion proofing
                step('rn2', [80], 0), // generate primary erosion
                step('rn2', [9], 1), // stop primary erosion at one level
                step('rn2', [80], 0), // generate secondary erosion
                step('rn2', [9], 1), // stop secondary erosion at one level
                step('rn2', [1000], 0), // generate grease
            ],
            expectedSpe: 1,
        },
        {
            name: 'erosion proofing',
            middle: [
                step('rn2', [11], 10), // skip positive enchantment
                step('rn2', [10], 9), // skip negative enchantment
                step('rn2', [10], 9), // leave generated BUC neutral
                step('rn2', [20], 19), // do not turn it into an artifact
                step('rn2', [100], 0), // generate erosion proofing
                step('rn2', [1000], 999), // skip grease
            ],
            expectedSpe: 0,
        },
    ];

    for (const scenario of cases) {
        const { level, room } = twoByTwoRoom();
        const state = {
            ...rawMonsterGenerationState(),
            context: { ident: 2 },
            flags: { initalign: 0 },
            in_mklev: true,
            level,
            moves: 0,
            plname: 'Alice',
            urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
        };
        objects_globals_init(state);
        init_artifacts(state);
        const random = scriptedRandom([
            step('rn2', [4], 2), // choose relative coordinate <1,0>
            step('rn2', [100], 0), // pass the 65% dagger equipment gate
            step('rnd', [2], 1), // advance the dagger object identifier
            ...scenario.middle,
            step('rn2', [100], 99), // miss the random-weapon gate
            step('rn2', [100], 99), // miss the bow-and-arrow gate
            step('rn2', [100], 99), // miss the armor gate
            step('rn2', [100], 99), // miss the ring gate
            step('rn2', [100], 99), // miss the scroll gate
        ]);

        run_themeroom_fill(fillById('ghost_of_an_adventurer'), room, 1, {
            state,
            random: random.random,
            hooks: { createMonster: () => ({}) },
        });
        random.assertExhausted();

        const dagger = level.objects[3][3];
        assert.deepEqual(
            [
                dagger.spe,
                dagger.blessed,
                dagger.cursed,
                dagger.oeroded,
                dagger.oeroded2,
                dagger.oerodeproof,
                dagger.greased,
            ],
            [scenario.expectedSpe, false, false, 0, 0, false, false],
            scenario.name,
        );
    }
});

test('Garden creates one sleeping nymph per six points and an uncounted fountain', () => {
    const { level, room } = threeByTwoRoom();
    const state = {
        level,
        u: { uz: { dnum: 2, dlevel: 1 } },
    };
    const random = scriptedRandom([
        step('rn2', [100], 0),
        step('rn1', [3, 2], 2),
        step('rn1', [2, 3], 3),
    ]);
    const monsters = [];

    run_themeroom_fill(fillById('garden'), room, 1, {
        state,
        random: random.random,
        hooks: {
            createMonster(specification) {
                monsters.push(specification);
                return {};
            },
        },
    });

    random.assertExhausted();
    assert.deepEqual(monsters, [{ id: PM_WOOD_NYMPH, asleep: true }]);
    assert.equal(level.at(2, 3).typ, FOUNTAIN);
    assert.equal(level.flags.nfountains, 0);
    assert.equal(state.themeroom_postprocess[2].length, 1);

    const sparse = threeByTwoRoom();
    sparse.level.at(4, 4).edge = true;
    const sparseState = {
        level: sparse.level,
        u: { uz: { dnum: 2, dlevel: 1 } },
    };
    run_themeroom_fill(fillById('garden'), sparse.room, 1, {
        state: sparseState,
        random: randomWithRn2(() => {
            throw new Error('five room points must not consume RNG');
        }),
        hooks: {
            createMonster() {
                throw new Error('five room points must not create a nymph');
            },
        },
    });
    assert.equal(sparseState.themeroom_postprocess[2].length, 1);

    const dozen = twoByTwoRoom();
    // Extending the two-row room through x=7 gives twelve selected points, so
    // the Lua numeric loop must run twice rather than act as a boolean gate.
    dozen.room.hx = 7;
    for (let x = 4; x <= dozen.room.hx; ++x) {
        for (let y = dozen.room.ly; y <= dozen.room.hy; ++y) {
            const location = dozen.level.at(x, y);
            location.typ = ROOM;
            location.roomno = ROOMOFFSET;
            location.edge = false;
        }
    }
    const dozenState = {
        level: dozen.level,
        u: { uz: { dnum: 2, dlevel: 1 } },
    };
    const dozenRandom = scriptedRandom([
        step('rn2', [100], 0), // first nymph requests one fountain
        step('rn2', [100], 99), // second nymph does not request a fountain
    ]);
    const dozenMonsters = [];
    const dozenFeatures = [];
    const dozenEvents = [];
    const dozenRandomFacade = {
        ...dozenRandom.random,
        rn2(bound) {
            dozenEvents.push(`rn2(${bound})`);
            return dozenRandom.random.rn2(bound);
        },
    };
    run_themeroom_fill(fillById('garden'), dozen.room, 1, {
        state: dozenState,
        random: dozenRandomFacade,
        hooks: {
            createMonster(specification) {
                dozenEvents.push('monster');
                dozenMonsters.push(specification);
                return {};
            },
            createFeature(typ) {
                dozenEvents.push('feature');
                dozenFeatures.push(typ);
                return {};
            },
        },
    });
    dozenRandom.assertExhausted();
    assert.deepEqual(dozenMonsters, [
        { id: PM_WOOD_NYMPH, asleep: true },
        { id: PM_WOOD_NYMPH, asleep: true },
    ]);
    assert.deepEqual(dozenFeatures, [FOUNTAIN]);
    assert.deepEqual(dozenEvents, [
        'monster', 'rn2(100)', 'feature', 'monster', 'rn2(100)',
    ]);
    assert.equal(dozenState.themeroom_postprocess[2].length, 1);
});

test('Garden postprocessing grows its snapshot and preserves arboreal doors', () => {
    const { level, room } = twoByTwoRoom();
    for (let x = room.lx - 1; x <= room.hx + 1; ++x) {
        for (let y = room.ly - 1; y <= room.hy + 1; ++y)
            level.at(x, y).typ = DOOR;
    }
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y)
            level.at(x, y).typ = ROOM;
    }
    level.at(1, 2).typ = STONE;
    level.at(2, 2).typ = HWALL;
    level.at(4, 5).typ = VWALL;
    level.at(1, 3).typ = SDOOR;

    const state = {
        level,
        u: { uz: { dnum: 1, dlevel: 1 } },
    };
    run_themeroom_fill(fillById('garden'), room, 1, {
        state,
        random: randomWithRn2(() => {
            throw new Error('four room points must not consume RNG');
        }),
    });
    const queued = state.themeroom_postprocess[1];
    const changes = [];
    const bounds = [];
    const processed = run_themeroom_postprocess({
        state,
        random: randomWithRn2((bound) => {
            bounds.push(bound);
            return 99;
        }),
        hooks: {
            setTerrain(x, y, typ, env) {
                changes.push([x, y, typ]);
                return set_levltyp(x, y, typ, { state: env.state });
            },
        },
    });

    assert.equal(processed, 1);
    assert.deepEqual(bounds, [100, 100, 100, 100]);
    assert.deepEqual(changes, [
        [1, 2, TREE],
        [2, 2, TREE],
        [4, 5, TREE],
        [1, 3, AIR],
    ]);
    assert.equal(level.at(1, 2).typ, TREE);
    assert.equal(level.at(2, 2).typ, TREE);
    assert.equal(level.at(4, 5).typ, TREE);
    assert.equal(level.at(1, 3).typ, SDOOR);
    assert.equal(level.at(1, 3).candig, true);
    assert.equal(level.at(4, 2).typ, DOOR);
    assert.notEqual(state.themeroom_postprocess[1], queued);
    assert.deepEqual(state.themeroom_postprocess[1], []);
    assert.deepEqual(
        [state.xstart, state.ystart, state.xsize, state.ysize],
        [1, 0, COLNO - 1, ROWNO],
    );
    assert.equal(state.in_mk_themerooms, false);
});

test('Buried treasure queues a live chest before rolling each random child', () => {
    for (const noObject of [false, true]) {
        const { level, room } = twoByTwoRoom();
        const state = {
            level,
            u: { uz: { dnum: 3, dlevel: 1 } },
        };
        const chest = noObject
            ? { NO_OBJ: 1, ox: 20, oy: 7 }
            : { ox: 20, oy: 7 };
        const dice = [0, 1, 2];
        const requests = [];
        const random = randomWithRn2((bound) => {
            assert.equal(bound, 4);
            assert.equal(
                state.themeroom_postprocess?.[3]?.length ?? 0,
                noObject ? 0 : 1,
            );
            return dice.shift();
        });

        run_themeroom_fill(fillById('buried_treasure'), room, 1, {
            state,
            random,
            hooks: {
                createObject(specification, _objectRoom, callbackEnv) {
                    requests.push(specification);
                    if (specification.id === CHEST)
                        specification.contents(chest, callbackEnv);
                    return specification.id === CHEST ? chest : {};
                },
            },
        });

        assert.deepEqual(dice, []);
        assert.equal(requests[0].id, CHEST);
        assert.equal(requests[0].buried, true);
        assert.equal(typeof requests[0].contents, 'function');
        assert.equal(requests.length, 7);
        assert.ok(requests.slice(1).every(
            (specification) => Object.keys(specification).length === 0,
        ));
        assert.equal(
            state.themeroom_postprocess?.[3]?.length ?? 0,
            noObject ? 0 : 1,
        );
    }
});

test('Buried treasure postprocessing engraves the source-shaped directions', () => {
    const { level, room } = twoByTwoRoom();
    const state = {
        in_mklev: true,
        level,
        u: { uz: { dnum: 0, dlevel: 1 } },
    };
    const random = scriptedRandom([
        step('rn2', [4], 0),
        step('rn2', [4], 0),
        step('rn2', [4], 0),
        // Whole-level x-major ROOM selection chooses absolute (3,4), which
        // the Lua frame exposes as relative (2,4).
        step('rn2', [4], 3),
    ]);

    run_themeroom_fill(fillById('buried_treasure'), room, 1, {
        state,
        random: random.random,
        hooks: {
            createObject(specification, _objectRoom, callbackEnv) {
                if (specification.id === CHEST) {
                    const chest = { ox: 3, oy: 3 };
                    specification.contents(chest, callbackEnv);
                    return chest;
                }
                return {};
            },
        },
    });
    assert.equal(state.themeroom_postprocess[0].length, 1);
    assert.equal(run_themeroom_postprocess({
        state,
        random: random.random,
    }), 1);
    random.assertExhausted();

    const engraving = engr_at(3, 4, state);
    assert.equal(engraving.engr_txt[0], 'Dig 1 north');
    assert.equal(engraving.engr_type, BURN);
    assert.equal(engraving.engr_time, 0);
    assert.equal(engraving.guardobjects, false);
});

test('Buried treasure formats every directional engraving branch', () => {
    // The room's x-major floor order is (2,3), (2,4), (3,3), (3,4).
    // rndcoord exposes those as whole-level-relative x coordinates 1 or 2.
    // North repeats the real-engraving case above to keep this formatter
    // matrix complete; that earlier case also covers engraving metadata.
    const cases = [
        ['here', { ox: 3, oy: 4 }, 3, { x: 2, y: 4 }, 'Dig here'],
        ['east', { ox: 3, oy: 3 }, 0, { x: 1, y: 3 }, 'Dig 1 east'],
        ['west', { ox: 2, oy: 3 }, 2, { x: 2, y: 3 }, 'Dig 1 west'],
        ['south', { ox: 2, oy: 4 }, 0, { x: 1, y: 3 }, 'Dig 1 south'],
        ['north', { ox: 2, oy: 3 }, 1, { x: 1, y: 4 }, 'Dig 1 north'],
        [
            'diagonal',
            { ox: 3, oy: 4 },
            0,
            { x: 1, y: 3 },
            'Dig 1 east 1 south',
        ],
    ];

    for (const [name, chest, floorIndex, expectedPosition, expectedText]
        of cases) {
        const { level, room } = twoByTwoRoom();
        const state = {
            level,
            u: { uz: { dnum: 0, dlevel: 1 } },
        };
        const random = scriptedRandom([
            // d(3,4) still creates its minimum three random contents.
            step('rn2', [4], 0),
            step('rn2', [4], 0),
            step('rn2', [4], 0),
            step('rn2', [4], floorIndex),
        ]);
        let engraving = null;
        const createEngraving = (position, text) => {
            engraving = { position: { ...position }, text };
            return engraving;
        };

        run_themeroom_fill(fillById('buried_treasure'), room, 1, {
            state,
            random: random.random,
            hooks: {
                createObject(specification, _objectRoom, callbackEnv) {
                    if (specification.id === CHEST) {
                        specification.contents(chest, callbackEnv);
                        return chest;
                    }
                    return {};
                },
            },
        });
        assert.equal(run_themeroom_postprocess({
            state,
            random: random.random,
            hooks: { createEngraving },
        }), 1, name);
        random.assertExhausted();
        assert.deepEqual(engraving, {
            position: expectedPosition,
            text: expectedText,
        }, name);
    }
});

test('Buried treasure owns a real buried container and its random contents', () => {
    const { context, level, random, room, state } = monsterDescriptorFixture();
    state.gz = { zombify: false };
    init_objects(state, () => 0);
    timeout_globals_init(state);
    light_globals_init(state);

    run_themeroom_fill(fillById('buried_treasure'), room, 1, {
        state,
        random,
        spObjectContext: context,
    });

    const chest = level.buriedobjlist;
    assert.equal(chest.otyp, CHEST);
    assert.equal(chest.where, OBJ_BURIED);
    assert.equal(level.objlist, null);
    assert.equal(level.objects[chest.ox][chest.oy], null);
    let childCount = 0;
    for (let child = chest.cobj; child; child = child.nobj) {
        ++childCount;
        assert.equal(child.where, OBJ_CONTAINED);
        assert.equal(child.ocontainer, chest);
    }
    assert.ok(childCount > 0);
    assert.deepEqual(context.containers, []);
    assert.equal(state.themeroom_postprocess[0].length, 1);
});

test('themed-room postprocessing is branch-local and observes live appends', () => {
    const state = { u: { uz: { dnum: 2, dlevel: 1 } } };
    const queue = initialize_themeroom_postprocess_branch(state);
    const order = [];
    queue.push({
        handler() {
            order.push('first');
            queue.push({
                handler() { order.push('appended'); },
                data: null,
            });
        },
        data: null,
    });
    queue.push({
        handler() { order.push('second'); },
        data: null,
    });

    assert.equal(run_themeroom_postprocess({
        state,
        random: quietObjectRandom(),
    }), 3);
    assert.deepEqual(order, ['first', 'second', 'appended']);
    assert.notEqual(state.themeroom_postprocess[2], queue);
    assert.deepEqual(state.themeroom_postprocess[2], []);
});

test('fatal themed-room handlers retain the queue and whole-level frame', () => {
    const state = { u: { uz: { dnum: 3, dlevel: 1 } } };
    const failingQueue = initialize_themeroom_postprocess_branch(state);
    const marker = new Error('postprocess failed');
    const order = [];
    failingQueue.push({
        handler() { order.push('completed prefix'); },
        data: null,
    });
    failingQueue.push({
        handler() {
            order.push('failing handler');
            throw marker;
        },
        data: null,
    });
    failingQueue.push({
        handler() { order.push('unreachable suffix'); },
        data: null,
    });
    assert.throws(
        () => run_themeroom_postprocess({
            state,
            random: quietObjectRandom(),
        }),
        (error) => error === marker,
    );
    assert.deepEqual(order, ['completed prefix', 'failing handler']);
    assert.equal(state.themeroom_postprocess[3], failingQueue);
    assert.equal(failingQueue.length, 3);
    assert.deepEqual(
        [state.xstart, state.ystart, state.xsize, state.ysize],
        [1, 0, COLNO - 1, ROWNO],
    );
    assert.equal(state.in_mk_themerooms, false);
});

test('Teleportation hub preserves source removal, frames, and trap order', () => {
    const { level, room } = threeByTwoRoom();
    const marker = { kind: 'launch-object' };
    const state = {
        ...rawMonsterGenerationState(),
        in_mklev: true,
        launchplace: { x: 99, y: 99, obj: marker },
        level,
    };
    const random = scriptedRandom([
        step('rn2', [3], 2), // request four source points
        step('rn2', [6], 0), // remove and discard left-column (2,3)
        step('rn2', [5], 1), // queue source (3,3)
        step('rn2', [4], 0), // remove and discard left-column (2,4)
        step('rn2', [3], 2), // queue source (4,4)
        // First destination rejects the same row, then the same column.
        step('rn2', [6], 0),
        step('rn2', [5], 2),
        step('rn2', [4], 3),
        step('rnd', [4], 4),
        // Each queued trap starts from a fresh destination selection.
        step('rn2', [6], 0),
        step('rnd', [4], 4),
    ]);

    run_themeroom_fill(fillById('teleportation_hub'), room, 1, {
        state,
        random: random.random,
    });
    assert.deepEqual(
        state.themeroom_postprocess[0].map((entry) => entry.data.coordinate),
        [{ x: 2, y: 3 }, { x: 3, y: 4 }],
    );
    assert.equal(level.traps.length, 0);

    assert.equal(run_themeroom_postprocess({
        state,
        random: random.random,
    }), 2);
    random.assertExhausted();
    assert.deepEqual(
        level.traps.map((trap) => ({
            source: [trap.tx, trap.ty],
            destination: [trap.teledest.x, trap.teledest.y],
            type: trap.ttyp,
            seen: trap.tseen,
        })),
        [
            {
                source: [4, 4],
                destination: [2, 3],
                type: TELEP_TRAP,
                seen: true,
            },
            {
                source: [3, 3],
                destination: [4, 4],
                type: TELEP_TRAP,
                seen: true,
            },
        ],
    );
    assert.deepEqual(
        [state.xstart, state.ystart, state.xsize, state.ysize],
        [1, 0, 79, 21],
    );
    assert.deepEqual(state.launchplace, { x: 0, y: 0, obj: marker });
});

test('Teleportation hub retains an invalid column-zero destination', () => {
    const { level, room } = twoByTwoRoom();
    level.at(1, 0).typ = ROOM;
    const state = {
        ...rawMonsterGenerationState(),
        in_mklev: true,
        level,
    };
    const random = scriptedRandom([
        step('rn2', [3], 0),
        step('rn2', [4], 0), // discard source (2,3)
        step('rn2', [3], 1), // queue source (3,3)
        step('rn2', [5], 0), // destination relative (0,0)
        step('rnd', [4], 4),
    ]);

    run_themeroom_fill(fillById('teleportation_hub'), room, 1, {
        state,
        random: random.random,
    });
    assert.equal(run_themeroom_postprocess({
        state,
        random: random.random,
    }), 1);
    random.assertExhausted();
    assert.equal(level.traps.length, 1);
    assert.deepEqual(level.traps[0].teledest, { x: 0, y: 0 });
});

test('Teleportation hub abandons a queued source that becomes stairs', () => {
    const { level, room } = twoByTwoRoom();
    const state = {
        ...rawMonsterGenerationState(),
        in_mklev: true,
        level,
    };
    const random = scriptedRandom([
        step('rn2', [3], 0),
        step('rn2', [4], 0), // discard source (2,3)
        step('rn2', [3], 1), // queue source (3,3)
        step('rn2', [3], 0), // reject destination (2,4): same row
        step('rn2', [2], 0), // accept destination (3,4)
    ]);

    run_themeroom_fill(fillById('teleportation_hub'), room, 1, {
        state,
        random: random.random,
    });
    level.at(3, 3).typ = STAIRS;
    assert.equal(run_themeroom_postprocess({
        state,
        random: random.random,
    }), 1);
    random.assertExhausted();
    assert.equal(level.traps.length, 0);
    assert.deepEqual(
        [state.launchplace.x, state.launchplace.y],
        [0, 0],
    );
});

test('Statuary rolls every statue before its random room traps', () => {
    const { level, room } = twoByTwoRoom();
    const random = scriptedRandom([
        // Five d5 rolls yield 1 + 2 + 3 + 4 + 5 = 15 floor statues.
        step('rn2', [5], 0),
        step('rn2', [5], 1),
        step('rn2', [5], 2),
        step('rn2', [5], 3),
        step('rn2', [5], 4),
        step('rn2', [3], 1), // d3 yields two living-statue traps
        // The two room-coordinate pairs select (3,3), then (2,4).
        step('rn1', [2, 2], 3),
        step('rn1', [2, 3], 3),
        step('rn1', [2, 2], 2),
        step('rn1', [2, 3], 4),
    ]);
    const events = [];

    run_themeroom_fill(fillById('statuary'), room, 1, {
        state: { level },
        random: random.random,
        hooks: {
            createObject(specification) {
                events.push(['object', specification]);
                return {};
            },
            createTrap(type, flags, x, y) {
                events.push(['trap', type, flags, x, y]);
                return {};
            },
        },
    });
    random.assertExhausted();

    assert.deepEqual(events, [
        ...Array.from({ length: 15 }, () => ['object', { id: STATUE }]),
        ['trap', STATUE_TRAP, MKTRAP_MAZEFLAG, 3, 3],
        ['trap', STATUE_TRAP, MKTRAP_MAZEFLAG, 2, 4],
    ]);
});

test('Statuary composes floor statues with living statue traps', () => {
    const { level, room, state } = statuaryGenerationFixture();
    // Five zero d5 results create five floor statues; the maximum d3 result
    // creates three living-statue traps, for eight statue objects in total.
    let leadingDice = 5;
    let roomCoordinateCall = 0;
    // Cycle through every square of the 2x2 room for coordinate requests.
    const offsets = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const random = {
        d(number, sides) { return number * sides; },
        rn1(bound, base) {
            if (bound === 2 && (base === room.lx || base === room.ly)) {
                const pair = Math.trunc(roomCoordinateCall / 2);
                const axis = roomCoordinateCall % 2;
                ++roomCoordinateCall;
                return base + offsets[pair % offsets.length][axis];
            }
            return base;
        },
        rn2(bound) {
            if (leadingDice) {
                assert.equal(bound, 5);
                --leadingDice;
                return 0;
            }
            return Math.max(0, bound - 1);
        },
        rnd() { return 1; },
        rne() { return 1; },
        rnz(value) { return value; },
    };

    run_themeroom_fill(fillById('statuary'), room, 1, { state, random });

    const statues = [];
    for (let obj = level.objlist; obj; obj = obj.nobj) {
        if (obj.otyp === STATUE) statues.push(obj);
    }
    assert.equal(leadingDice, 0);
    assert.equal(roomCoordinateCall, 16);
    assert.equal(statues.length, 8);
    assert.equal(level.traps.length, 3);
    assert.deepEqual(
        level.traps.map((trap) => [trap.ttyp, trap.tx, trap.ty]),
        [
            [STATUE_TRAP, 3, 4],
            [STATUE_TRAP, 2, 4],
            [STATUE_TRAP, 3, 3],
        ],
    );
    assert.equal(state.iflags.purge_monsters, 3);
    const detached = [];
    for (let monster = level.monlist; monster; monster = monster.nmon) {
        assert.equal(monster.mhp, 0);
        detached.push(monster);
    }
    assert.equal(detached.length, 3);

    assert.equal(dmonsfree(state), 3);
    assert.equal(level.monlist, null);
    assert.equal(state.iflags.purge_monsters, 0);
    assert.deepEqual(detached.map((monster) => monster.nmon), [null, null, null]);
});
