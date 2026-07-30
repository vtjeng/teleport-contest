#!/usr/bin/env node

// Run the checked-in matrix for a monster that steps on a dart trap, through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is trap.c mintrap() (3732-3840), reached from monmove.c
// postmov():1509, through trapeffect_selector() (2936) into the monster arm of
// trapeffect_dart_trap() (1294-1318) and thitm() (6709-6773). What a recording
// can show is the top line thitm() writes for a missed dart, the trap glyph
// seetrap() exposes, the dart the miss leaves on the floor, and the draws the
// arm spends: mksobj()'s weapon-initialization sequence for the missile, the
// rn2(6) that poisons it, and the rnd(20) that decides the shot. The matrix
// therefore spreads over whether the hero can see the victim, which selects
// both seetrap() and the line, and over the three doname() shapes the missile
// can take -- plain, poisoned and eroded.
//
// The hero searches for the whole segment. Standing still keeps the hero's own
// moves out of the recording, gives the monsters turns in which to find a
// trap, and fixes what the hero can see, which is what selects the arm.
//
// Seeds were found by running the port over seed ranges and keeping those
// whose dungeon level one holds a DART_TRAP that some monster later stepped
// on, read from the trap's `once` bit; none was copied from a recorded
// session. Each segment's move count is the largest that stays inside behavior
// this slice owns: these games later reach monmove.c distfleeck()'s refused
// monster-flight boundary, and the counts stop short of it.
//
// Two branches have no segment here. The misfire gate at trap.c:1299, which
// draws rn2(15) once a trap that has already fired is also mapped, needs a
// second monster on the same mapped trap inside the move budget; 20,000
// scanned seeds produced none, and scripts/monmove.test.mjs pins both its
// outcomes against postmov() directly. thitm()'s `strike` arm is refused, so
// no case may reach it: it needs weapon.c dmgval() and mon.c monkilled().

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc(pettype) {
    return [
        'OPTIONS=name:Prober,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        '',
    ].join('\n');
}

function waiting({ seed, pettype = 'none', turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterDartTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The plain in-sight case: `The grid bug is almost hit by a
            // dart!`. Being in sight is also what calls seetrap(), so this is
            // the case in which the trap glyph appears on the map.
            waiting({ seed: 6200496, turns: 120 }),
            // The same arm with the dart arm's own rn2(6) rolling zero, which
            // doname() reports as `a poisoned dart`. mksobj_init()'s rn2(100)
            // is a separate poison roll and does not fire here.
            waiting({ seed: 6704423, turns: 100 }),
            // A dart that mksobj_init()'s erosion rolls corroded, which
            // doname() reports as `a corroded dart`. The victim is a lichen,
            // so this is also a second species through Monnam().
            waiting({ seed: 6503859, turns: 100 }),
            // A second plain in-sight shot, on another level and at another
            // turn, so no single map or firing turn carries the arm.
            waiting({ seed: 6706382, turns: 100 }),
            // The out-of-sight arm. thitm()'s cansee() gate silences the line
            // and canseemon() withholds seetrap(), so the dart lands on an
            // unmapped trap and only the floor object shows that it fired.
            // A pet shares the scan, which reaches the same postmov() call
            // through dog_move() rather than m_move().
            waiting({ seed: 6200154, pettype: 'dog', turns: 120 }),
            waiting({ seed: 6200912, pettype: 'dog', turns: 100 }),
            waiting({ seed: 6200920, pettype: 'dog', turns: 100 }),
            waiting({ seed: 6300711, pettype: 'cat', turns: 100 }),
            waiting({ seed: 6301036, pettype: 'cat', turns: 100 }),
        ],
    }, 'monster dart trap recipe');
}

export async function runMonsterDartTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster dart trap',
            recipe: loadMonsterDartTrapRecipe(),
        }],
        summaryLabel: 'MONSTER DART TRAP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterDartTrapMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster dart trap: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
