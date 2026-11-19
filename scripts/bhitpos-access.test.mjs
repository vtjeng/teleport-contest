// C keeps gb.bhitpos, "the place where a throw or zap hits or stops", as one
// coord in a global struct. decl.c:219 starts it at { 0, 0 } once per process,
// and the save file does not store it, so every C reader sees a value: the
// last one written, or zero. js/gstate.js initialGameState() holds it as
// game.gb.bhitpos with the same start. The port once created it on first
// write, so a reader reached before any write threw (zap.c hit() and miss()
// from ball.c drag_ball()) or substituted a default of its own. This test
// pins the initial value and fails when js/ guards, defaults or deletes it.
//
// C assigns the struct by value: `save = gb.bhitpos` is a copy, and a write
// changes the one struct every reader sees. The port therefore never
// replaces the object. Code reads and writes its .x and .y fields, and saves
// it with a spread copy; holding the object itself would let a later field
// write change a saved value, and replacing it would leave a held reference
// stale. accessFindings() fails on any other use.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { game, resetGame } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { PM_NEWT } from '../js/monsters.js';
import { canspotmon } from '../js/display.js';
import { cansee } from '../js/vision.js';
import { hit, miss } from '../js/zap.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

// Blank out comments, keeping line numbers, so prose about bhitpos is not
// read as code. A `//` counts as a comment only at the start of a line or
// after whitespace, which keeps URLs in strings intact.
export function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|\s)\/\/.*$/gmu, '$1');
}

// Code forms that treat gb.bhitpos as possibly absent.
const ABSENT_FORMS = [
    ['a ?? default or ??= creation', /bhitpos\s*\?\?/u],
    ['an optional chain before it', /\?\.\s*bhitpos\b/u],
    ['an optional chain after it', /\bbhitpos\s*\?\./u],
    ['a delete', /\bdelete\s+[\w$.[\]]*bhitpos\b/u],
];

export function absentFormFindings(source, file = '<source>') {
    const findings = [];
    stripComments(source).split('\n').forEach((line, index) => {
        for (const [label, pattern] of ABSENT_FORMS) {
            if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${label}`);
        }
    });
    return findings;
}

// Every bhitpos token in code must be a field access (`bhitpos.x`,
// `bhitpos.y`) or the operand of a spread copy (`{ ...state.gb.bhitpos }`).
// The one exception is the initializer in js/gstate.js initialGb().
export function accessFindings(source, file = '<source>') {
    const findings = [];
    stripComments(source).split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/\bbhitpos\b/gu)) {
            const after = line.slice(match.index + match[0].length);
            const before = line.slice(0, match.index);
            if (/^\s*\.\s*[xy]\b/u.test(after)) continue;
            if (/\.\.\.\s*[\w$.]*$/u.test(before)) continue;
            if (file === 'js/gstate.js'
                && /return \{ bhitpos: \{ x: 0, y: 0 \} \};/u.test(line)) continue;
            findings.push(`${file}:${index + 1}`);
        }
    });
    return findings;
}

function jsFiles() {
    return readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .sort();
}

test('the absent-form scan flags each guard and ignores comments', () => {
    // One line per form the port used before game state held bhitpos.
    const sample = [
        'state.gb.bhitpos ??= { x: 0, y: 0 };',
        'const p = state.gb?.bhitpos;',
        'place(p.bhitpos?.x);',
        'const q = state.gb.bhitpos ?? { x: mon.mx, y: mon.my };',
        'delete state.gb.bhitpos;',
        '// state.gb.bhitpos ??= {} in a comment',
        '/* state.gb?.bhitpos in a block comment */',
        'state.gb.bhitpos.x = x;',
    ].join('\n');
    assert.deepEqual(absentFormFindings(sample, 'sample.js'), [
        'sample.js:1: a ?? default or ??= creation',
        'sample.js:2: an optional chain before it',
        'sample.js:3: an optional chain after it',
        'sample.js:4: a ?? default or ??= creation',
        'sample.js:5: a delete',
    ]);
});

test('no js/ file treats gb.bhitpos as possibly absent', () => {
    const findings = jsFiles().flatMap((name) => absentFormFindings(
        readFileSync(join(JS_DIR, name), 'utf8'),
        `js/${name}`,
    ));
    assert.deepEqual(findings, []);
});

test('the access scan allows only field access and spread copies', () => {
    // Allowed forms first, then each form the port used before.
    const sample = [
        'state.gb.bhitpos.x = x;',
        'state.gb.bhitpos.y += dy;',
        'const save_bhitpos = { ...state.gb.bhitpos };',
        'if (m_at(state.gb.bhitpos.x, state.gb.bhitpos.y)) return;',
        'state.gb.bhitpos = { x, y };',
        'const hit = state.gb.bhitpos;',
        'see(mon, { observedAt: state.gb.bhitpos });',
        'state.gb.bhitpos = save_bhitpos;',
        '// state.gb.bhitpos = { x, y } in a comment',
    ].join('\n');
    assert.deepEqual(accessFindings(sample, 'sample.js'), [
        'sample.js:5',
        'sample.js:6',
        'sample.js:7',
        'sample.js:8',
    ]);
    // The initializer is exempt only in js/gstate.js.
    const init = '    return { bhitpos: { x: 0, y: 0 } };';
    assert.deepEqual(accessFindings(init, 'js/gstate.js'), []);
    assert.deepEqual(accessFindings(init, 'js/other.js'), ['js/other.js:1']);
});

test('every js/ use of gb.bhitpos is a field access or a spread copy', () => {
    const findings = jsFiles().flatMap((name) => accessFindings(
        readFileSync(join(JS_DIR, name), 'utf8'),
        `js/${name}`,
    ));
    assert.deepEqual(findings, []);
});

test('game state starts gb.bhitpos at decl.c zero', async () => {
    const decl = readFileSync(
        join(ROOT, 'nethack-c/upstream/src/decl.c'),
        'utf8',
    );
    assert.match(decl, /\{ 0, 0 \}, \/\* bhitpos \*\//u);
    assert.deepEqual(resetGame().gb.bhitpos, { x: 0, y: 0 });
});

// A debug-mode Wizard with no pet: makedog() is the one startup path that
// writes gb.bhitpos (dog.c:272), so with pettype:none nothing has written it
// when the first command is read. Seed, date and name are arbitrary.
const NO_PET_INPUT = {
    seed: 40417733,
    datetime: '20460302101500',
    nethackrc: [
        'OPTIONS=name:Nopet,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug,pettype:none',
        '',
    ].join('\n'),
    moves: '',
};

test('hit() and miss() read the unwritten zero position, as C does', async () => {
    await runSegment(NO_PET_INPUT);
    const state = game;
    // This seed starts the hero in an unlit room. A newt two squares east,
    // beyond night vision, is one the hero cannot spot, so hit() and miss()
    // name it only if cansee(gb.bhitpos) holds; C's unwritten <0,0> is not
    // in sight, so both say "it".
    const newt = await makemon_runtime(state.mons[PM_NEWT],
        state.u.ux + 2, state.u.uy, 0, { state });
    assert.ok(newt);
    assert.equal(canspotmon(newt, state), false);
    assert.equal(cansee(0, 0, state), false);
    const lines = [];
    const message = async (line) => lines.push(line);
    await hit('iron ball', newt, '.', state, { message });
    await miss('iron ball', newt, state, { message });
    assert.deepEqual(lines, [
        'The iron ball hits it.',
        'The iron ball misses it.',
    ]);
    assert.deepEqual(state.gb.bhitpos, { x: 0, y: 0 });
});
