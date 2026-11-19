// js/gstate.js initialGameState() builds the game's `gb` struct with
// initialGb(), as C's decl.c declares it once per process, so game code never
// creates it on first use. This test fails when js/ guards it with
// `gb ??= {}` again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { initialGb, resetGame } from '../js/gstate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A `gb ??=` creation, whether a statement or inside an expression.
const CREATION = /\bgb\s*\?\?=/u;

// Skip comment lines and trailing `//` comments so prose is not read as code.
// A whole-source block-comment strip misreads `/*` inside strings and
// regular expressions, so this works line by line.
function codePart(line) {
    if (/^\s*(\/\/|\/\*|\*)/u.test(line)) return '';
    return line.replace(/\s\/\/.*$/u, '');
}

export function gbCreationLines(source) {
    return source.split('\n').flatMap((line, index) => (
        CREATION.test(codePart(line)) ? [index + 1] : []));
}

test('js/ never creates gb on first use', () => {
    const counts = {};
    for (const name of readdirSync(join(ROOT, 'js')).sort()) {
        if (!name.endsWith('.js')) continue;
        const found = gbCreationLines(
            readFileSync(join(ROOT, 'js', name), 'utf8'));
        if (found.length) counts[`js/${name}`] = found.length;
    }
    assert.deepEqual(counts, {});
});

test('the scan finds statement and expression creations, not comments', () => {
    assert.deepEqual(gbCreationLines([
        'state.gb ??= {};', // 1: the statement form
        'const gb = game.gb ??= {};', // 2: inside an expression
        '// state.gb ??= {};', // 3: a comment line
        'state.gb.bhitpos.x = 0;', // 4: an ordinary write
        'state.gbx ??= {};', // 5: a different field
    ].join('\n')), [1, 2]);
});

test('every new game state starts with gb built by initialGb()', () => {
    assert.deepEqual(resetGame().gb, initialGb());
});
