import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    W_ARMC,
    W_ARMG,
    W_ARMH,
} from '../js/const.js';
import { some_armor } from '../js/do_wear.js';

const DO_WEAR_C = readFileSync(
    new URL('../nethack-c/upstream/src/do_wear.c', import.meta.url), 'utf8',
);

function scriptedRandom(values) {
    const bounds = [];
    const queue = [...values];
    return {
        bounds,
        rn2(bound) {
            bounds.push(bound);
            assert.ok(queue.length, 'C-selected armor draw has a scripted result');
            return queue.shift();
        },
        remaining: () => queue.length,
    };
}

test('some_armor follows C slot order and draws only after a selection', () => {
    // C do_wear.c:2630-2652 selects outer armor first, then tries four slots
    // with rn2(4); these distinct objects make the chosen slot observable.
    const cloak = { slot: 'cloak' };
    const suit = { slot: 'suit' };
    const shirt = { slot: 'shirt' };
    const helmet = { slot: 'helmet' };
    const gloves = { slot: 'gloves' };
    const boots = { slot: 'boots' };
    const shield = { slot: 'shield' };
    const state = {
        youmonst: {},
        uarmc: cloak,
        uarm: suit,
        uarmu: shirt,
        uarmh: helmet,
        uarmg: gloves,
        uarmf: boots,
        uarms: shield,
    };
    // Rolls 1, 0, 3, 2 keep cloak, replace it with gloves, then retain gloves.
    const random = scriptedRandom([1, 0, 3, 2]);

    assert.equal(some_armor(state.youmonst, state, random), gloves);
    assert.deepEqual(random.bounds, [4, 4, 4, 4]);
    assert.equal(random.remaining(), 0);
});

test('some_armor skips draws until an earlier armor slot is selected', () => {
    // The helmet is the first occupied source slot, so only boots and shield
    // perform the source's conditional rn2(4) selection.
    const helmet = { slot: 'helmet' };
    const boots = { slot: 'boots' };
    const shield = { slot: 'shield' };
    const state = {
        youmonst: {},
        uarmh: helmet,
        uarmf: boots,
        uarms: shield,
    };
    // 2 retains the helmet, then 0 replaces it with the shield.
    const random = scriptedRandom([2, 0]);

    assert.equal(some_armor(state.youmonst, state, random), shield);
    assert.deepEqual(random.bounds, [4, 4]);
    assert.equal(random.remaining(), 0);
});

test('some_armor reads each nonhero slot from minvent in C order', () => {
    // C calls which_armor(victim, mask) for monsters; this inventory chain
    // gives a cloak, helmet and gloves with the exact C worn masks.
    const gloves = { owornmask: W_ARMG, slot: 'gloves', nobj: null };
    const helmet = { owornmask: W_ARMH, slot: 'helmet', nobj: gloves };
    const cloak = { owornmask: W_ARMC, slot: 'cloak', nobj: helmet };
    const victim = { minvent: cloak };
    const state = { youmonst: {} };
    // Helmet's 0 replaces the cloak; gloves' 1 preserves the helmet.
    const random = scriptedRandom([0, 1]);

    assert.equal(some_armor(victim, state, random), helmet);
    assert.deepEqual(random.bounds, [4, 4]);
    assert.equal(random.remaining(), 0);
});

test('some_armor source keeps hero and monster slot reads paired', () => {
    // Pin both source expressions so a future implementation cannot silently
    // route monster equipment through hero globals or reorder the masks.
    const start = DO_WEAR_C.indexOf('some_armor(struct monst *victim)');
    const end = DO_WEAR_C.indexOf('\n}\n', start);
    const source = DO_WEAR_C.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(source, /victim == &gy\.youmonst\) \? uarmc : which_armor\(victim, W_ARMC\)/u);
    assert.match(source, /victim == &gy\.youmonst\) \? uarms : which_armor\(victim, W_ARMS\)/u);
    assert.match(source, /otmp && \(!otmph \|\| !rn2\(4\)\)/u);
});
