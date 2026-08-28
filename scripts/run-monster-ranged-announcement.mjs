#!/usr/bin/env node

// Run the checked-in matrix for mthrowu.c monshoot():262-300's visible
// quantity-one throw announcement. The input ends at the --More-- prompt that
// pline() raises before entering m_throw(), so missile flight remains outside
// this slice.
//
// The bounded seed scan covered 9200001-9200100 at 20260827130000. Each case
// wished for speed boots, generated a goblin, and inspected only whether the
// goblin carried one orcish dagger and whether the opposite retreat lane was
// open. Seed 9200016 was the first qualifying case. Testing one through seven
// eastward steps found that seven was the first distance at which a following
// stationary action reached the throw. The long lamp name makes the wield line
// fill enough of the terminal row that the following throw announcement asks
// for --More--; this exposes the boundary before m_throw() spends randomness.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const GENESIS_KEY = '\u0007';
export const LAMP_NAME = 'boundary-marker-with-a-long-name';

function nethackrc() {
    return [
        'OPTIONS=name:RangedAnnouncement,role:Valkyrie,race:human,'
        + 'gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMonsterRangedAnnouncementRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // The first qualifying seed in the declared 100-seed scan above.
            seed: 9200016,
            datetime: '20260827130000',
            nethackrc: nethackrc(),
            moves: ` #wizwish\nspeed boots\nWe${GENESIS_KEY}goblin\n`
                + `lllllll#wizwish\nmagic lamp named ${LAMP_NAME}\n#rub\nf`,
        }],
    }, 'monster ranged announcement recipe');
}

function firstRow() {
    return game.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

// The differential pins the PRNG stream, complete screen, attributes and
// cursor. This check pins why the last screen is the slice boundary: C sets
// m_shot.s before pline(), while m_shot.o, n and i follow the message.
export async function verifyMonsterRangedAnnouncementSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1)
        throw new Error('monster ranged announcement stopped before --More--');
    assert.equal(
        firstRow(),
        `You now wield a lamp named ${LAMP_NAME}.--More--`,
    );
    assert.deepEqual(game.m_shot, { s: false });
}

export async function runMonsterRangedAnnouncementMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'visible single monster throw announcement',
            recipe: loadMonsterRangedAnnouncementRecipe(),
        }],
        summaryLabel: 'MONSTER RANGED ANNOUNCEMENT',
        verifySegment: verifyMonsterRangedAnnouncementSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterRangedAnnouncementMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster ranged announcement: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
