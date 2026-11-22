// C's program_state (struct sinfo, hack.h) starts at zero in every process:
// decl.c:1001 init_program_state is `{ 0 }`, and allmain.c early_init()
// copies it in before anything else runs. It is never saved, so a restored
// game starts from zero too. The port once created state.program_state as
// `{}` after the configuration file was read, so a member read before it was
// first written was `undefined`: not `=== 0`, NaN after `++`, and a
// different value from C's otherInp under readchar()'s altmeta test, which
// compared it with a string.
//
// js/gstate.js now creates the object at process start from js/program_state.js
// zero_sinfo(), generated from hack.h. These tests keep it that way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { game, resetGame } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { SINFO_STRUCTS, zero_sinfo } from '../js/program_state.js';
import { jsFiles, resolvePath, scanFiles } from './state-field-uses.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

function programStateUses() {
    return scanFiles(jsFiles(JS_DIR), 'program_state').map((use) => ({
        ...use, ...resolvePath(use.path, SINFO_STRUCTS, 'sinfo'),
    }));
}

test('the process starts with every sinfo member at zero', () => {
    const state = resetGame();
    assert.deepEqual(state.program_state, zero_sinfo());
    assert.equal(Object.keys(state.program_state).length,
        SINFO_STRUCTS.sinfo.length);
    // Each call builds a new object, so two processes never share one.
    assert.notEqual(resetGame().program_state, state.program_state);
});

test('only js/gstate.js creates state.program_state', () => {
    const uses = programStateUses();
    // cmd.c readchar()'s altmeta test is a read that once differed; a scan
    // that stopped finding it would pass while checking nothing.
    assert.ok(uses.some(({ site, path }) => site.startsWith('cmd.js:')
        && path === 'input_state'));
    const replacements = uses.filter(({ cls, detail }) => cls === 'write-holder'
        && detail.startsWith('= '));
    assert.deepEqual(replacements.map(({ site, detail }) => `${site} ${detail}`), []);
});

test('every program_state member js/ names is declared in hack.h', () => {
    const undeclared = programStateUses().filter(({ ctype }) => ctype === null)
        .map(({ site, path }) => `${site} ${path}`);
    assert.deepEqual(undeclared, []);
});

test('no code tests whether a program_state member exists', () => {
    // delete, typeof, `in`, Object.hasOwn() and a comparison with undefined
    // tell an absent member from a zero one, which C cannot do.
    const sites = programStateUses()
        .filter(({ cls }) => cls === 'different-presence'
            || cls === 'different-null-compare')
        .map(({ site, path, detail }) => `${site} ${path} ${detail}`);
    assert.deepEqual(sites, []);
});

test('no program_state member has a non-zero default or a string value', () => {
    // Every sinfo member is an int. A default other than 0 only runs for a
    // member that is absent, and a string stands for one of C's enum values
    // (hack.h enum InputState for input_state).
    const sites = programStateUses()
        .filter(({ cls, detail }) => cls === 'different-default'
            || cls === 'assign-default'
            || (cls === 'write' && /^['"`]/u.test(detail))
            || (cls === 'safe-compare-literal' && /['"`]/u.test(detail)))
        .map(({ site, path, cls, detail }) => `${site} ${path} ${cls} ${detail}`);
    assert.deepEqual(sites, []);
});

test('a game restored in a later segment keeps every program_state member', async () => {
    // This recipe saves in its first segment and restores in its second.
    // program_state is not saved, so the second segment starts from zero and
    // restore.c dorecover() and moveloop() write their members; none may be
    // missing, undefined or NaN afterwards.
    const recipe = JSON.parse(readFileSync(join(ROOT, 'recipes', 'restore.c',
        'monster-carried-item-drop-after-restore.session.json'), 'utf8'));
    const store = new Map();
    const storage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        get length() { return store.size; },
        key: (index) => [...store.keys()][index] ?? null,
        clear: () => store.clear(),
    };
    assert.equal(recipe.segments.length, 2);
    for (const segment of recipe.segments)
        await runSegmentStrict({ ...segment, storage });
    const members = Object.entries(game.program_state);
    assert.deepEqual(members.map(([name]) => name).sort(),
        Object.keys(zero_sinfo()).sort());
    assert.deepEqual(members.filter(([, value]) => value === undefined
        || Number.isNaN(value)), []);
    // dorecover() sets something_worth_saving (restore.c:901) and
    // beyond_savefile_load (restore.c:942); moveloop() sets in_moveloop.
    assert.equal(game.program_state.something_worth_saving, 1);
    assert.equal(game.program_state.beyond_savefile_load, 1);
    assert.equal(game.program_state.in_moveloop, 1);
});
