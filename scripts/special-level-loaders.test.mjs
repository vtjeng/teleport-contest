// mkmaze.c makemaz() loads the level program that dungeon.lua names for a
// special level, a branch's fill level or a quest filler, and C's install
// ships every one of them in dat/. js/mklev.js makemaz() calls load_special()
// without checking first, as C does, and falls back to C's impossible() and a
// plain maze only when a program is missing. This check keeps that fallback
// unreachable: every level program in dat/ must have a loader.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DAT_LUA_FILES } from '../js/dat_files.js';
import { specialLevelLoaderNames } from '../js/mklev.js';
import { LUA_LIBRARY_FILES } from '../js/nhlua.js';

// The dat/ programs that are not levels. Each is run by its own C caller,
// never by makemaz(); nhl_loadlua() runs only their top level.
const NOT_LEVELS = [...LUA_LIBRARY_FILES].map((file) => file.replace(/\.lua$/u, ''));

function datPrograms() {
    return [...DAT_LUA_FILES].map((file) => file.replace(/\.lua$/u, '')).sort();
}

test('every level program in dat/ has a loader', async () => {
    const loaders = new Set(await specialLevelLoaderNames());
    const missing = datPrograms()
        .filter((name) => !NOT_LEVELS.includes(name) && !loaders.has(name));
    assert.deepEqual(missing, []);
});

test('every loader is a level program in dat/', async () => {
    const programs = new Set(datPrograms());
    const stray = (await specialLevelLoaderNames())
        .filter((name) => !programs.has(name) || NOT_LEVELS.includes(name));
    assert.deepEqual(stray, []);
});

test('the non-level programs are all in dat/', () => {
    const programs = new Set(datPrograms());
    assert.deepEqual(NOT_LEVELS.filter((name) => !programs.has(name)), []);
});
