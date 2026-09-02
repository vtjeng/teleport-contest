#!/usr/bin/env node

// Run the checked-in matrix for a monster whose melee attack on the hero
// lands and does shock damage, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output
// in an isolated temporary workspace.
//
// What the matrix pins is the whole of a landed AD_ELEC blow: mhitu.c hitmu()
// (1143-1267), uhitm.c mhitm_adtyping() (4781-4832) dispatching on the damage
// type, uhitm.c mhitm_ad_elec() (2708-2723) for a hero defender, uhitm.c
// mhitm_mgc_atk_negated() (74-98), mhitu.c hitmsg() (28-81), mdamageu()
// (1901-1927) and passiveum() (2434-2519). A grid bug's {AT_BITE, AD_ELEC,
// 1d1} is the attack, and five or six random-number calls come out of it:
//
//   rnd(20)  the to-hit roll at mhitu.c:806.
//   d(1,1)   the blow's base damage at mhitu.c:1187.
//   rn2(10)  magic cancellation at uhitm.c:87, compared against 3 * armpro.
//   rn2(20)  destroy_items()'s gate at uhitm.c:2718, drawn only when the
//            cancellation let the attack through, and never won by a
//            level-zero attacker.
//   rn2(3), rn2(6)  mhitm_knockback()'s distance and its one-in-six gate, both
//            spent before it rejects an attack that is not AD_PHYS.
//
// The two segments differ in one thing, the hero's magic cancellation, because
// that is what decides between the two message forms:
//
//   Barbarian, ring mail, objects.c a_can 1, so magic_negation() answers 1 and
//     `rn2(10) >= 3` decides. A roll of 2 prints "You avoid harm." and costs no
//     hit points; a roll of 7 prints "You get zapped!" and costs one.
//   Valkyrie, small shield and no body armor, a_can 0 throughout, so
//     magic_negation() answers 0 and `rn2(10) >= 0` can never fail. The roll
//     still happens and the walk never avoids harm once in 145 keys, which is
//     what a magic_negation() stuck at a constant would break.
//
// The seeds were found by recording candidate walks with the C reference and
// keeping the ones whose grid-bug bites land. Its domain and yield:
//
//   Barbarian and Valkyrie, female, human, pettype:none, datetime
//   20260519143000, seeds 5510001-5510200 and 5520001-5520120, walking 144
//   steps south and north: 320 seeds recorded, 20 met a biting grid bug, and
//   the two below are the ones whose whole walk replays without a stop.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// The opening key of every segment is a space, which dismisses the welcome
// line's --More--. Without it the tty swallows every direction key that
// follows and the game never takes a turn.
function walk(pattern, repeats) {
    return ` ${pattern.repeat(repeats)}`;
}

function nethackrc(role) {
    return [
        `OPTIONS=name:Melee,role:${role},race:human,gender:female,`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

export function loadMonsterMeleeHitElecRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A Barbarian in ring mail: magic cancellation 1, so this walk
            // shows both message forms, six steps apart and from the same
            // grid bug.
            {
                seed: 5510158,
                datetime: '20260519143000',
                nethackrc: nethackrc('Barbarian'),
                moves: walk('jjjjjjkkkkkk', 12),
            },
            // A Valkyrie in a small shield alone: magic cancellation 0, so no
            // roll can spare her and "You avoid harm." never appears.
            {
                seed: 5520013,
                datetime: '20260519143000',
                nethackrc: nethackrc('Valkyrie'),
                moves: walk('jjjjjjkkkkkk', 12),
            },
        ],
    }, 'monster melee shock hit recipe');
}

// The steps each segment is here for, what mhitu.c prints on them, and the
// hero's hit points once the step is over. The keys are seeds because the
// recipe's own rows carry no label.
export const MONSTER_MELEE_HIT_ELEC_EVENTS = new Map([
    [5510158, [
        // rn2(10) of 2 against armpro 1: cancellation wins, the hero keeps
        // every hit point, and no rn2(20) is drawn.
        { keys: 20, says: 'The grid bug bites!  You avoid harm.', uhp: 16 },
        // rn2(10) of 7: cancellation loses and d(1,1) comes off the hero.
        {
            keys: 26,
            says: 'You miss the grid bug.  The grid bug bites!'
                + '  You get zapped!',
            uhp: 15,
        },
    ]],
    [5520013, [
        { keys: 9, says: 'The grid bug bites!  You get zapped!', uhp: 15 },
    ]],
]);

// The differential compares whole screens, so a segment that stopped reaching
// hitmu() would still pass if the port and C agreed on the map. This names the
// line each one exists for and the hit points it cost, replayed through the
// port alone.
export async function verifyMonsterMeleeHitElecSegment(recipeSegment) {
    const events = MONSTER_MELEE_HIT_ELEC_EVENTS.get(recipeSegment.seed);
    if (!events) throw new Error(`no event recorded for ${recipeSegment.seed}`);
    for (const event of events) {
        await runSegment({
            ...recipeSegment,
            moves: recipeSegment.moves.slice(0, event.keys),
            storage: { get: () => undefined, set: () => {} },
        });
        // gt.toplines, which pline.c writes whether or not the row was
        // repainted.
        const said = game._ttyToplines ?? '';
        if (said !== event.says) {
            throw new Error(
                `seed ${recipeSegment.seed} at ${event.keys} keys said `
                + `${JSON.stringify(said)}, not ${JSON.stringify(event.says)}`,
            );
        }
        if (game.u.uhp !== event.uhp) {
            throw new Error(
                `seed ${recipeSegment.seed} at ${event.keys} keys left `
                + `${game.u.uhp} hit points, not ${event.uhp}`,
            );
        }
    }
}

export async function runMonsterMeleeHitElecMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster melee shock hit',
            recipe: loadMonsterMeleeHitElecRecipe(),
        }],
        summaryLabel: 'MONSTER MELEE SHOCK HIT',
        verifySegment: verifyMonsterMeleeHitElecSegment,
    });
}

runMatrixCli(import.meta.url, runMonsterMeleeHitElecMatrix, 'monster melee shock hit');
