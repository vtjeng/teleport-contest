#!/usr/bin/env node

// Run the checked-in matrix for a hero who walks onto a teleport trap, through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is hack.c domove() -> spoteffects() -> trap.c dotrap()
// (2995-3060) -> trapeffect_selector() (2936-2993) into the hero arm of
// trapeffect_telep_trap() (2069-2085), which calls seetrap() and then
// teleport.c tele_trap() (1491-1535). Every trap a random level generates has
// trap->once clear and no trap->teledest, so each segment takes tele_trap()'s
// last arm, tele() -> scrolltele(NULL) -> safe_teleds() (717-770): up to forty
// rnd(COLNO - 1) and rn2(ROWNO) candidate pairs until one satisfies teleok(),
// then teleds() with TELEDS_TELEPORT. What a recording shows is the trap glyph
// seetrap() reveals, the candidate draws safe_teleds() spends, and teleds()'s
// "You materialize in a different location!" line over the redrawn map.
//
// Three searches follow each walk-in. They cost a turn each at the arrival
// square, which is how the recording checks that the hero really is where
// teleds() put her rather than merely that one screen matched.
//
// Seeds were found by generating dungeon level one with the port over seeds
// 1..900 and keeping those whose level holds a TELEP_TRAP the hero can reach
// in a straight line of at most twelve walkable squares; six of the 900
// qualified and five are used here. Seed 560 is the sixth and is left out: a
// monster reaches a trap of its own before the hero arrives, which stops the
// segment on the monster arm rather than on this one. No seed was copied from
// a recorded session.
//
// tele_trap()'s trap->once arm, the one-shot niche that makevtele() hides
// beside a vault, is not in this matrix. Reaching it in a fresh recording
// means searching out the secret door and then the secret corridor behind it,
// and the same search that reveals the corridor reveals the trap on it, after
// which dotrap()'s escape branch and the paranoid "Really step into that
// teleportation trap?" prompt both stand in the way. See the deferral recorded
// under `npm run quality -- defer`. sessions/seed0012-monk-vault-escort covers
// that arm against C, and scripts/hero-teleport-trap.test.mjs pins it from a
// generated level.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

const NETHACKRC = [
    'OPTIONS=name:Prober,role:Healer,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    // No pet: a pet on the trap square or on the square the hero leaves hands
    // the step to hack.c domove_swap_with_pet(), and a pet that steps on the
    // trap itself reaches the monster arm, which is a separate boundary.
    'OPTIONS=pettype:none',
    '',
].join('\n');

// Three no-op turns after the teleport, spent where teleds() left the hero.
const SETTLE = 'sss';

function walk(seed, moves) {
    return { seed, datetime: DATETIME, nethackrc: NETHACKRC,
        moves: `${moves}${SETTLE}` };
}

export function loadHeroTeleportTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A diagonal step onto the trap, so no segment's approach
            // direction is load-bearing.
            walk(105, 'u'),
            // The shortest orthogonal case: one step north.
            walk(130, 'k'),
            // Three squares of room before the trap, north on one level and
            // west on the other, so the hero has spent ordinary moves before
            // the arm runs.
            walk(449, 'kkk'),
            walk(466, 'hhh'),
            // The longest walk in the matrix, six squares east.
            walk(897, 'llllll'),
        ],
    }, 'hero teleport trap recipe');
}

export async function runHeroTeleportTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'hero teleport trap',
            recipe: loadHeroTeleportTrapRecipe(),
        }],
        summaryLabel: 'HERO TELEPORT TRAP',
        // One segment per recorder chunk. The recorder clears the install
        // directory only before a chunk's first segment, and a segment that
        // ends with the hero alive leaves a save behind, so a second segment
        // in the same chunk restores the first game instead of generating its
        // own level.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runHeroTeleportTrapMatrix, 'hero teleport trap');
