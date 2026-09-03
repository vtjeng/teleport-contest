#!/usr/bin/env node

// Run the checked-in matrix for a monster that steps on a falling-rock trap,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is trap.c mintrap() (3732-3840), reached from monmove.c
// postmov():1509, through trapeffect_selector() (2936) into the monster arm of
// trapeffect_rocktrap() (1375-1398) and thitm() (6709-6773). What a recording
// can show is the trap glyph seetrap() exposes at 1391, the line thitm()
// writes at 6740 for a rock that connects, the kill line mon.c monkilled()
// adds when the damage empties the victim, the rock the arm leaves on the
// square at 6766, and the draws the arm spends: mksobj()'s
// weapon-initialization sequence for the missile and the d(2, 6) C evaluates
// as thitm()'s argument at 1394.
//
// The arm has no to-hit roll. C passes d_override, so thitm():6721 forces the
// strike and every firing here lands, which is the whole difference from the
// dart trap's monster arm beside it.
//
// The hero searches for the whole segment. Standing still keeps the hero's own
// moves out of the recording, gives the monsters turns in which to find a
// trap, and fixes what the hero can see, which is what selects between the
// silent arm and the one that writes a line.
//
// Seeds were found by running the port over 4,200,000 to 4,202,499 and
// 4,300,000 to 4,302,499 with a fixed clock and one fixed character, keeping
// those whose dungeon level one holds a ROCKTRAP that some monster later
// stood on, read from the trap's `once` bit; none was copied from a recorded
// session. The first band yielded five and the second one, and a third pass
// over 4,200,000 to 4,202,999 added the one survivor below. Each segment's move
// count is forty searches, which is past the firing in every seed and short of
// the boundaries these games reach later.
//
// Two of the seven fire in the hero's sight, and both kill their victim: the
// 2,500-seed scan of the first band found only one in-sight firing and the
// scan of the second only one more. That is what d(2, 6) does to a first-level
// monster -- it averages seven points -- so a victim that both is watched and
// survives its rock has no segment here. The two halves it would join are
// each covered on their own: seed 4201564 below survives out of sight, and
// the two in-sight segments carry the message.
//
// Two more branches have no segment here either.
//
// The wear-out gate at trap.c:1379, which draws rn2(15) once a trap that has
// already fired is also mapped and on a zero unlinks it through deltrap(),
// needs a second monster on the same mapped trap inside the move budget. A
// scan of 4,200,000 to 4,202,499 with a 150-search budget found a rock trap on
// 214 of those levels and no wear-out on any of them, so
// scripts/monster-rock-trap.test.mjs pins both outcomes against mintrap()
// directly. `npm run quality -- defer` carries the same note.
//
// thitm():6738's `harmless` needs a victim that passes_rocks(), which on the
// first dungeon level means a xorn or an earth elemental; neither is generated
// there. scripts/trap-thitm.test.mjs pins that branch too.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(pettype) {
    return [
        'OPTIONS=name:Ursa,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        '',
    ].join('\n');
}

// A Valkyrie who stands still and searches while the monsters move.
function waiting({ seed, pettype = 'none', turns = 40 }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterRockTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The in-sight arm, both times it appears in the two scanned
            // bands. seetrap() exposes the trap glyph, thitm() writes "The
            // goblin is hit by a rock!", monkilled() adds the kill line behind
            // it, and mintrap() answers Trap_Killed_Mon, which postmov():1510
            // turns into MMOVE_DIED. The victim differs -- a goblin here, a
            // jackal below -- so neither name stands alone for the line.
            waiting({ seed: 4200124 }),
            waiting({ seed: 4301332, pettype: 'dog' }),
            // The out-of-sight arm, four times over. canseemon() is false, so
            // 1391's seetrap() does not run and the trap stays unmapped, and
            // thitm():6739's cansee() gate silences the line; only the rock on
            // the floor and the vacated square show that the trap fired. The
            // four fire on turns 3, 9, 29 and 32, so no single firing turn
            // carries the arm.
            waiting({ seed: 4200007 }),
            waiting({ seed: 4200232 }),
            waiting({ seed: 4200308 }),
            waiting({ seed: 4200315 }),
            // The victim that survives its rock. thitm():6752's death test
            // fails, mintrap() answers Trap_Effect_Finished rather than
            // Trap_Killed_Mon, and the sewer rat walks on with one hit point
            // left. It is the only such firing in either scanned band, found
            // by a third pass over 4,200,000 to 4,202,999 that read the
            // victim's hit points at the turn the trap fired.
            waiting({ seed: 4201564 }),
        ],
    }, 'monster rock trap recipe');
}

export async function runMonsterRockTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster rock trap',
            recipe: loadMonsterRockTrapRecipe(),
        }],
        // One segment per recorder chunk. Every segment here is a separate
        // game that the recorder ends with SIGTERM while the hero is still
        // alive, which leaves a lock behind; scripts/record-session.mjs clears
        // the install directory only before a chunk's first segment, so a
        // second segment in the same chunk records "There is already a game in
        // progress under your name." instead of its own game.
        chunkLimit: 1,
        summaryLabel: 'MONSTER ROCK TRAP',
    });
}

runMatrixCli(import.meta.url, runMonsterRockTrapMatrix, 'monster rock trap');
