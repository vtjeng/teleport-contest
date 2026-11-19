// A level file in C, a saved level or a bones file, stores the level's turn
// stamps relative to the turn of the write, and the game that reads it adds
// its own turn back: the level flags' stasis_until (save.c
// save_adjust_levelflags(), restore.c rest_adjust_levelflags()) and each
// pet's edog droptime and hungrytime (save.c savemon() 861-870, restore.c
// restmon() 350-356). The port converts both kinds of stamp through one
// pair, js/save.js save_level_relative_times() and js/restore.js
// rest_level_relative_times(). A level write that converted only the flags
// kept a former pet's hunger clock from the dead hero's game in a bones
// file. This test fails when other code calls one of the conversions the
// pair combines.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';
import { rest_level_relative_times } from '../js/restore.js';
import { save_level_relative_times } from '../js/save.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Each guarded conversion and the one function allowed to call it.
const OWNERS = Object.freeze({
    save_adjust_levelflags: 'save_level_relative_times',
    rest_adjust_levelflags: 'rest_level_relative_times',
    shift_level_edog_times: ['save_level_relative_times', 'rest_level_relative_times'],
});

// Calls that bypass the pair, as `file:line name`, each with the reason it
// is tolerated.
const ALLOWED = [
    // bones.js converts only the level flags of a bones file; routing it
    // through the pair changes the former pets' clocks and is its own change.
    'bones.js:800 save_adjust_levelflags',
    'bones.js:811 rest_adjust_levelflags',
    'bones.js:1376 rest_adjust_levelflags',
];

// The name of the function whose body contains `index`: the nearest
// preceding `function name(` line at column 0, which is how js/ declares
// top-level functions.
function enclosingFunction(source, index) {
    const before = source.slice(0, index);
    const matches = [...before.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gmu)];
    return matches.at(-1)?.[1] ?? null;
}

// Calls of a guarded conversion outside its owner, as { line, name }.
// Comment lines are skipped, since comments name the C functions.
export function strayCalls(source) {
    const findings = [];
    for (const [name, owner] of Object.entries(OWNERS)) {
        const owners = [owner].flat();
        for (const match of source.matchAll(new RegExp(`(?<![\\w.$])${name}\\(`, 'gu'))) {
            const lineStart = source.lastIndexOf('\n', match.index) + 1;
            const lineText = source.slice(lineStart, source.indexOf('\n', match.index));
            if (/^\s*(\/\/|\*)/u.test(lineText)) continue;
            // The declaration itself.
            if (/function\s+$/u.test(source.slice(lineStart, match.index))) continue;
            if (owners.includes(enclosingFunction(source, match.index))) continue;
            const line = source.slice(0, match.index).split('\n').length;
            findings.push({ line, name });
        }
    }
    return findings;
}

test('strayCalls() finds a conversion called outside the pair', () => {
    // A level write that converts the flags but not the pets' clocks, as
    // bones.js savebones() once did.
    const source = [
        'export function save_level_relative_times(state) {',
        '    save_adjust_levelflags(state);',
        '    shift_level_edog_times(state.level, -state.moves);',
        '}',
        'export async function savebones(how, when, corpse, state) {',
        '    // save_adjust_levelflags(state) is named here only in a comment.',
        '    save_adjust_levelflags(state);',
        '}',
    ].join('\n');
    assert.deepEqual(strayCalls(source), [{ line: 7, name: 'save_adjust_levelflags' }]);
});

test('no js/ code converts level turn stamps outside the pair', () => {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const { line, name } of strayCalls(source))
            findings.push(`${file}:${line} ${name}`);
    }
    const allowed = new Set(ALLOWED);
    const stray = findings.filter((f) => !allowed.has(f));
    assert.deepEqual(stray, [],
        'call save_level_relative_times() or rest_level_relative_times() instead');
    assertExceptionCount(findings.length, ALLOWED.length, {
        what: 'tolerated direct conversions',
        pin: 'ALLOWED in scripts/level-relative-times.test.mjs',
    });
});

test('the pair converts the level flags and every pet clock together', () => {
    // A level at turn 500 with stasis until turn 520 and a former pet whose
    // hunger runs to turn 3400 and which last dropped an object on turn 480.
    // A second pet's edog sits in a corpse's remembered monster on the floor,
    // the case saveobj() 740-742 reaches. The write leaves offsets from 500;
    // a read at turn 7 adds 7 back.
    const pet = () => ({ mextra: { edog: { droptime: 480, hungrytime: 3400 } } });
    const roaming = pet();
    const remembered = pet();
    const state = {
        moves: 500,
        level: {
            flags: { stasis_until: 520 },
            monlist: roaming,
            objlist: { oextra: { omonst: remembered }, nobj: null },
            buriedobjlist: null,
        },
    };
    save_level_relative_times(state);
    assert.equal(state.level.flags.stasis_until, 20);
    for (const mtmp of [roaming, remembered])
        assert.deepEqual(mtmp.mextra.edog, { droptime: -20, hungrytime: 2900 });
    state.moves = 7;
    rest_level_relative_times(state);
    assert.equal(state.level.flags.stasis_until, 27);
    for (const mtmp of [roaming, remembered])
        assert.deepEqual(mtmp.mextra.edog, { droptime: -13, hungrytime: 2907 });
});
