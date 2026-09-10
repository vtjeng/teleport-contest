import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { listLuaFiles, luaFilePath, luaProgram } from './lua-sources.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'lua-sources-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'dat'));
    return root;
}

test('inventory includes library and quest programs as well as level scripts', (t) => {
    const root = fixture(t);
    // These upstream basenames cover a level, shared Lua functions, and quest
    // dialogue data. None needs a registered JavaScript level loader to appear.
    const names = ['Arc-loca.lua', 'nhlib.lua', 'quest.lua'];
    for (const name of names) writeFileSync(join(root, 'dat', name), '-- source\n');
    // dat contains other inputs, and only top-level regular Lua files belong
    // to this inventory. A directory or a symlink is not a source program.
    writeFileSync(join(root, 'dat', 'README'), 'not Lua\n');
    mkdirSync(join(root, 'dat', 'nested.lua'));
    writeFileSync(join(root, 'dat', 'nested.lua', 'hidden.lua'), '-- nested\n');
    symlinkSync(join(root, 'dat', 'quest.lua'), join(root, 'dat', 'linked.lua'));

    assert.deepEqual(listLuaFiles(root), names.map((name) => ({
        name, path: join(root, 'dat', name),
    })));
    assert.equal(luaFilePath('quest.lua', root), join(root, 'dat', 'quest.lua'));
});

test('a Lua program is one whole source unit, including top-level statements', (t) => {
    const root = fixture(t);
    // Three physical source lines include both a helper definition and a
    // top-level call. The final newline does not add an empty fourth line.
    const source = 'local function helper()\nend\nhelper()\n';
    writeFileSync(join(root, 'dat', 'nhlib.lua'), source);
    assert.deepEqual(luaProgram('nhlib.lua', root), {
        name: 'nhlib.lua', line: 1, endLine: 3,
    });
    // Removing the trailing newline leaves the same three physical lines.
    writeFileSync(join(root, 'dat', 'nhlib.lua'), source.trimEnd());
    assert.equal(luaProgram('nhlib.lua', root).endLine, 3);
    // An empty file still has one planning unit, so it cannot disappear from
    // the roadmap merely because it contains no function definitions.
    writeFileSync(join(root, 'dat', 'quest.lua'), '');
    assert.deepEqual(luaProgram('quest.lua', root), {
        name: 'quest.lua', line: 1, endLine: 1,
    });
});

test('source lookup rejects traversal, missing files, directories, and symlinks', (t) => {
    const root = fixture(t);
    writeFileSync(join(root, 'outside.lua'), '-- outside dat\n');
    mkdirSync(join(root, 'dat', 'directory.lua'));
    symlinkSync(join(root, 'outside.lua'), join(root, 'dat', 'linked.lua'));
    // Each name exercises a distinct invalid source identifier: parent and
    // absolute paths, Windows separators, no basename, wrong suffix or type.
    const invalid = ['../outside.lua', join(root, 'outside.lua'),
        '..\\outside.lua', '.lua', 'quest.txt', '', null];
    for (const name of invalid) {
        assert.throws(() => luaFilePath(name, root), /Lua source basename/u);
    }
    for (const name of ['missing.lua', 'directory.lua', 'linked.lua']) {
        assert.throws(() => luaFilePath(name, root), /no Lua source file/u);
    }
});

test('inventory explains how to initialize an absent or empty source checkout', (t) => {
    const root = fixture(t);
    // The fixture starts with an empty dat directory, then removes it to
    // cover both ways an uninitialized worktree can present itself.
    assert.throws(() => listLuaFiles(root), /git submodule update/u);
    rmSync(join(root, 'dat'), { recursive: true });
    assert.throws(() => listLuaFiles(root), /git submodule update/u);
});
