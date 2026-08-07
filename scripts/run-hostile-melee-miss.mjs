#!/usr/bin/env node

// Run the checked-in matrix for a hero whose melee attempt against a hostile
// monster misses, through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// What the matrix pins is one keystroke's worth of uhitm.c: hack.c
// domove_core() reaches do_attack() (448-583) with a hostile on the
// destination, and the attempt runs through attack_checks() (189-327),
// hitum() (758-790), known_hitum()'s miss arm (587-646), missum()
// (5198-5214) and passive() (5865-6120). Four random-number calls come out
// of it, in this order:
//
//   rn2(20)   eat.c gethungry(), reached from hack.c overexertion() at
//             uhitm.c:524. Combat costs nutrition on top of the turn loop's
//             own tick, and this is the attempt's first draw -- earlier than
//             the to-hit roll, which is what makes it easy to get wrong.
//   rn2(19)   attrib.c exercise(A_STR, TRUE) at uhitm.c:543.
//   rnd(20)   the to-hit roll at uhitm.c:780. find_roll_to_hit() computes
//             what it is compared against and draws nothing itself.
//   rn2(3)    uhitm.c:6013, the guard on passive()'s second switch. It is
//             made only while the target lives, which after a miss it always
//             does.
//
// The target has to be slow. js/unported_monster_actions.js refuses a
// monster's attack on the hero, and a missed target is alive and adjacent, so
// anything that earns a movement ration that turn retaliates and ends the
// segment. mon.c mcalcmove() rounds a speed-1 lichen to 12 movement points on
// rn2(12) == 0 and to none otherwise, so it acts on one turn in twelve; the
// speed-6 newt acts on one in two. Both appear here, and every segment's
// target sits out the turn -- a matrix that recorded one which did not would
// fail against C rather than pass quietly.
//
// Seeds were found by a port-side scan, not by copying any recorded session.
// The scan replayed each seed with no keys, kept the ones whose starting room
// put a hostile lichen or newt within three walkable squares of the hero,
// walked to it and pressed the direction it stood in, and kept the seeds whose
// swing missed. Its domain and yield:
//
//   Valkyrie/female/20260214031500, seeds 7700000-7700399: 24 seeds put a
//     reachable lichen within three steps, of which 5 missed.
//   The same role and date, seeds 7700000-7700899 restricted to an adjacent
//     lichen and two presses: 2 seeds missed twice.
//   Monk/male/20260214031500, seeds 8800000-8800399: 3 of the reachable
//     lichens missed.
//   Valkyrie/female/20260214031500, seeds 9900000-9900699 with newts: 4
//     adjacent newts missed.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const MELEE_DATETIME = '20260214031500';

function nethackrc({ role, gender, options }) {
    return [
        `OPTIONS=name:Lich,role:${role},race:human,gender:${gender},`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

function valkyrie(options = 'pettype:none,!acoustics,time') {
    return nethackrc({ role: 'Valkyrie', gender: 'female', options });
}

function monk(options = 'pettype:none,!acoustics,time') {
    return nethackrc({ role: 'Monk', gender: 'male', options });
}

// The wielded-weapon half. A Valkyrie swings her long sword, so
// find_roll_to_hit() takes the AT_WEAP arm at uhitm.c:419-422 and adds both
// weapon.c hitval() and weapon.c weapon_hit_bonus().
export function loadWieldedMeleeMissRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: a lichen on the northeast diagonal, one key, and
            // `verbose` left on, so missum() takes its mon_nam() arm at
            // uhitm.c:5209 and names the target.
            {
                seed: 7700376,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'u',
            },
            // The same seed and key with `verbose` off. missum() falls to
            // uhitm.c:5211's "You miss it." even though the hero can see
            // exactly what was missed.
            {
                seed: 7700376,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie('pettype:none,!acoustics,time,!verbose'),
                moves: 'u',
            },
            // Two swings at the same target in one segment, which is what
            // shows the per-attempt draws repeating rather than being spent
            // once for the turn.
            {
                seed: 7700376,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'uu',
            },
            {
                seed: 7700708,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'kk',
            },
            // A walk first, so the attack is not the segment's first turn and
            // the hunger and exercise draws land on a used clock.
            {
                seed: 7700346,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'kk',
            },
            {
                seed: 7700360,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'llu',
            },
            {
                seed: 7700384,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'k',
            },
            {
                seed: 7700258,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'll',
            },
            // A newt rather than a lichen. Its armor class is 8 where the
            // lichen's is 9, so worn.c find_mac() feeds find_roll_to_hit() a
            // different number and the matrix is not pinned to one target.
            {
                seed: 9900164,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'n',
            },
            {
                seed: 9900410,
                datetime: MELEE_DATETIME,
                nethackrc: valkyrie(),
                moves: 'l',
            },
        ],
    }, 'wielded melee miss recipe');
}

// The bare-handed half. A Monk's mattk[0] is AT_CLAW rather than AT_WEAP and
// he wields nothing, so find_roll_to_hit() skips hitval() entirely, takes its
// Monk arm at uhitm.c:394-399 for `(u.ulevel / 3) + 2`, and reads
// weapon_hit_bonus()'s P_BARE_HANDED_COMBAT arm with martial_bonus() set.
export function loadBarehandedMeleeMissRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 8800242,
                datetime: MELEE_DATETIME,
                nethackrc: monk(),
                moves: 'k',
            },
            {
                seed: 8800314,
                datetime: MELEE_DATETIME,
                nethackrc: monk(),
                moves: 'h',
            },
            {
                seed: 8800208,
                datetime: MELEE_DATETIME,
                nethackrc: monk(),
                moves: 'll',
            },
        ],
    }, 'bare-handed melee miss recipe');
}

export async function runHostileMeleeMissMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wielded melee miss',
            recipe: loadWieldedMeleeMissRecipe(),
        }, {
            label: 'bare-handed melee miss',
            recipe: loadBarehandedMeleeMissRecipe(),
        }],
        summaryLabel: 'HOSTILE MELEE MISS',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runHostileMeleeMissMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `hostile melee miss: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
