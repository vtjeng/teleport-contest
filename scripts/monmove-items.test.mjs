import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    PIT,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SHOPBASE,
} from '../js/const.js';
import {
    mon_would_consume_item,
    mon_would_take_item,
    m_search_items,
    select_postmove_object_action,
} from '../js/monmove.js';
import {
    PM_COCKATRICE,
    PM_GIANT_RAT,
    PM_GHOUL,
    PM_GNOME,
    PM_HUMAN,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    PM_WHITE_UNICORN,
    monst_globals_init,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    CORPSE,
    DAGGER,
    EMERALD,
    FOOD_RATION,
    IRON_CHAIN,
    ROCK,
    objects_globals_init,
} from '../js/objects.js';

function makeState() {
    const state = {
        context: {
            achieveo: {
                mines_prize_oid: 0,
                soko_prize_oid: 0,
            },
        },
        head_engr: null,
        moves: 2,
        u: {
            usteed: null,
            ux: 20,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    const locations = Array.from({ length: COLNO }, () =>
        Array.from({ length: ROWNO }, () => ({
            edge: false,
            flags: 0,
            lit: true,
            roomno: 0,
            typ: ROOM,
            wall_info: 0,
        })));
    state.level = {
        at: (x, y) => locations[x]?.[y],
        flags: {
            has_shop: false,
            sokoban_rules: false,
        },
        locations,
        monsters: Array.from({ length: COLNO }, () =>
            Array(ROWNO).fill(null)),
        objects: Array.from({ length: COLNO }, () =>
            Array(ROWNO).fill(null)),
        rooms: [],
        traps: [],
    };
    state.viz_array = Array.from({ length: ROWNO }, () =>
        new Uint8Array(COLNO));
    return state;
}

function makeMonster(state, pmidx = PM_ROCK_MOLE, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        m_id: 5001,
        m_lev: state.mons[pmidx].mlevel,
        mcanmove: true,
        mcansee: true,
        mhp: 10,
        mhpmax: 10,
        mnum: pmidx,
        mx: 10,
        my: 10,
        mux: 20,
        muy: 10,
        ...overrides,
    });
}

function makeObject(state, otyp, x, y, overrides = {}) {
    const type = state.objects[otyp];
    return newObject({
        no_charge: true,
        o_id: 6001,
        oclass: type.oc_class,
        otyp,
        owt: type.oc_weight,
        ox: x,
        oy: y,
        quan: 1,
        spe: 0,
        where: 1,
        ...overrides,
    });
}

function placeObject(state, object) {
    object.nexthere = state.level.objects[object.ox][object.oy];
    state.level.objects[object.ox][object.oy] = object;
    return object;
}

function placeMonster(state, monster) {
    state.level.monsters[monster.mx][monster.my] = monster;
    return monster;
}

function searchEnv(state, overrides = {}) {
    return {
        canSee: () => false,
        costlySpot: () => false,
        couldReachItem: () => true,
        monsterCanSee: () => true,
        random: {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        },
        state,
        ...overrides,
    };
}

test('monster item preference preserves carry, identity, and material gates',
    () => {
        const state = makeState();
        const mole = makeMonster(state);
        const dagger = makeObject(state, DAGGER, 9, 10);
        assert.equal(mon_would_take_item(mole, dagger, { state }), true);

        state.uball = dagger;
        assert.equal(mon_would_take_item(mole, dagger, { state }), false);
        state.uball = null;

        const unicorn = makeMonster(state, PM_WHITE_UNICORN);
        assert.equal(mon_would_take_item(unicorn, dagger, { state }), false);
        assert.equal(
            mon_would_take_item(
                unicorn,
                makeObject(state, EMERALD, 9, 10),
                { state },
            ),
            true,
        );
    });

test('monster corpse consumption excludes petrifying corpses', () => {
    const state = makeState();
    const worm = makeMonster(state, PM_PURPLE_WORM);
    assert.equal(
        mon_would_consume_item(
            worm,
            makeObject(state, FOOD_RATION, 9, 10),
            { state },
        ),
        false,
    );
    assert.equal(
        mon_would_consume_item(
            worm,
            makeObject(state, CORPSE, 9, 10, {
                corpsenm: PM_HUMAN,
            }),
            { state },
        ),
        true,
    );
    assert.equal(
        mon_would_consume_item(
            worm,
            makeObject(state, CORPSE, 9, 10, {
                corpsenm: PM_COCKATRICE,
            }),
            { state },
        ),
        false,
    );
});

test('postmov object selection follows consume then pickup order', () => {
    const state = makeState();
    const mole = makeMonster(state, PM_ROCK_MOLE);
    const chain = placeObject(
        state,
        makeObject(state, IRON_CHAIN, 9, 10),
    );
    const resistedCalls = [];
    const resisted = select_postmove_object_action(mole, 9, 10, {
        random: {
            rn2(bound) {
                resistedCalls.push(bound);
                return 4; // The last value inside the 5% resistance range.
            },
        },
        state,
    });
    assert.deepEqual(resistedCalls, [100]);
    assert.equal(resisted, null);

    const calls = [];
    const metal = select_postmove_object_action(mole, 9, 10, {
        random: {
            rn2(bound) {
                calls.push(bound);
                return 5; // At the 5% boundary, ordinary metal does not resist.
            },
        },
        state,
    });
    assert.deepEqual(calls, [100]);
    assert.equal(metal.kind, 'eat metal');
    assert.equal(metal.object, chain);

    state.level.objects[9][10] = null;
    const corpse = placeObject(
        state,
        makeObject(state, CORPSE, 9, 10, {
            corpsenm: PM_HUMAN,
        }),
    );
    const ghoul = makeMonster(state, PM_GHOUL);
    const eaten = select_postmove_object_action(ghoul, 9, 10, {
        state,
    });
    assert.equal(eaten.kind, 'eat corpse');
    assert.equal(eaten.object, corpse);

    state.level.objects[9][10] = null;
    const dagger = placeObject(
        state,
        makeObject(state, DAGGER, 9, 10),
    );
    const gnome = makeMonster(state, PM_GNOME);
    const picked = select_postmove_object_action(gnome, 9, 10, {
        state,
    });
    assert.equal(picked.kind, 'pick up');
    assert.equal(picked.object, dagger);
});

test('postmov object selection reports the carryable amount, not the stack',
    () => {
        // C ref: mon.c mpickstuff():1883-1889. carryamt is can_carry()'s
        // result, and mpickstuff() calls splitobj() whenever it differs from
        // obj->quan, so reporting obj->quan instead would empty a square C
        // leaves a remainder on, print a different quantity, and drop
        // splitobj()'s rnd(2) identity draw.
        //
        // A rock mole carries M1_NOHANDS (monsters.h:924) and is neither a
        // dragon nor an engulfer, so mon.c can_carry():2013-2028 caps it at
        // one item however large the pile. M2_COLLECT (monsters.h:925) puts a
        // rock on its take list through likes_objs().
        const state = makeState();
        const mole = makeMonster(state, PM_ROCK_MOLE);
        // Three rocks: any quantity above one exercises the nohands cap.
        // ROCK weighs 10 (objects.h:1606), so the stack's owt is 30, under
        // the mole's max_mon_load() and irrelevant anyway, because can_carry()
        // returns at the cap before it reaches the weight test.
        const rocks = placeObject(
            state,
            makeObject(state, ROCK, 9, 10, { quan: 3, owt: 30 }),
        );

        const selected = select_postmove_object_action(mole, 9, 10, {
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            state,
        });

        // ROCK's material is MINERAL, outside can_carry()'s IRON..MITHRIL
        // window, so the metallivorous arm above passes the pile over and the
        // mole reaches the pickup loop.
        assert.equal(selected.kind, 'pick up');
        assert.equal(selected.object, rocks);
        assert.equal(selected.carryamt, 1);
        // The selector reads the stack and must not disturb it; mpickstuff()
        // is what splits.
        assert.equal(rocks.quan, 3);
    });

test('postmov object selection preserves inert object and shop draws', () => {
    const state = makeState();
    const rat = makeMonster(state, PM_GIANT_RAT);
    placeObject(state, makeObject(state, ROCK, 9, 10));
    assert.equal(
        select_postmove_object_action(rat, 9, 10, {
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            state,
        }),
        null,
    );

    state.level.objects[9][10] = null;
    placeObject(state, makeObject(state, DAGGER, 9, 10));
    const gnome = makeMonster(state, PM_GNOME);
    state.level.at(9, 10).roomno = ROOMOFFSET;
    state.level.rooms[0] = { rtype: SHOPBASE };
    const calls = [];
    const ignored = select_postmove_object_action(gnome, 9, 10, {
        random: {
            rn2(bound) {
                calls.push(bound);
                return 1; // Any nonzero one-in-25 shop result skips pickup.
            },
        },
        state,
    });
    assert.deepEqual(calls, [25]);
    assert.equal(ignored, null);
});

test('m_search_items ignores rocks and reports an own-square selection',
    () => {
        const state = makeState();
        const monster = placeMonster(state, makeMonster(state));
        placeObject(state, makeObject(state, ROCK, 9, 10));
        const ignored = m_search_items(
            monster,
            monster.mux,
            monster.muy,
            0,
            searchEnv(state),
        );
        assert.deepEqual(ignored, {
            approach: 0,
            complete: false,
            goalX: monster.mux,
            goalY: monster.muy,
            object: null,
        });

        const dagger = placeObject(
            state,
            makeObject(state, DAGGER, monster.mx, monster.my),
        );
        const selected = m_search_items(
            monster,
            monster.mux,
            monster.muy,
            0,
            searchEnv(state),
        );
        assert.equal(selected.complete, true);
        assert.equal(selected.object, dagger);
        assert.deepEqual(
            [selected.goalX, selected.goalY],
            [monster.mx, monster.my],
        );
    });

test('m_search_items retains the last equal-distance x-major candidate',
    () => {
        const state = makeState();
        const monster = placeMonster(state, makeMonster(state));
        const candidates = [
            makeObject(state, DAGGER, 8, 10, { o_id: 6101 }),
            makeObject(state, DAGGER, 10, 8, { o_id: 6102 }),
            makeObject(state, DAGGER, 12, 10, { o_id: 6103 }),
        ];
        for (const object of candidates) placeObject(state, object);

        const selected = m_search_items(
            monster,
            monster.mux,
            monster.muy,
            0,
            searchEnv(state),
        );

        assert.deepEqual([selected.goalX, selected.goalY], [12, 10]);
        assert.equal(selected.object, candidates[2]);
        assert.equal(selected.complete, false);
    });

test('m_search_items skips prize and charged shop merchandise', () => {
    const state = makeState();
    const monster = placeMonster(state, makeMonster(state));
    const prize = placeObject(
        state,
        makeObject(state, DAGGER, 9, 10, { o_id: 6201 }),
    );
    state.context.achieveo.mines_prize_oid = prize.o_id;
    const merchandise = placeObject(
        state,
        makeObject(state, DAGGER, 11, 10, {
            no_charge: false,
            o_id: 6202,
        }),
    );
    const ignored = m_search_items(
        monster,
        monster.mux,
        monster.muy,
        0,
        searchEnv(state, { costlySpot: () => true }),
    );
    assert.equal(ignored.object, null);

    merchandise.no_charge = true;
    const selected = m_search_items(
        monster,
        monster.mux,
        monster.muy,
        0,
        searchEnv(state, { costlySpot: () => true }),
    );
    assert.deepEqual([selected.goalX, selected.goalY], [11, 10]);
});

test('m_search_items clears a known trapped goal before line filtering',
    () => {
        const state = makeState();
        const monster = placeMonster(state, makeMonster(state, PM_ROCK_MOLE, {
            mtrapseen: 1 << (PIT - 1),
        }));
        placeObject(state, makeObject(state, DAGGER, 9, 10));
        state.level.traps.push({
            tx: 9,
            ty: 10,
            ttyp: PIT,
        });

        const result = m_search_items(
            monster,
            9,
            10,
            0,
            searchEnv(state, {
                monsterCanSee: () => assert.fail(
                    'known trap skips line check',
                ),
            }),
        );

        assert.deepEqual(
            [result.goalX, result.goalY],
            [monster.mux, monster.muy],
        );
        assert.equal(result.object, null);
    });

test('m_search_items reverses flight after its source radius reduction',
    () => {
        const state = makeState();
        const monster = placeMonster(state, makeMonster(state, PM_ROCK_MOLE, {
            // From (10,10), mux 14 is four squares away. That exceeds the
            // reduced radius of three and reverses flight; (3,3) is the
            // prior-goal sentinel that must remain selected.
            mux: 14,
            muy: 10,
        }));
        const far = m_search_items(
            monster,
            3,
            3,
            -1,
            searchEnv(state),
        );
        assert.equal(far.approach, 1);
        assert.deepEqual([far.goalX, far.goalY], [3, 3]);

        // Three squares is the source's inclusive exception, so flight and
        // the remembered hero square remain selected.
        monster.mux = 13;
        const near = m_search_items(
            monster,
            3,
            3,
            -1,
            searchEnv(state),
        );
        assert.equal(near.approach, -1);
        assert.deepEqual(
            [near.goalX, near.goalY],
            [monster.mux, monster.muy],
        );
    });

test('m_search_items spends the shop draw before the shopkeeper check',
    () => {
        const state = makeState();
        const monster = placeMonster(state, makeMonster(state, PM_ROCK_MOLE, {
            isshk: true,
        }));
        state.level.at(monster.mx, monster.my).roomno = ROOMOFFSET;
        state.level.rooms[0] = {
            rtype: SHOPBASE,
        };
        const calls = [];

        const result = m_search_items(
            monster,
            monster.mux,
            monster.muy,
            0,
            searchEnv(state, {
                random: {
                    rn2(bound) {
                        calls.push(bound);
                        return 0;
                    },
                },
            }),
        );

        assert.deepEqual(calls, [25]);
        assert.equal(result.object, null);
    });
