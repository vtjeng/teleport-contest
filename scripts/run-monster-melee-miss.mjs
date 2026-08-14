#!/usr/bin/env node

// Run the checked-in matrix for a monster whose melee attack on the hero
// misses, through fresh C recordings. Every segment contains replay inputs
// only; runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is mhitu.c mattacku() (491-951) as far as its two melee
// to-hit tests and the missmu() side of each: the armor-class differential at
// 709-718, find_offensive()'s FALSE answer at 758, the NATTK loop, and the
// AT_CLAW/AT_KICK/AT_BITE/AT_STNG/AT_TUCH/AT_BUTT/AT_TENT arm's `rnd(20 + i)`
// at 806. One random-number call comes out of a miss, and it is the whole
// event:
//
//   rnd(20)  the to-hit roll at mhitu.c:806, drawn whether it lands or not.
//
// missmu() then prints "The <foo> misses!", or "The <foo> just misses!" when
// the roll equalled the differential exactly and `verbose` is on, and calls
// allmain.c stop_occupation().
//
// The seeds were found by recording candidate walks with the C reference and
// keeping the ones whose first mattacku() event is a miss. Anything later than
// the first event is unreachable: the port stops at hitmu(), so a seed whose
// monsters land a blow before they miss one measures the refusal instead.
// Its domain and yield:
//
//   Valkyrie and Healer, female, human, pettype:none, datetimes
//   20250612101500, 20260318164500, 20251104093000 and 20250612101500 again,
//   seeds 771001-771006 and 880001-880097, walking 144 steps up and down or
//   east and west: 98 seeds recorded, 62 reached mattacku() at all, and 11 of
//   those opened with a miss. Two are below.
//
// The AT_WEAP arm at mhitu.c:912 is not here, and not for want of looking. Two
// seeds in that domain opened with an AT_WEAP miss -- 880036 and 880071 -- and
// both stop earlier on an owner this slice does not touch: 880036 on thrwmu()
// selecting a missile, 880071 on mthrowu.c monmulti(). The development session
// sessions/seed0004-feeding-pony.session.json carries that arm instead, from
// step 52's "The kobold misses!" onward, and scripts/mhitu.test.mjs pins
// mswings() and hitval()'s contribution to the differential directly.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// The opening key of every segment is a space, which dismisses the welcome
// line's --More--. Without it the tty swallows every direction key that
// follows and the game never takes a turn.
function walk(pattern, repeats) {
    return ` ${pattern.repeat(repeats)}`;
}

function nethackrc(role, gender = 'female') {
    return [
        `OPTIONS=name:Melee,role:${role},race:human,gender:${gender},`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

export function loadMonsterMeleeMissRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A newt beside the hero on step 40, missing on rnd(20) of 17
            // against a differential of 16. This is the AT_BITE end of the
            // arm and the only mattacku() event in the whole walk, so the
            // segment runs to its last key with the port matching C.
            {
                seed: 880003,
                datetime: '20250612101500',
                nethackrc: nethackrc('Valkyrie'),
                moves: walk('jjjjjjkkkkkk', 12),
            },
            // "The sewer rat just misses!" on step 10: mhitu.c:88-90's
            // `nearmiss`, where the roll equals the differential exactly.
            // The walk is cut to thirteen keys because the same rat lands a
            // blow on step 13, which is the refusal this slice installs.
            {
                seed: 880042,
                datetime: '20250612101500',
                nethackrc: nethackrc('Healer'),
                moves: ' llllllhhhhhh',
            },
        ],
    }, 'monster melee miss recipe');
}

// The step each segment is here for, and what mattacku() prints on it. The
// keys are seeds because the recipe's own rows carry no label.
export const MONSTER_MELEE_MISS_EVENTS = new Map([
    [880003, { keys: 41, says: 'The newt misses!' }],
    [880042, { keys: 11, says: 'The sewer rat just misses!' }],
]);

// The differential compares whole screens, so a segment that stopped reaching
// mattacku() would still pass if the port and C agreed on the map. This names
// the line each one exists for, replayed through the port alone.
export async function verifyMonsterMeleeMissSegment(recipeSegment) {
    const event = MONSTER_MELEE_MISS_EVENTS.get(recipeSegment.seed);
    if (!event) throw new Error(`no event recorded for ${recipeSegment.seed}`);
    await runSegment({
        ...recipeSegment,
        moves: recipeSegment.moves.slice(0, event.keys),
        storage: { get: () => undefined, set: () => {} },
    });
    // gt.toplines, which pline.c writes whether or not the row was repainted.
    const said = game._ttyToplines ?? '';
    if (said !== event.says) {
        throw new Error(
            `seed ${recipeSegment.seed} said ${JSON.stringify(said)}, not `
            + `${JSON.stringify(event.says)}`,
        );
    }
}

export async function runMonsterMeleeMissMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster melee miss',
            recipe: loadMonsterMeleeMissRecipe(),
        }],
        summaryLabel: 'MONSTER MELEE MISS',
        verifySegment: verifyMonsterMeleeMissSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterMeleeMissMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster melee miss: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
