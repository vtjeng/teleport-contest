#!/usr/bin/env node

// Record and replay the ordinary #wipe occupation against the patched C
// program. The recipe wishes for one cream pie, applies it, enters #wipe when
// the two cream-blindness counters are three, and waits once after the
// occupation returns to command input.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// Directly assigning the blindness state would skip apply.c use_cream_pie(),
// the elapsed-turn timeout, and cmd.c doextcmd(). A bounded local replay scan
// of seeds 7100001 through 7100050 with these fixed inputs found 7100006 as
// the first whose use_cream_pie() rnd(25) is four. The application turn then
// reduces both counters to the required entry value three.
const SEED = 7100006;
// This established Thursday morning avoids calendar startup messages, which
// do not affect the wipe behavior under test.
const DATETIME = '20330203111213';

const NETHACKRC = [
    'OPTIONS=name:Wiper,role:Rogue,race:human,gender:female,align:chaotic',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=playmode:debug,pettype:none,!acoustics,!autopickup,time,showexp',
    '',
].join('\n');

export function loadWipeOccupationRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: SEED,
            datetime: DATETIME,
            nethackrc: NETHACKRC,
            // Debug Rogue inventory gives the wished cream pie letter h. The
            // space dismisses its first message; the final wait proves that
            // wipeoff() cleared the occupation and returned to command input.
            moves: '\x17cream pie\nah #wipe\n.',
        }],
    }, 'wipe occupation recipe');
}

export async function runWipeOccupationMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ordinary wipe occupation',
            recipe: loadWipeOccupationRecipe(),
        }],
        summaryLabel: 'WIPE OCCUPATION',
        // A debug game leaves a save behind when the recorder exits, so this
        // one-segment recipe must run alone in its install chunk.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWipeOccupationMatrix, 'wipe occupation');
