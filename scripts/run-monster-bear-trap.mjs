#!/usr/bin/env node

// Run the checked-in matrix for a monster caught in a bear trap, through fresh
// C recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The behavior is trap.c mintrap() (3732-3840), reached from monmove.c
// postmov():1509, through trapeffect_selector() (2936) into the monster arm of
// trapeffect_bear_trap() (1525-1558), which ends in thitm() (6710-6773) and
// mon.c monkilled() (3376-3418). What a recording can show is the catch line
// the arm writes at 1534, the trap glyph seetrap() exposes at 1537, the
// d(2, 4) it spends at 1554, the kill line monkilled() adds when that roll
// empties the victim, and the corpse and vacated square the death leaves.
//
// EVERY SEGMENT ENDS ON A SPACE, and that is the point of the matrix rather
// than a detail of it. C's pline_mon() at 1534 suspends on a --More-- when a
// line already stands unread, and thitm()'s argument at 1554 is not evaluated
// until the hero clears it. A segment that stopped at the catch would record
// the message and none of the roll. The space is what carries each recording
// across that suspension, so the d(2, 4) lands in the step the space owns and
// the log pins its position rather than only its existence.
//
// The matrix spreads over what changes which branch of C:1526-1557 runs:
// whether the victim is over MZ_SMALL, which is the whole size gate; whether
// the roll leaves it alive and held or empties it, which is what decides
// between mintrap():3838's Trap_Caught_Mon and Trap_Killed_Mon and, through
// postmov():1510, between MMOVE_MOVED and MMOVE_DIED; and how long the hero
// walks first, which changes what else the turn contains around the catch.
//
// The pony is the victim in every catch because it is the only starting pet
// over MZ_SMALL: dog.c pet_type() returns gu.urole.petnum when the role has
// one, and role.c:209 gives the Knight PM_PONY, so no `pettype` value produces
// one for another role. A monster cannot be steered onto a trap -- a pet that
// has seen it avoids it through mon_knows_traps(), and hack.c
// domove_swap_with_pet()'s mintrap() call at 2178-2183 is behind a refusal --
// so the hero walks to a square beside the trap and then searches while the
// pet moves on its own.
//
// Seeds were found by running the port over seeds 7,000,000 to 7,011,999 with
// a fixed clock and two fixed characters, keeping those whose dungeon level
// one holds a BEAR_TRAP that a monster later stood on, read from the monster's
// `mtrapped` bit and the trap under it; none was copied from a recorded
// session. Each walk is the shortest path of at most forty direction keys over
// plain floor, corridor and open doorway from the hero's start to a square
// beside that trap, and each move count is the smallest round number past the
// catch it was chosen for.
//
// Two branches of the arm have no segment here, and
// scripts/monster-bear-trap.test.mjs pins both against mintrap() directly.
// FORCETRAP's "evades" line at 1545-1552 needs trap.c openfallingtrap() or a
// failed untrap, neither of which anything ported calls. The out-of-sight arms
// at 1539-1543 need the catch to happen where the hero cannot watch: 12,000
// scanned seeds produced five catches and every one of them was in sight,
// because the pet that walks onto the trap is the one following the hero.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc(role, gender, align, pettype) {
    return [
        `OPTIONS=name:Ursa,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        '',
    ].join('\n');
}

// A Knight, whose pet is the saddled pony of C's role.c:209, walking to the
// trap and then standing still. `tail` is what follows the walk: searches
// while the pet moves, then the space that clears the --More-- the catch line
// raises.
function knight({ seed, walk, turns, tail = ' ' }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc('Knight', 'male', 'lawful', 'horse'),
        moves: `${walk}${'s'.repeat(turns)}${tail}`,
    };
}

export function loadMonsterBearTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The arm's common case, four times over: the pony is held, the
            // catch line is written, the trap is exposed under it and d(2, 4)
            // lands after the space. The four differ in how far the hero walks
            // and in how much else the catch turn carries, so no one record
            // stands alone for the message or the roll.
            knight({ seed: 7000039, walk: 'l', turns: 6 }), // caught on turn 5
            knight({ seed: 7005082, walk: 'j', turns: 6 }), // on turn 6
            knight({ seed: 7010149, walk: 'llll', turns: 6 }), // on turn 9
            // on turn 25
            knight({ seed: 7007646, walk: 'lllllljjjbjjn', turns: 12 }),
            // The roll that empties its victim. thitm() reports the kill,
            // mintrap() answers Trap_Killed_Mon and postmov():1510-1513 turns
            // that into MMOVE_DIED, which is the whole difference from the
            // four above. The kill line follows the catch line behind a second
            // --More--, so this segment carries two spaces, and the two
            // searches after them record that the hero keeps taking turns with
            // the pet gone.
            knight({
                seed: 7008529,
                walk: 'lllnnlllllllnllllllllnlll',
                turns: 8,
                tail: '  ss',
            }),
            // The other side of C:1530's size gate. A kobold zombie is
            // MZ_SMALL, so the trap closes through it: no line, no draw, no
            // damage and no trapped bit, and the recording shows it standing
            // on the trap square afterwards with the trap still unmapped. The
            // silence is the assertion, which is why this segment runs forty
            // turns rather than stopping at the crossing.
            {
                seed: 7002077,
                datetime: DATETIME,
                nethackrc: nethackrc('Valkyrie', 'female', 'neutral', 'dog'),
                moves: `jbhhhhhhbhhhhh${'s'.repeat(40)} `,
            },
        ],
    }, 'monster bear trap recipe');
}

export async function runMonsterBearTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster bear trap',
            recipe: loadMonsterBearTrapRecipe(),
        }],
        summaryLabel: 'MONSTER BEAR TRAP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterBearTrapMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`monster bear trap: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
