import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HALLUC, HALLUC_RES } from '../js/const.js';
import { is_izchak } from '../js/shknam.js';

const C_SHKNAM = readFileSync('nethack-c/upstream/src/shknam.c', 'utf8');
const JS_SHKNAM = readFileSync('js/shknam.js', 'utf8');

test('is_izchak follows the source town, hallucination, and name checks', () => {
    // C ref: shknam.c is_izchak() (908-924). The town flag and empty room list
    // exercise in_town()'s whole-level town case; the + prefix is the exact
    // marker the C helper skips before comparing the keeper's name.
    const state = {
        level: { flags: { has_town: true }, rooms: [] },
        u: { uprops: {} },
    };
    const shopkeeper = {
        isshk: true,
        mx: 10,
        my: 10,
        mextra: { eshk: { shknam: '+Izchak' } },
    };
    const before = structuredClone({ state, shopkeeper });

    assert.equal(is_izchak(shopkeeper, false, state), true);
    shopkeeper.isshk = false;
    assert.equal(is_izchak(shopkeeper, false, state), false);
    shopkeeper.isshk = true;
    state.level.flags.has_town = false;
    assert.equal(is_izchak(shopkeeper, false, state), false);
    state.level.flags.has_town = true;
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    assert.equal(is_izchak(shopkeeper, false, state), false);
    assert.equal(is_izchak(shopkeeper, true, state), true);
    state.u.uprops[HALLUC_RES] = { extrinsic: 1 };
    assert.equal(is_izchak(shopkeeper, false, state), true);

    // The pure C helper reads these fields and returns a boolean; its port
    // must not consume randomness or alter either input object.
    state.u.uprops = {};
    assert.deepEqual({ state, shopkeeper }, before);
});

test('is_izchak retains its whole C function and production name rule', () => {
    // Pin the source's prefix skip and bytewise name comparison so a similar
    // looking JavaScript predicate cannot silently replace the C behavior.
    const source = C_SHKNAM.slice(C_SHKNAM.indexOf('is_izchak('));
    assert.match(source, /if \(!letter\(\*shknm\)\)\s*\+\+shknm;/u);
    assert.match(source, /!strcmp\(shknm, "Izchak"\)/u);
    assert.match(JS_SHKNAM, /export function is_izchak\(/u);
});
