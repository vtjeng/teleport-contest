import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    BURN_OBJECT,
    ICE,
    LS_OBJECT,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    OBJ_FLOOR,
    ROOM,
    ROOMOFFSET,
    STRAT_WAITFORU,
    TIMER_LEVEL,
    TIMER_OBJECT,
    WEB,
} from '../js/const.js';
import { init_artifacts } from '../js/artifacts.js';
import { GameMap } from '../js/game.js';
import { light_globals_init } from '../js/light.js';
import {
    run_themeroom_fill,
    themeroom_fill,
} from '../js/themeroom_fill.js';
import { THEMEROOM_FILL_DEFINITIONS } from '../js/themerooms.js';
import {
    ARMOR_CLASS,
    ARROW,
    BOW,
    DAGGER,
    RING_CLASS,
    SCROLL_CLASS,
    WEAPON_CLASS,
    OIL_LAMP,
    objects_globals_init,
} from '../js/objects.js';
import {
    PM_ARCHEOLOGIST,
    PM_GHOST,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';
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

test('unported fill handlers fail closed', () => {
    const { level, room } = twoByTwoRoom();
    assert.throws(
        () => run_themeroom_fill(fillById('cloud_room'), room, 1, {
            state: { level },
            random: randomWithRn2(() => 0),
        }),
        /unported themed-room fill: Cloud room/,
    );
});
