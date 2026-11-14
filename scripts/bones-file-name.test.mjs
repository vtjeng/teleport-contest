// js/files_bones.js set_bonesfile_name() is the one place a bones file's
// name is made (files.c set_bonesfile_name()). C names a special level by its
// own boneid, so the Oracle's bones are "bonD0.O" wherever a game's dungeon
// put the Oracle. The port once built "bones_D<dnum>.<dlevel>" by hand in
// bones.js and again in mklev.js: a later game looked for the Oracle's or
// Asmodeus' bones by level number, missed them, and found them instead on an
// ordinary level with that number. The first test pins the name to C; the
// second fails when a storage call in js/ names a file any other way.
// js/files.js set_savefile_name() is the same one place for a save file
// (files.c set_savefile_name()): C restores only the file its name gives
// the current hero, so a hand-made save name would restore another hero.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { set_bonesfile_name } from '../js/files_bones.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// A topology shaped as init_dungeons() leaves it. The boneids are
// dat/dungeon.lua's bonetags: "D" for the Dungeons of Doom, "M" for the
// Gnomish Mines and "Q" for the Quest; "O" for the oracle and "T" for
// minetn. The quest's dnum 3 and the levels' positions are arbitrary choices
// that exercise each arm: the Oracle at 7 and Minetown at Mines level 3 take
// the special-level arm, Doom level 5 the numbered arm, and Quest level 2 the
// In_quest() filecode arm ("Val", roles.c's Valkyrie filecode).
function topology() {
    return {
        dungeons: [{ boneid: 'D' }, { boneid: 'M' }, { boneid: '' }, { boneid: 'Q' }],
        specialLevels: [
            { dlevel: { dnum: 0, dlevel: 7 }, boneid: 'O' },
            { dlevel: { dnum: 1, dlevel: 3 }, boneid: 'T' },
        ],
        quest_dnum: 3,
        urole: { filecode: 'Val' },
    };
}

test('set_bonesfile_name() matches files.c on special, numbered and quest levels', () => {
    const state = topology();
    const name = (dnum, dlevel) => set_bonesfile_name({ dnum, dlevel }, state);
    // files.c's own examples: "bonD0.nn", "bonM0.T", "bonQBar.n".
    assert.deepEqual(name(0, 7), { file: 'bonD0.O', bonesid: 'D0.O' });
    assert.deepEqual(name(0, 5), { file: 'bonD0.5', bonesid: 'D0.5' });
    assert.deepEqual(name(1, 3), { file: 'bonM0.T', bonesid: 'M0.T' });
    assert.deepEqual(name(1, 4), { file: 'bonM0.4', bonesid: 'M0.4' });
    assert.deepEqual(name(3, 2), { file: 'bonQVal.2', bonesid: 'QVal.2' });
    // The Oracle moved to level 5 in another game: its bones keep their name,
    // and level 7 becomes an ordinary numbered level.
    state.specialLevels[0].dlevel.dlevel = 5;
    assert.equal(name(0, 5).file, 'bonD0.O');
    assert.equal(name(0, 7).file, 'bonD0.7');
});

// The storage names js/ may use directly. Every other name is a bones file
// and must come from set_bonesfile_name(), inside js/files_bones.js, or a
// save file, held in a variable set from set_savefile_name() or listed from
// the save/ directory in the same file.
const FIXED_NAMES = new Set(["'record'", "''", "'save/'"]);
const SAVE_NAME_BINDINGS = [
    /\bconst (\w+) = set_savefile_name\(/gu,
    /\bfor \(const (\w+) of vfsListFiles\('save\/'\)\)/gu,
];
// In js/files_bones.js each bones function sets `name` from
// set_bonesfile_name().
const BONES_NAME = /^name\.file$/u;
const STORAGE_CALL = /\bvfs(?:ReadFile|WriteFile|DeleteFile|ListFiles)\(\s*([^,)]*)/gu;

export function storageNameViolations(file, source) {
    const violations = [];
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '')
        .split('\n').map((line) => line.replace(/\/\/.*$/u, ''));
    const saveNames = new Set(SAVE_NAME_BINDINGS.flatMap(
        (pattern) => [...code.join('\n').matchAll(pattern)].map((m) => m[1])));
    code.forEach((line, index) => {
        for (const match of line.matchAll(STORAGE_CALL)) {
            const argument = match[1].trim();
            if (FIXED_NAMES.has(argument) || saveNames.has(argument)) continue;
            if (file === 'files_bones.js' && BONES_NAME.test(argument)) continue;
            violations.push(`js/${file}:${index + 1}: ${match[0].trim()}`);
        }
    });
    return violations;
}

test('every storage call names its file through a fixed name, set_bonesfile_name() or set_savefile_name()', () => {
    const violations = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js'))) {
        if (file === 'storage.js') continue;
        violations.push(...storageNameViolations(file, readFileSync(join(JS_DIR, file), 'utf8')));
    }
    assert.deepEqual(violations, []);
});

test('the check refuses a bones name built outside set_bonesfile_name()', () => {
    // The form mklev.js used before set_bonesfile_name() was ported.
    const bypass = [
        'const path = `bones_D${state.u.uz.dnum}.${state.u.uz.dlevel}`;',
        'if (!vfsReadFile(path)) return false;',
    ].join('\n');
    assert.deepEqual(storageNameViolations('mklev.js', bypass),
        ['js/mklev.js:2: vfsReadFile(path']);
    assert.deepEqual(storageNameViolations('files_bones.js', 'vfsDeleteFile(path);'),
        ['js/files_bones.js:1: vfsDeleteFile(path']);
    assert.deepEqual(storageNameViolations('files_bones.js', 'vfsWriteFile(name.file, data);'), []);
    assert.deepEqual(storageNameViolations('bones.js', 'vfsWriteFile(name.file, data);'),
        ['js/bones.js:1: vfsWriteFile(name.file']);
    // The fixed save path the port used before set_savefile_name() was ported.
    assert.deepEqual(storageNameViolations('save.js', "vfsWriteFile('nhsave', data);"),
        ["js/save.js:1: vfsWriteFile('nhsave'"]);
    assert.deepEqual(storageNameViolations('save.js',
        'const savefile = set_savefile_name(state);\nvfsWriteFile(savefile, data);'), []);
    assert.deepEqual(storageNameViolations('restore.js',
        "for (const path of vfsListFiles('save/')) vfsReadFile(path);"), []);
});
