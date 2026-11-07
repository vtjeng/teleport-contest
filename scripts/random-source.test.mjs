// Enforces js/rng.js's single random source: C's rnd.c functions all draw
// from one generator, so game code passes the complete set it received, or
// rng.js's `coreRandom`, and never builds a partial one. The first tests pin
// what scripts/random-source.mjs finds; the last ones check that the sets
// rng.js defines are complete.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import * as rng from '../js/rng.js';
import {
    CORE_NAMES,
    DISPLAY_NAMES,
    randomSourceFindings,
    scanRepository,
} from './random-source.mjs';

const lines = (source) => randomSourceFindings(source).map(({ line }) => line);

test('no game code builds its own random set', () => {
    assert.deepEqual(scanRepository(), []);
});

test('the scan finds shorthand, picked, merged and patched random sets', () => {
    // Each numbered line holds one hand-built set; line 1 is the first line.
    assert.deepEqual(lines([
        'const a = env.random ?? { rn2 };', // 1: shorthand default
        'f(x, { state, random: { d, rn2, rnd } });', // 2: passed as a field
        'g({ rn2: random.rn2 });', // 3: one function picked from a set
        'const b = { d, rn1, rn2, rnd, rne, ...(env.random ?? {}) };', // 4: merge
        'const c = { ...random, rn1: random.rn1 ?? rn1 };', // 5: patched spread
        'const e = Object.freeze({ d, rn1, rn2, rnd, rne, rnl, rnz });', // 6: full copy
        'const h = { rn2_on_display_rng, rnd };', // 7: display and core mixed
        "const k = { 'rn2': roll };", // 8: string key
        'const m = { ...coreRandom, ...raw };', // 9: spread-only merge
        // Lines 4 and 10 also hold the empty fallback `env.random ?? {}`.
        'const n = { ...(env.random ?? {}) };', // 10: spread copy of a field
        'function f(x, random = {}) { return x; }', // 11: empty default
        'const p = rawEnv.random ?? {};', // 12: empty fallback
    ].join('\n')), [1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12]);
});

test('the scan accepts passing a set, a single function, or other objects', () => {
    assert.deepEqual(lines([
        'const a = env.random ?? coreRandom;',
        'f(x, { state, random });',
        'g({ ...env, state, random: env.random ?? coreRandom });',
        'h({ displayRandom: rn2_on_display_rng });',
        'k({ rn2_on_display_rng });', // display only: not a core set
        'm({ d: 3, x: 1 });', // mixed with other keys
        'p({ ...env, state, random });', // an env carrying the set
        'q({ ...(env.random ? { random: env.random } : {}) });', // conditional field
        'const { rn2, rnd } = random;', // destructuring pattern, not a literal
        'n({});',
    ].join('\n')), []);
});

test('coreRandom holds every core rnd.c function and no display one', () => {
    assert.deepEqual(Object.keys(rng.coreRandom).sort(), [...CORE_NAMES].sort());
    for (const name of CORE_NAMES)
        assert.equal(rng.coreRandom[name], rng[name], name);
    for (const name of DISPLAY_NAMES)
        assert.equal(rng.coreRandom[name], undefined, name);
    assert.ok(Object.isFrozen(rng.coreRandom));
});

test('createCoreRandom() returns the same complete set over a cloned stream', () => {
    rng.initRng(42); // any seed: the test compares two draws from one state
    const clone = rng.cloneIsaacContext(game.coreCtx);
    const planned = rng.createCoreRandom(clone, game);
    assert.deepEqual(Object.keys(planned).sort(), [...CORE_NAMES].sort());
    // The clone starts where the live stream is, so its first rn2(1000)
    // equals the live one; 1000 makes an accidental match unlikely.
    assert.equal(planned.rn2(1000), rng.rn2(1000));
});
