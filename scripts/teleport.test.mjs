import assert from 'node:assert/strict';
import test from 'node:test';

import {
    D_CLOSED,
    DOOR,
    DUST,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    LAVAPOOL,
    MON_FLOOR,
    MON_MIGRATING,
    POOL,
    ROOM,
    STONE,
    STRAT_APPEARMSG,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_ORCUS,
    PM_PONY,
    PM_SEWER_RAT,
    PM_WIZARD_OF_YENDOR,
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
    noteleport_level,
    random_teleport_level,
    rloc,
    rloc_to,
} from '../js/teleport.js';
import { resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { BOULDER, SCR_SCARE_MONSTER } from '../js/objects.js';

function positionState() {
    const state = {
        astral_level: { dnum: 9, dlevel: 1 },
        dungeons: [{ flags: { hellish: false } }],
        level: new GameMap(),
        moves: 1,
        u: {
            ux: 10,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    state.level.flags.stasis_until = 0;
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

test('noteleport_level applies natural levels and stasis in source order', () => {
    const state = positionState();
    const ordinary = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
    });
    const covetous = newMonster({
        data: state.mons[PM_WIZARD_OF_YENDOR],
        mhp: 1,
    });

    state.level.flags.noteleport = true;
    assert.equal(noteleport_level(ordinary, state), true);
    assert.equal(noteleport_level(covetous, state), false);

    state.level.flags.stasis_until = state.moves;
    assert.equal(noteleport_level(covetous, state), true);
});

test('noteleport_level counts only living on-map demon-court blockers', () => {
    const state = positionState();
    state.dungeons[0].flags.hellish = true;
    const ordinary = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 1,
    });
    const prince = newMonster({
        data: state.mons[PM_ORCUS],
        mhp: 0,
        mstate: MON_FLOOR,
    });
    state.level.monlist = prince;

    assert.equal(noteleport_level(ordinary, state), false);
    prince.mhp = 1;
    prince.mstate = MON_MIGRATING;
    assert.equal(noteleport_level(ordinary, state), false);
    prince.mstate = MON_FLOOR;
    assert.equal(noteleport_level(ordinary, state), true);
    assert.equal(noteleport_level(prince, state), false);
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

test('rloc keeps random coordinate and relocation side effects in source order',
    () => {
        const state = positionState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for the coordinate index.
            mhpmax: 2,
            m_id: 81, // A nonzero id selects live-monster scary checks.
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);
        const calls = [];

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 12; // Selects the prepared accessible column.
                },
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 9; // Selects the prepared accessible row.
                },
            },
            newsym(x, y) {
                calls.push(`newsym(${x},${y})`);
                if (x === 10 && y === 11) {
                    assert.equal(state.level.monsters[x][y], null);
                    assert.equal(state.level.monsters[12][9], null);
                } else {
                    assert.equal(state.level.monsters[x][y], monster);
                }
            },
            onscary: () => false,
            setApparxy: () => calls.push('set_apparxy'),
        }), true);

        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.deepEqual(calls, [
            'rnd(79)',
            'rn2(21)',
            'newsym(10,11)',
            'newsym(12,9)',
            'set_apparxy',
        ]);
        assert.equal(state.level.monsters[10][11], null);
        assert.equal(state.level.monsters[12][9], monster);
    });

test('rloc returns immediately when random selection finds the current square',
    () => {
        const state = positionState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for rloc_to_core().
            mhpmax: 2,
            m_id: 82, // A nonzero id selects live-monster scary checks.
        });
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 12, 9, state);
        const calls = [];

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    calls.push(`rnd(${bound})`);
                    return 12; // Select the monster's current column.
                },
                rn2(bound) {
                    calls.push(`rn2(${bound})`);
                    return 9; // Select the monster's current row.
                },
            },
            newsym: () => calls.push('newsym'),
            onscary: () => false,
            setApparxy: () => calls.push('set_apparxy'),
        }), true);

        assert.deepEqual(calls, ['rnd(79)', 'rn2(21)']);
        assert.equal(state.level.monsters[12][9], monster);
    });

test('rloc carries ordinary inventory without invoking shop side effects',
    () => {
        const state = positionState();
        const carried = {
            no_charge: false,
            unpaid: false,
            nobj: null,
        };
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live carrier is required for relocation.
            mhpmax: 2,
            m_id: 88, // A nonzero id selects live-monster scary checks.
            minvent: carried,
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd: () => 12, // The prepared accessible destination column.
                rn2: () => 9, // The prepared accessible destination row.
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        }), true);

        assert.deepEqual([monster.mx, monster.my], [12, 9]);
        assert.equal(monster.minvent, carried);
        assert.deepEqual(
            [carried.no_charge, carried.unpaid],
            [false, false],
        );
    });

test('rloc rejects carried shop state before its first destination draw', () => {
    for (const property of ['no_charge', 'unpaid']) {
        const state = positionState();
        const carried = {
            no_charge: false,
            unpaid: false,
            nobj: null,
            [property]: true,
        };
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live carrier is required for relocation.
            mhpmax: 2,
            m_id: 89, // A nonzero id selects live-monster scary checks.
            minvent: carried,
        });
        state.level.at(10, 11).typ = ROOM;
        place_monster(monster, 10, 11, state);
        let draws = 0;

        assert.throws(() => rloc(monster, 0, {
            state,
            random: {
                rnd: () => ++draws,
                rn2: () => ++draws,
            },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        }), /random relocation of carried shop goods/u);
        assert.equal(draws, 0);
        assert.deepEqual([monster.mx, monster.my], [10, 11]);
    }
});

test('rloc refuses each rloc_to_core tail state on its own', () => {
    // teleport.c rloc_to_core() ends with tails this port does not run: the
    // ustuck unstick block (1690-1698), the appearance message the
    // STRAT_APPEARMSG bit forces (1702-1731), `if (go.occupation) (void)
    // dochugw(mtmp, FALSE);` (1761-1762) and mintrap() for a trapped monster
    // (1765-1766); a worm and a hidden monster reach maybe_unhide_at() and the
    // segment walk instead. Each is set alone, so a guard joining any two of
    // them would let that state through.
    //
    // The occupation term names state.go.occupation, cmd.c set_occupation()'s
    // home for C's go.occupation. It used to name a bare state.occupation that
    // nothing in js/ assigns, so it refused nothing.
    for (const [name, set] of [
        ['wormno', (mon) => { mon.wormno = 3; }],
        ['ustuck', (mon, state) => { state.u.ustuck = mon; }],
        ['mtrapped', (mon) => { mon.mtrapped = 1; }],
        ['mundetected', (mon) => { mon.mundetected = 1; }],
        ['occupation', (mon, state) => { state.go.occupation = () => 0; }],
        ['appearmsg', (mon) => { mon.mstrategy |= STRAT_APPEARMSG; }],
    ]) {
        const state = positionState();
        state.go = {};
        state.level.at(10, 11).typ = ROOM;
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster selects the ordinary relocation path.
            mhpmax: 2,
            m_id: 89, // A nonzero id selects live-monster scary checks.
        });
        place_monster(monster, 10, 11, state);
        let draws = 0;
        set(monster, state);

        assert.throws(() => rloc(monster, 0, {
            state,
            random: { rnd: () => ++draws, rn2: () => ++draws },
            newsym: () => {},
            onscary: () => false,
            setApparxy: () => {},
        }), /extended rloc_to_core side effects/u, name);
        // The guard precedes every destination draw, so the refusal is atomic.
        assert.equal(draws, 0, name);
        assert.deepEqual([monster.mx, monster.my], [10, 11], name);
    }
});

test('rloc exhausts fifty trials before its unshuffled fallback and backup',
    () => {
        const state = positionState();
        const monster = newMonster({
            data: state.mons[PM_SEWER_RAT],
            mhp: 2, // A live monster is required for relocation.
            mhpmax: 2,
            m_id: 86, // A nonzero id selects the injected onscary operation.
        });
        state.level.at(10, 11).typ = ROOM;
        state.level.at(12, 9).typ = ROOM;
        place_monster(monster, 10, 11, state);
        const bounds = [];
        let scaryCalls = 0;

        assert.equal(rloc(monster, 0, {
            state,
            random: {
                rnd(bound) {
                    bounds.push(`rnd(${bound})`);
                    return 1; // All fifty trials select inaccessible stone.
                },
                rn2(bound) {
                    bounds.push(`rn2(${bound})`);
                    return 0; // Row zero is stone; fallback keeps source order.
                },
            },
            newsym: () => {},
            onscary() {
                ++scaryCalls;
                return true; // Force the sole candidate into backupcc.
            },
            setApparxy: () => {},
        }), true);

        assert.equal(bounds.length, 101);
        assert.deepEqual(bounds.slice(0, 4), [
            'rnd(79)', 'rn2(21)', 'rnd(79)', 'rn2(21)',
        ]);
        assert.deepEqual(bounds.slice(-3), [
            'rnd(79)', 'rn2(21)', 'rn2(1)',
        ]);
        // goodpos() checks scary squares before its final accessibility test:
        // once per failed random trial, then once for the fallback candidate.
        assert.equal(scaryCalls, 51);
        assert.deepEqual([monster.mx, monster.my], [12, 9]);
    });

test('rloc preflights live relocation operations before its first draw', () => {
    const state = positionState();
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2, // A live monster is required for relocation.
        mhpmax: 2,
        m_id: 87, // A nonzero id selects live-monster scary checks.
    });
    state.level.at(10, 11).typ = ROOM;
    place_monster(monster, 10, 11, state);
    let draws = 0;

    assert.throws(() => rloc(monster, 0, {
        state,
        random: {
            rnd() {
                ++draws;
                return 12;
            },
            rn2() {
                ++draws;
                return 9;
            },
        },
        // Omit newsym to exercise atomic dependency validation.
        onscary: () => false,
        setApparxy: () => {},
    }), /random relocation without newsym/u);
    assert.equal(draws, 0);
    assert.equal(state.level.monsters[10][11], monster);
});

// teleport.c rloc_to(), which is rloc_to_core() with RLOC_NOMSG. dog.c
// mon_arrive() reaches it with mtmp->mx == 0, and every tail below the
// placement refuses instead of running.
function arrivingMonster(state) {
    const monster = newMonster({
        data: state.mons[PM_SEWER_RAT],
        mhp: 2,
        mhpmax: 2,
        m_id: 91,
    });
    // dog.c relmon() leaves a monster on either travelling list at <0,0>.
    monster.mx = 0;
    monster.my = 0;
    return monster;
}

test('rloc_to places a monster that holds no square', () => {
    const state = positionState();
    state.level.at(10, 11).typ = ROOM;
    const monster = arrivingMonster(state);

    assert.equal(rloc_to(monster, 10, 11, { state, newsym: () => {} }),
        monster);
    assert.deepEqual([monster.mx, monster.my], [10, 11]);
    assert.equal(state.level.monsters[10][11], monster);
    // set_apparxy() answers the hero's own square for the tame followers
    // mon_arrive() admits.
    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('rloc_to refuses each state whose tail it does not run', () => {
    const state = positionState();
    state.level.at(10, 11).typ = ROOM;

    // A monster still on the map belongs to rloc_to_core()'s "pick up" block,
    // which this port does not have.
    const placed = arrivingMonster(state);
    placed.mx = 10;
    placed.my = 11;
    assert.throws(() => rloc_to(placed, 12, 11, { state, newsym: () => {} }),
        /already on the map/u);

    // Each term of the side-effect guard on its own. The occupation term names
    // state.go.occupation, where cmd.c set_occupation() puts C's
    // go.occupation; it used to name a bare state.occupation that nothing in
    // js/ assigns, so it refused nothing.
    state.go = {};
    for (const set of [
        (mon) => { mon.isshk = true; },
        (mon) => { mon.wormno = 3; },
        (mon) => { state.u.ustuck = mon; },
        (mon) => { mon.mtrapped = 1; },
        () => { state.go.occupation = () => 0; },
    ]) {
        const monster = arrivingMonster(state);
        state.u.ustuck = null;
        state.go.occupation = null;
        set(monster);
        assert.throws(
            () => rloc_to(monster, 10, 11, { state, newsym: () => {} }),
            /extended rloc_to_core side effects/u,
        );
        assert.equal(state.level.monsters[10][11] ?? null, null);
    }
    state.u.ustuck = null;
    state.go.occupation = null;

    // Carried shop goods reach stolen_value() and make_angry_shk(); either
    // field on any carried object is enough.
    for (const field of ['no_charge', 'unpaid']) {
        const monster = arrivingMonster(state);
        monster.minvent = { nobj: { nobj: null, [field]: 1 } };
        assert.throws(
            () => rloc_to(monster, 10, 11, { state, newsym: () => {} }),
            /carried shop goods/u,
        );
    }
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

// ── random_teleport_level ──

// Minimal state for random_teleport_level(). The function reads dungeon
// topology, the hero's current level, and the PRNG, but makes no screen or
// state changes itself. Is_botlevel() and In_quest() in const.js access the
// global `game` object, so this helper writes dungeon topology there too.
function randomTeleportState({
    dnum = 0,
    dlevel = 1,
    depth_start = 1,
    num_dunlevs = 10,
    hellish = false,
    invoked = false,
} = {}) {
    const state = resetGame();
    state.astral_level = { dnum: 9, dlevel: 1 };
    state.dungeons = [{
        depth_start,
        num_dunlevs,
        ledger_start: 0,
        flags: { hellish },
    }];
    state.u = {
        uz: { dnum, dlevel },
        uevent: { invoked },
    };
    state.branches = [];
    state.quest_dnum = 99; // not reachable from dnum 0
    return state;
}

test('random_teleport_level returns cur_depth when rn2(5) is 0', () => {
    // C ref: teleport.c:2196, `!rn2(5)`. Seed 1 gives rn2(5)=0 on the
    // first draw, so the function returns without picking a destination.
    const state = randomTeleportState({ dlevel: 3 });
    initRng(1);
    enableRngLog();
    // depth(u.uz) = depth_start + dlevel - 1 = 1 + 3 - 1 = 3
    assert.equal(random_teleport_level(state), 3);
    assert.deepEqual(getRngLog(), ['rn2(5)=0']);
});

test('random_teleport_level picks a different level when rn2(5) is nonzero',
    () => {
    // C ref: teleport.c:2239. Seed 2 on D:1 (depth 1) of a 10-level main
    // dungeon: rn2(5)=3 (continues), rn2(3)=0 (nlev = 0+1 = 1, then 1>=1
    // so nlev++ = 2). The result is depth 2, one level below the hero.
    const state = randomTeleportState({ dlevel: 1, num_dunlevs: 10 });
    initRng(2);
    enableRngLog();
    assert.equal(random_teleport_level(state), 2);
    assert.deepEqual(getRngLog(), ['rn2(5)=3', 'rn2(3)=0']);
});

test('random_teleport_level clamps and adjusts at the bottom level', () => {
    // C ref: teleport.c:2243-2248. Seed 6 on D:10 (depth 10, the bottom):
    // rn2(5)=4 (continues), rn2(12)=9, nlev = 9+1 = 10, 10>=10 so nlev=11,
    // 11 > max_depth (10) so nlev = 10, then Is_botlevel so nlev -= rnd(3)=3,
    // final nlev = 7. The hero teleports three levels up.
    const state = randomTeleportState({ dlevel: 10, num_dunlevs: 10 });
    initRng(6);
    enableRngLog();
    assert.equal(random_teleport_level(state), 7);
    assert.deepEqual(getRngLog(), ['rn2(5)=4', 'rn2(12)=9', 'rnd(3)=3']);
});
