// Source-pinned tests for files.js resolvePlaygroundPath(), the playground
// model behind nhlua.c nhl_loadlua()'s dlb_fopen() -> fopen_datafile() ->
// fopen(name, "r") with C's working directory in the playground.
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePlaygroundPath } from '../js/files.js';

test('names inside the playground resolve as POSIX open() resolves them', () => {
    // A bare dat/ Lua file name: the case wiz_load_lua() makes from "oracle".
    assert.deepEqual(resolvePlaygroundPath('oracle.lua'), { kind: 'lua', file: 'oracle.lua' });
    // "." components and repeated slashes stay in the playground directory.
    assert.deepEqual(resolvePlaygroundPath('./nhlib.lua'), { kind: 'lua', file: 'nhlib.lua' });
    assert.deepEqual(resolvePlaygroundPath('.//quest.lua'), { kind: 'lua', file: 'quest.lua' });
    // ".." from save/ returns to the playground (save/ exists in every install).
    assert.deepEqual(resolvePlaygroundPath('save/../dungeon.lua'), { kind: 'lua', file: 'dungeon.lua' });
    // A non-Lua data file the install copies (sys/unix/Makefile.top DAT).
    assert.deepEqual(resolvePlaygroundPath('./rumors'), { kind: 'file', file: 'rumors' });
    // The playground itself and its save directory.
    assert.deepEqual(resolvePlaygroundPath('.'), { kind: 'directory' });
    assert.deepEqual(resolvePlaygroundPath('save/'), { kind: 'directory' });
});

test('failed resolution inside the playground is absent', () => {
    // ENOENT (2): no "nodir" directory in the playground.
    assert.deepEqual(resolvePlaygroundPath('nodir/dungeon.lua'), { kind: 'absent', errno: 2 });
    // ENOTDIR (20): a file used as a directory, including a trailing slash or ".".
    assert.deepEqual(resolvePlaygroundPath('oracles/x.lua'), { kind: 'absent', errno: 20 });
    assert.deepEqual(resolvePlaygroundPath('oracle.lua/'), { kind: 'absent', errno: 20 });
    assert.deepEqual(resolvePlaygroundPath('oracle.lua/.'), { kind: 'absent', errno: 20 });
    // ENOENT (2) for a plain name the install does not ship.
    assert.deepEqual(resolvePlaygroundPath('nosuch.lua'), { kind: 'absent', errno: 2 });
});

test('names the game may have written, or outside the playground, are not resolved', () => {
    // Level and bones files "<lock>.<n>" and "bonD0.<n>" are written in play.
    assert.deepEqual(resolvePlaygroundPath('1000wizard.3'), { kind: 'unknown' });
    // save/ holds whatever save files the game wrote.
    assert.deepEqual(resolvePlaygroundPath('save/1000wizard.lua'), { kind: 'unknown' });
    // Absolute names and names that climb above the playground.
    assert.deepEqual(resolvePlaygroundPath('/etc/passwd'), { kind: 'outside' });
    assert.deepEqual(resolvePlaygroundPath('../etc/passwd'), { kind: 'outside' });
    assert.deepEqual(resolvePlaygroundPath('save/../../x.lua'), { kind: 'outside' });
});
