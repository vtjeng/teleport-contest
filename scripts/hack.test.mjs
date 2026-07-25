import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DUST,
    FLYING,
    FOUNTAIN,
    HEADSTONE,
    LEVITATION,
    MAX_TYPE,
    ROOM,
    ROT_CORPSE,
    STAIRS,
    STEALTH,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    disturb_buried_zombies,
    hero_tread_disturbs_buried_zombies,
    maybe_smudge_engr,
    switch_terrain_for_legal_move,
} from '../js/hack.js';
import { M1_FLY } from '../js/monsters.js';
import { CORPSE, DAGGER } from '../js/objects.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function buriedObject(otyp, x, y, next = null) {
    return {
        nobj: next,
        otyp,
        ox: x,
        oy: y,
        timed: 0,
    };
}

function treadState(overrides = {}) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[STEALTH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: { uprops, usteed: null },
        // WT_ELF / 2 is the inclusive source threshold for a heavy tread.
        youmonst: { data: { cwt: WT_ELF / 2 } },
        ...overrides,
    };
}

function terrainState(currentTyp, previousTyp = STAIRS) {
    const locations = new Map([
        ['4,4', { typ: previousTyp }],
        ['5,4', { typ: currentTyp }],
    ]);
    return {
        u: { ux: 5, uy: 4, ux0: 4, uy0: 4, uinwater: false },
        level: {
            at: (x, y) => locations.get(`${x},${y}`),
            flags: {},
        },
        iflags: { terrain_typ: previousTyp },
        flags: { terrainstatus: true },
        context: { run: 0 },
        disp: { botl: false },
    };
}

function smudgeState(engravings) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: {
            ux: 5,
            uy: 4,
            uprops,
            uswallow: false,
            usteed: null,
            uundetected: false,
            weapon_skills: [],
        },
        youmonst: {
            data: { mflags1: 0, msize: 2, mattk: [] },
        },
        level: {
            at: () => ({ typ: ROOM }),
            traps: [],
        },
        head_engr: engravings,
    };
}

function engraving(x, y, type, next = null) {
    return {
        engr_x: x,
        engr_y: y,
        engr_type: type,
        engr_txt: ['_', '_', '_'],
        nowipeout: false,
        nxt_engr: next,
    };
}

test('hero tread uses the source weight and grounded-property gates', () => {
    const grounded = treadState();
    assert.equal(hero_tread_disturbs_buried_zombies(grounded), true);

    // One unit below WT_ELF / 2 isolates the inclusive weight boundary.
    const light = treadState({ youmonst: { data: { cwt: WT_ELF / 2 - 1 } } });
    assert.equal(hero_tread_disturbs_buried_zombies(light), false);

    for (const property of [LEVITATION, FLYING, STEALTH]) {
        const elevated = treadState();
        elevated.u.uprops[property].extrinsic = 1;
        assert.equal(
            hero_tread_disturbs_buried_zombies(elevated),
            false,
            `active property ${property}`,
        );
    }

    const flyingSteed = treadState();
    flyingSteed.u.usteed = { data: { mflags1: M1_FLY } };
    assert.equal(hero_tread_disturbs_buried_zombies(flyingSteed), false);
    flyingSteed.u.uprops[FLYING].blocked = 1;
    assert.equal(hero_tread_disturbs_buried_zombies(flyingSteed), true);

    const blockedStealth = treadState();
    blockedStealth.u.uprops[STEALTH] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 1,
    };
    assert.equal(
        hero_tread_disturbs_buried_zombies(blockedStealth),
        true,
    );
});

test('legal-move terrain switching classifies only at the source gate', () => {
    // botl.c reserves pseudo-type 39 for ordinary floor status.
    const X_FLOOR = 39;
    const fountain = terrainState(FOUNTAIN);
    assert.equal(switch_terrain_for_legal_move(fountain), true);
    assert.equal(fountain.iflags.terrain_typ, FOUNTAIN);
    assert.equal(fountain.disp.botl, true);

    const running = terrainState(FOUNTAIN);
    running.context.run = 1;
    assert.equal(switch_terrain_for_legal_move(running), true);
    assert.equal(running.iflags.terrain_typ, FOUNTAIN);
    assert.equal(running.disp.botl, false);

    const unchanged = terrainState(ROOM, ROOM);
    unchanged.iflags.terrain_typ = STAIRS;
    assert.equal(switch_terrain_for_legal_move(unchanged), false);
    assert.equal(unchanged.iflags.terrain_typ, STAIRS);

    const forced = terrainState(ROOM, ROOM);
    forced.iflags.terrain_typ = MAX_TYPE;
    assert.equal(switch_terrain_for_legal_move(forced), true);
    assert.equal(forced.iflags.terrain_typ, X_FLOOR);
    assert.equal(forced.disp.botl, true);
});

test('movement smudges old then new engravings in source RNG order', () => {
    const destination = engraving(5, 4, DUST);
    const state = smudgeState(engraving(4, 4, DUST, destination));
    const draws = [];
    const random = {
        rnd(bound) {
            draws.push(['rnd', bound]);
            return 1;
        },
        rn2(bound) {
            draws.push(['rn2', bound]);
            // Selecting the only byte, then a nonzero rubout, erases '_'.
            return bound === 1 ? 0 : 3;
        },
    };

    assert.equal(maybe_smudge_engr(4, 4, 5, 4, state, random), true);
    assert.deepEqual(draws, [
        ['rnd', 5], ['rn2', 1], ['rn2', 4],
        ['rnd', 5], ['rn2', 1], ['rn2', 4],
    ]);
    assert.equal(state.head_engr, null);
});

test('movement smudging skips headstones, duplicate spots, and high floors',
    () => {
        const headstone = engraving(4, 4, HEADSTONE);
        const state = smudgeState(headstone);
        const noDraw = {
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        };

        assert.equal(
            maybe_smudge_engr(4, 4, 4, 4, state, noDraw),
            false,
        );
        state.u.uprops[LEVITATION].extrinsic = 1;
        headstone.engr_type = DUST;
        assert.equal(
            maybe_smudge_engr(4, 4, 5, 4, state, noDraw),
            false,
        );
        assert.equal(state.head_engr, headstone);
    });

test('disturb_buried_zombies shortens only nearby zombification timers', () => {
    const state = {
        moves: 100,
        level: { buriedobjlist: null },
    };
    timeout_globals_init(state);

    const distant = buriedObject(CORPSE, 12, 10);
    const ordinaryRot = buriedObject(CORPSE, 10, 10, distant);
    const nonCorpse = buriedObject(DAGGER, 10, 10, ordinaryRot);
    const nearby = buriedObject(CORPSE, 9, 11, nonCorpse);
    state.level.buriedobjlist = nearby;

    // Ninety remaining turns expose the exact two-thirds reduction to 60.
    start_timer(90, TIMER_OBJECT, ZOMBIFY_MON, nearby, state);
    start_timer(80, TIMER_OBJECT, ZOMBIFY_MON, distant, state);
    start_timer(70, TIMER_OBJECT, ROT_CORPSE, ordinaryRot, state);
    start_timer(50, TIMER_OBJECT, ZOMBIFY_MON, nonCorpse, state);

    disturb_buried_zombies(10, 10, state);

    assert.equal(peek_timer(ZOMBIFY_MON, nearby, state), 160);
    assert.equal(peek_timer(ZOMBIFY_MON, distant, state), 180);
    assert.equal(peek_timer(ROT_CORPSE, ordinaryRot, state), 170);
    assert.equal(peek_timer(ZOMBIFY_MON, nonCorpse, state), 150);
    assert.deepEqual(
        [nearby.timed, distant.timed, ordinaryRot.timed, nonCorpse.timed],
        [1, 1, 1, 1],
    );
});

test('disturb_buried_zombies keeps a one-turn timer at one', () => {
    const state = {
        moves: 7,
        level: { buriedobjlist: null },
    };
    timeout_globals_init(state);
    const corpse = buriedObject(CORPSE, 4, 4);
    state.level.buriedobjlist = corpse;
    // One remaining turn exercises max(1, t * 2 / 3).
    start_timer(1, TIMER_OBJECT, ZOMBIFY_MON, corpse, state);

    disturb_buried_zombies(4, 4, state);

    assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 8);
    assert.equal(corpse.timed, 1);
});
