import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, MAX_NUM_WORMS, ROWNO } from '../js/const.js';
import {
    count_wsegs,
    create_worm_tail,
    cutworm,
    get_wormno,
    initworm,
    remove_worm,
    wseg_at,
    wormhitu,
} from '../js/worm.js';
import { game } from '../js/gstate.js';

function wormState() {
    return {
        level: {
            worms: Array(MAX_NUM_WORMS).fill(null),
            monsters: Array.from(
                { length: COLNO },
                () => Array(ROWNO).fill(null),
            ),
        },
    };
}

test('get_wormno skips slot zero and returns the first free tail slot', () => {
    const state = wormState();
    state.level.worms[0] = { unused: true };
    state.level.worms[1] = { segments: [] };

    // C starts at slot 1, so an occupied reserved slot zero cannot shift the
    // first free result; slot 2 is the first available C array index.
    assert.equal(get_wormno(state), 2);

    for (let slot = 1; slot < MAX_NUM_WORMS; ++slot)
        state.level.worms[slot] = { segments: [] };
    // C returns zero when every usable index below MAX_NUM_WORMS is occupied.
    assert.equal(get_wormno(state), 0);

    const freshState = { level: {} };
    // The C arrays exist before any tail is allocated; a missing JS slot
    // table therefore means slot 1 is free and the read must not initialize it.
    assert.equal(get_wormno(freshState), 1);
    assert.equal(Object.hasOwn(freshState.level, 'worms'), false);
});

test('count_wsegs excludes the hidden head node stored at the list end', () => {
    const state = wormState();
    const monster = { wormno: 1 };
    state.level.worms[1] = {
        // Three displayed tail nodes plus the hidden node co-located with the
        // head reproduce C's linked list for a three-segment visible worm.
        segments: [{ x: 9, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }],
    };

    assert.equal(count_wsegs(monster, state), 3);
    // C returns zero before consulting the worm list when wormno is zero.
    assert.equal(count_wsegs({ wormno: 0 }, state), 0);
});

test('create_worm_tail makes num_segs plus one zeroed linked-list nodes', () => {
    // C returns NULL for zero; initworm supplies the single hidden node itself.
    assert.equal(create_worm_tail(0), null);

    // Three requested tail segments require four nodes including the head node.
    const segments = create_worm_tail(3);
    assert.equal(segments.length, 4);
    assert.deepEqual(segments, Array.from(
        { length: 4 },
        () => ({ x: 0, y: 0 }),
    ));
    assert.notEqual(segments[0], segments[1]);
});

test('initworm owns its default and injected level state and resets its clock',
    () => {
    const originalLevel = game.level;
    const defaultLevel = wormState().level;
    game.level = defaultLevel;
    try {
        const liveWorm = { wormno: 1, mx: 8, my: 9 };
        initworm(liveWorm, 2);
        assert.deepEqual(game.level.worms[1], {
            segments: [
                { x: 0, y: 0 },
                { x: 0, y: 0 },
                { x: 8, y: 9 },
            ],
            growtime: 0,
        });
    } finally {
        if (originalLevel === undefined) delete game.level;
        else game.level = originalLevel;
    }

    const planning = wormState();
    const cloneWorm = { wormno: 1, mx: 8, my: 9 };
    initworm(cloneWorm, 1, { state: planning, planning: true });
    const segments = planning.level.worms[1].segments;
    segments[0] = { x: 7, y: 9 };
    segments[1] = { x: 8, y: 9 };
    planning.level.monsters[7][9] = cloneWorm;
    const redraws = [];

    remove_worm(cloneWorm, {
        state: planning,
        planning: true,
        newsym: (x, y) => redraws.push([x, y]),
    });

    assert.deepEqual(segments.map(({ x }) => x), [0, 0]);
    assert.equal(planning.level.monsters[7][9], null);
    assert.deepEqual(redraws, []);
    assert.equal(game.level, originalLevel,
        'planning cleanup does not take ownership of the live level');
});

test('wseg_at counts from the hidden head toward the tail only on worm occupancy', () => {
    const state = wormState();
    const worm = { wormno: 1 };
    // C links tail to head; the final node shares the monster's head square.
    const segments = [
        { x: 9, y: 8 },
        { x: 8, y: 8 },
        { x: 7, y: 8 },
        { x: 6, y: 8 },
    ];
    state.level.worms[1] = { segments };
    for (const { x, y } of segments)
        state.level.monsters[x][y] = worm;

    // C's n - i result labels the tail as segment 4 and the head as segment 1.
    assert.equal(wseg_at(worm, 9, 8, state), 4);
    assert.equal(wseg_at(worm, 8, 8, state), 3);
    assert.equal(wseg_at(worm, 7, 8, state), 2);
    assert.equal(wseg_at(worm, 6, 8, state), 1);
    assert.equal(wseg_at(worm, 5, 8, state), 0);
    // C first checks wormno; a normal long-worm head with no tail returns zero.
    assert.equal(wseg_at({ wormno: 0 }, 6, 8, state), 0);

    const otherMonster = { wormno: 0 };
    state.level.monsters[9][8] = otherMonster;
    // C rejects coordinates whose m_at() occupant is not the queried worm.
    assert.equal(wseg_at(worm, 9, 8, state), 0);
});

test('cutworm shrinks the first segment after the source cut chance passes', async () => {
    const state = wormState();
    // Level 2 avoids the clone attempt; 12 HP and a head at (6, 8) leave the
    // C tail node at (5, 8) as the first linked-list segment.
    const worm = { wormno: 1, mx: 6, my: 8, m_lev: 2, mhp: 12 };
    const segments = [{ x: 5, y: 8 }, { x: 6, y: 8 }];
    state.level.worms[1] = { segments, growtime: 29 };
    state.level.monsters[5][8] = worm;
    state.level.monsters[6][8] = worm;
    const randomCalls = [];
    const redraws = [];

    await cutworm(worm, 5, 8, true, {
        state,
        random: {
            // C's rnd(20)=7 plus cuttier's 10 reaches the 17-point cut bound.
            rnd(bound) { randomCalls.push(`rnd(${bound})`); return 7; },
        },
        hooks: { newsym(x, y) { redraws.push([x, y]); } },
    });

    assert.deepEqual(randomCalls, ['rnd(20)']);
    assert.deepEqual(state.level.worms[1].segments, [{ x: 6, y: 8 }]);
    assert.equal(state.level.worms[1].growtime, 29,
        'worm.c:shrink_worm changes the tail but leaves wgrowtime intact');
    assert.equal(state.level.monsters[5][8], null);
    assert.equal(state.level.monsters[6][8], worm);
    assert.deepEqual(redraws, [[5, 8]],
        'worm.c:toss_wsegs redraws the removed tail when display_update is true');
});

test('cutworm discards a split tail when no worm slot remains', async () => {
    const state = wormState();
    // Level 3 enables the clone-slot branch; 18 HP exercises its source
    // half-HP loss, and a valid species lets C's discarded-split message name it.
    const worm = {
        wormno: 1, mx: 7, my: 8, m_lev: 3, mhp: 18, mhpmax: 18,
        data: {},
    };
    // These increasing x coordinates model worm.c's tail-to-head list; (6, 8)
    // is the middle node whose successful cut asks get_wormno for a new slot.
    const segments = [
        { x: 5, y: 8 },
        { x: 6, y: 8 },
        { x: 7, y: 8 },
    ];
    state.mons = game.mons;
    state.level.worms[1] = { segments, growtime: 31 };
    state.level.monsters[5][8] = worm;
    state.level.monsters[6][8] = worm;
    state.level.monsters[7][8] = worm;
    // The C monster-moving branch suppresses its cut message when the hero
    // cannot spot the worm; an uninitialized visibility buffer models that.
    state.context = { mon_moving: true };
    state.u = {
        ux: 8, uy: 8, up: {}, uprops: {},
        uswallow: false, uinwater: false,
    };
    // Occupying every later slot makes get_wormno() return C's zero sentinel.
    for (let slot = 2; slot < MAX_NUM_WORMS; ++slot)
        state.level.worms[slot] = { segments: [], growtime: 0 };
    const randomCalls = [];
    const redraws = [];
    const messages = [];

    await cutworm(worm, 6, 8, false, {
        state,
        random: {
            // C first clears the cut threshold, then rn2(3)=0 asks for a slot.
            rnd(bound) { randomCalls.push(`rnd(${bound})`); return 18; },
            rn2(bound) { randomCalls.push(`rn2(${bound})`); return 0; },
        },
        hooks: { newsym(x, y) { redraws.push([x, y]); } },
        message(line) { messages.push(line); },
    });

    assert.deepEqual(randomCalls, ['rnd(20)', 'rn2(3)']);
    assert.deepEqual(state.level.worms[1].segments, [{ x: 7, y: 8 }]);
    assert.equal(state.level.worms[1].growtime, 31,
        'the old worm keeps its source wgrowtime when the detached half dies');
    assert.equal(worm.mhp, 9,
        'worm.c:cutworm halves surviving HP after tossing the un-cloned half');
    assert.equal(state.level.monsters[5][8], null);
    assert.equal(state.level.monsters[6][8], null);
    assert.equal(state.level.monsters[7][8], worm);
    assert.deepEqual(redraws, [[5, 8], [6, 8]]);
    assert.deepEqual(messages, [],
        'worm.c:cutworm suppresses the moving-monster message out of sight');
});


test('wormhitu attacks every nearby visible tail and excludes distant tail and head', async () => {
    // worm.c:359 uses squared distance < 3 and skips the dummy head node.
    // A cardinal and diagonal tail qualify; distance two cardinal does not.
    const state = wormState();
    state.u = { ux: 10, uy: 8 };
    const worm = { wormno: 1, mx: 11, my: 8 };
    state.level.worms[1] = { segments: [
        { x: 12, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 7 },
        { x: 11, y: 8 }, // Dummy head is excluded even when adjacent.
    ] };
    const calls = [];
    const result = await wormhitu(worm, { state,
        attackHero: async (subject) => {
            calls.push([subject.mx, subject.my]);
            return 0; // Every qualifying tail must be visited without a death.
        },
    });
    assert.equal(result, 0);
    assert.equal(calls.length, 2, 'only cardinal and diagonal visible tails qualify');
    assert.deepEqual(calls, [[11, 8], [11, 8]], 'C leaves the real head unchanged');
});

test('wormhitu propagates attacker death and stops before another nearby tail', async () => {
    const state = wormState();
    state.u = { ux: 10, uy: 8 };
    const worm = { wormno: 1, mx: 12, my: 9 };
    state.level.worms[1] = { segments: [
        // Three visible tails qualify; the second attack kills the worm.
        { x: 9, y: 8 }, { x: 9, y: 7 }, { x: 10, y: 7 },
        { x: 12, y: 9 }, // Dummy node shares the real head's position.
    ] };
    let calls = 0;
    const result = await wormhitu(worm, { state,
        attackHero: async () => ++calls === 2,
    });
    assert.equal(result, 1, 'C propagates the first true mattacku result');
    assert.equal(calls, 2, 'the third qualifying tail is not attacked after death');
});
