#!/usr/bin/env node

// Record and replay ordinary and fast farlook cursor movement. Each case first
// performs the hero lookup to consume TIP_GETPOS, then starts a fresh whatis
// map loop and crosses its Escape boundary with one ordinary command wait.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const ESCAPE_KEY = '\u001b';
export const FIRST_HERO_LOOK = ` //   . n${ESCAPE_KEY}`;
export const WALK_FLOOR_LOOK = `// h. ${ESCAPE_KEY}.`;
export const FAST_CURSOR_LOOK = `// H${ESCAPE_KEY}.`;

function nethackrc(name, gender) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:${gender},align:neutral`,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadWhatisMapCursorTerrainRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // Seed 42046 starts at <31,5>; west is visible room floor.
                // The traditional pick exercises DEC mixed-glyph output.
                seed: 42046,
                datetime: '20000205145602',
                nethackrc: nethackrc('Clio', 'female'),
                moves: FIRST_HERO_LOOK + WALK_FLOOR_LOOK,
            },
            {
                // The bounded 42048-42060 scan found seed 42050 among three
                // strict matches. Its fast H move exercises the eight-cell
                // default without entering excluded unexplored terrain.
                seed: 42050,
                datetime: '20000208172905',
                nethackrc: nethackrc('Iris', 'female'),
                moves: FIRST_HERO_LOOK + FAST_CURSOR_LOOK,
            },
        ],
    }, 'whatis map cursor-terrain recipe');
}

export async function runWhatisMapCursorTerrainMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'ordinary and fast whatis map cursor movement',
            recipe: loadWhatisMapCursorTerrainRecipe(),
        }],
        summaryLabel: 'WHATIS MAP CURSOR TERRAIN',
    });
    if (result.passed) assert.equal(result.totals.segments, 2);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runWhatisMapCursorTerrainMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`whatis map cursor terrain: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
