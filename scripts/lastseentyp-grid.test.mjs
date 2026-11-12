// C keeps svl.lastseentyp[][] as one game-wide grid, written and read by
// value with each saved level, cleared by init_mapseen(), and untouched when
// clear_level_structures() replaces the level structure (#wizloaddes). The
// port held it on each GameMap, so a level reload lost it. js/dungeon.js
// lastseentyp_grid() is now its one definition.
//
// This check fails on:
// - a read or write of `<level>.lastseentyp`, the old per-level field;
// - an assignment or read of `state.lastseentyp` outside the places that
//   own the grid's lifetime, listed with their counts.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// "<file>": number of `state.lastseentyp` references, and why.
const OWNERS = {
    'dungeon.js': [2, 'lastseentyp_grid() and init_mapseen()'],
    'restore.js': [2, 'getlev() and the hero level of dorecover()'],
    'bones.js': [1, 'getbones()\'s getlev()'],
};

export function scan(file, source) {
    const problems = [];
    let owned = 0;
    source.split('\n').forEach((line, index) => {
        const code = line.replace(/\/\/.*$/u, '');
        if (/\blevel\??\.lastseentyp\b/u.test(code))
            problems.push(`${file}:${index + 1} uses a per-level lastseentyp; `
                + 'use lastseentyp_grid(state)');
        owned += (code.match(/\bstate\.lastseentyp\b/gu) ?? []).length;
    });
    const expected = OWNERS[file]?.[0] ?? 0;
    if (owned !== expected)
        problems.push(`${file}: ${owned} state.lastseentyp references, `
            + `expected ${expected}; use lastseentyp_grid(state)`);
    return problems;
}

test('every lastseentyp use goes through lastseentyp_grid()', () => {
    const dir = new URL('../js/', import.meta.url);
    const problems = readdirSync(dir).filter((f) => f.endsWith('.js')).sort()
        .flatMap((file) => scan(file, readFileSync(new URL(file, dir), 'utf8')));
    assert.deepEqual(problems, []);
});

test('the check reports each bypass', () => {
    // The old per-level field, read or written.
    assert.equal(scan('zap.js', 'x = state.level.lastseentyp[1][2];').length, 1);
    assert.equal(scan('pager.js', 'x = state.level?.lastseentyp?.[1];').length, 1);
    // A new owner of the grid outside the list.
    assert.equal(scan('lock.js', 'state.lastseentyp = [];').length, 1);
    // A listed owner gaining a reference.
    assert.equal(scan('bones.js', 'state.lastseentyp = a; state.lastseentyp = b;').length, 1);
    // The accessor is fine.
    assert.deepEqual(scan('lock.js', 'lastseentyp_grid(state)[x][y] = 0;'), []);
});
