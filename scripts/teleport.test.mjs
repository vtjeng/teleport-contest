import assert from 'node:assert/strict';
import test from 'node:test';

import {
    D_CLOSED,
    DOOR,
    DUST,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    LAVAPOOL,
    POOL,
    ROOM,
    STONE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_SEWER_RAT,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import {
    add_rect_to_reg,
    add_region,
    create_region,
} from '../js/region.js';
import {
    collect_coords,
    enexto_core,
    goodpos,
    mnexto,
} from '../js/teleport.js';
import { BOULDER, SCR_SCARE_MONSTER } from '../js/objects.js';

function positionState() {
    const state = {
        astral_level: { dnum: 9, dlevel: 1 },
        dungeons: [{ flags: { hellish: false } }],
        level: new GameMap(),
        moves: 0,
        u: {
            ux: 10,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return state;
}

function boundsRandom(result = 0) {
    const bounds = [];
    return {
        random: {
            rn2(bound) {
                bounds.push(bound);
                return result;
            },
        },
        bounds,
    };
}

function descending(from) {
    return Array.from({ length: from - 1 }, (_, index) => from - index);
}

test('collect_coords shuffles every complete interior ring in source order', () => {
    const state = positionState();
    const draws = boundsRandom();
    const coordinates = collect_coords(
        40,
        10,
        3,
        0,
        null,
        { state, random: draws.random },
    );

    assert.equal(coordinates.length, 48);
    assert.deepEqual(draws.bounds, [
        ...descending(8),
        ...descending(16),
        ...descending(24),
    ]);
    assert.deepEqual(coordinates.slice(0, 8), [
        { x: 39, y: 9 }, { x: 40, y: 9 }, { x: 41, y: 9 },
        { x: 39, y: 10 }, { x: 41, y: 10 },
        { x: 39, y: 11 }, { x: 40, y: 11 }, { x: 41, y: 11 },
    ]);
});

test('collect_coords clips edge rings before deriving shuffle bounds', () => {
    const state = positionState();
    const draws = boundsRandom();
    const coordinates = collect_coords(
        3,
        2,
        3,
        0,
        null,
        { state, random: draws.random },
    );

    assert.equal(coordinates.length, 35);
    assert.deepEqual(draws.bounds, [
        ...descending(8),
        ...descending(16),
        ...descending(11),
    ]);
});

test('enexto_core finishes all nearby shuffles before selecting first good spot', () => {
    const state = positionState();
    state.level.at(9, 9).typ = ROOM;
    state.level.at(10, 9).typ = ROOM;
    const firstDraws = boundsRandom();
    assert.deepEqual(
        enexto_core(10, 10, state.mons[PM_LITTLE_DOG], 0, {
            state,
            random: firstDraws.random,
        }),
        { x: 9, y: 9 },
    );
    assert.equal(firstDraws.bounds.length, 45);

    const blocker = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 20,
    });
    place_monster(blocker, 9, 9, state);
    const secondDraws = boundsRandom();
    assert.deepEqual(
        enexto_core(10, 10, state.mons[PM_LITTLE_DOG], 0, {
            state,
            random: secondDraws.random,
        }),
        { x: 10, y: 9 },
    );
    assert.deepEqual(secondDraws.bounds, firstDraws.bounds);
});

test('goodpos applies startup pet terrain, occupant, object, and scary checks', () => {
    for (const pettype of [PM_LITTLE_DOG, PM_KITTEN, PM_PONY]) {
        const state = positionState();
        const x = 12;
        const y = 10;
        const location = state.level.at(x, y);
        const fake = {
            data: state.mons[pettype],
            m_id: 0,
            mundetected: false,
            wormno: 0,
        };
        const env = { state, random: { rn2: () => 0 } };
        const flags = GP_CHECKSCARY | GP_AVOID_MONPOS;

        location.typ = ROOM;
        assert.equal(goodpos(x, y, fake, flags, env), true);
        assert.equal(goodpos(state.u.ux, state.u.uy, fake, flags, env), false);

        const blocker = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 1,
            mhpmax: 1,
            m_id: 40,
        });
        place_monster(blocker, x, y, state);
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.monsters[x][y] = null;

        for (const typ of [STONE, POOL, LAVAPOOL]) {
            location.typ = typ;
            assert.equal(goodpos(x, y, fake, flags, env), false);
        }
        location.typ = DOOR;
        location.flags = D_CLOSED;
        assert.equal(goodpos(x, y, fake, flags, env), false);

        location.typ = ROOM;
        location.flags = 0;
        state.level.objects[x][y] = { otyp: BOULDER, nexthere: null };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.objects[x][y] = {
            otyp: SCR_SCARE_MONSTER,
            nexthere: null,
        };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.level.objects[x][y] = null;

        state.head_engr = {
            nxt_engr: null,
            engr_x: x,
            engr_y: y,
            engr_txt: ['eLbErEtH'],
            engr_time: 0,
            engr_type: DUST,
        };
        assert.equal(goodpos(x, y, fake, flags, env), false);
        state.head_engr.engr_txt[0] = 'Elbereth!';
        assert.equal(goodpos(x, y, fake, flags, env), true);
        state.head_engr = null;

        state.level.traps.push({ tx: x, ty: y });
        assert.equal(goodpos(x, y, fake, flags, env), true);
        assert.equal(goodpos(x, y, fake, flags, {
            ...env,
            isExclusionZone: () => true,
        }), false);
    }
});

test('mnexto preserves monster identity and list linkage while relocating', () => {
    const state = positionState();
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 80,
        mtrack: Array.from({ length: 4 }, (_, index) => ({
            x: index + 1,
            y: index + 2,
        })),
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const draws = boundsRandom();

    const relocated = mnexto(monster, 0, {
        state,
        random: draws.random,
    });
    assert.equal(relocated, monster);
    assert.equal(state.level.monlist, monster);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[9][9], monster);
    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.deepEqual([monster.mux, monster.muy], [10, 10]);
    assert.deepEqual(
        monster.mtrack,
        Array.from({ length: 4 }, () => ({ x: 0, y: 0 })),
    );
    assert.equal(draws.bounds.length, 45);
});

test('mnexto refreshes every gas-region monster membership after relocation', () => {
    const state = positionState();
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 83,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const second = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 84,
    });
    const third = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 85,
    });
    place_monster(second, 11, 10, state);
    place_monster(third, 12, 10, state);

    const oldOnly = create_region();
    add_rect_to_reg(oldOnly, { lx: 10, ly: 10, hx: 12, hy: 10 });
    add_region(oldOnly, state);
    const newOnly = create_region();
    add_rect_to_reg(newOnly, { lx: 9, ly: 9, hx: 9, hy: 9 });
    add_region(newOnly, state);
    const both = create_region();
    add_rect_to_reg(both, { lx: 9, ly: 9, hx: 9, hy: 9 });
    add_rect_to_reg(both, { lx: 10, ly: 10, hx: 10, hy: 10 });
    add_region(both, state);
    assert.deepEqual(
        [oldOnly.monsters, newOnly.monsters, both.monsters],
        [[monster.m_id, second.m_id, third.m_id], [], [monster.m_id]],
    );

    mnexto(monster, 0, {
        state,
        random: boundsRandom().random,
    });

    assert.deepEqual([monster.mx, monster.my], [9, 9]);
    assert.deepEqual(
        [oldOnly.monsters, newOnly.monsters, both.monsters],
        [[third.m_id, second.m_id], [monster.m_id], [monster.m_id]],
    );
});

test('mnexto honors wizard monster-teleport control before relocation', () => {
    const state = positionState();
    state.iflags = { mon_telecontrol: true };
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 81,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);
    const draws = boundsRandom();
    const calls = [];

    const relocated = mnexto(monster, 37, {
        state,
        random: draws.random,
        controlMonsterTeleport(controlled, coordinate, flags, viaRloc) {
            calls.push([controlled, { ...coordinate }, flags, viaRloc]);
            coordinate.x = 12;
            coordinate.y = 10;
            return true;
        },
    });
    assert.equal(relocated, monster);
    assert.deepEqual([monster.mx, monster.my], [12, 10]);
    assert.equal(state.level.monsters[10][10], null);
    assert.equal(state.level.monsters[12][10], monster);
    assert.deepEqual(calls, [[monster, { x: 9, y: 9 }, 37, false]]);
});

test('mnexto fails before relocation when wizard control is unavailable', () => {
    const state = positionState();
    state.iflags = { mon_telecontrol: true };
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) state.level.at(x, y).typ = ROOM;
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
        mhpmax: 1,
        m_id: 82,
    });
    state.level.monlist = monster;
    place_monster(monster, state.u.ux, state.u.uy, state);

    assert.throws(
        () => mnexto(monster, 0, {
            state,
            random: boundsRandom().random,
        }),
        /montelecontrol/,
    );
    assert.deepEqual([monster.mx, monster.my], [10, 10]);
    assert.equal(state.level.monsters[10][10], monster);
});
