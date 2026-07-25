import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FLYING,
    LEVITATION,
    ROT_CORPSE,
    STEALTH,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    disturb_buried_zombies,
    hero_tread_disturbs_buried_zombies,
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
