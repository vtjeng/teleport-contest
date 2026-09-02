#!/usr/bin/env node

// Run the checked-in matrix for a monster whose melee attack on the hero lands
// and does ordinary physical damage, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output in
// an isolated temporary workspace.
//
// What the matrix pins is a landed AD_PHYS blow end to end: mhitu.c mattacku()
// (491-951) reaching hitmu() (1143-1267) from both of its melee arms, uhitm.c
// mhitm_adtyping() (4781-4832) dispatching on the damage type, uhitm.c
// mhitm_ad_phys() (4021-4127) for a hero defender, mhitu.c hitmsg() (28-81),
// mdamageu() (1901-1927) and passiveum() (2434-2519). Four random-number calls
// come out of one landed blow:
//
//   rnd(20)  the to-hit roll, at mhitu.c:806 for a hand-to-hand attack and at
//            mhitu.c:912 for an AT_WEAP one.
//   d(n,x)   the blow's base damage at mhitu.c:1187.
//   rn2(3), rn2(6)  mhitm_knockback()'s distance and its one-in-six gate. The
//            gate admits AT_CLAW, AT_KICK, AT_BUTT and AT_WEAP, so unlike the
//            shock matrix's grid-bug bites, two of the blows below can reach
//            past it; QUALITY.json's monster-melee-knockback-on-the-hero-stops
//            records the case where one does.
//
// Between them the two segments cover three attack types and both of
// hitmsg()'s reachable verbs:
//
//   AT_BITE, AD_PHYS  a sewer rat's 1d3 and a jackal's 1d2, printing "bites"
//     through mattacku()'s hand-to-hand arm.
//   AT_CLAW, AD_PHYS  a kobold zombie's 1d4, printing hitmsg()'s default verb
//     "hits" through the same arm.
//   AT_WEAP, AD_PHYS with nothing wielded  a kobold's 1d4, printing the same
//     default verb through mattacku()'s AT_WEAP arm at mhitu.c:912. This is
//     mhitm_ad_phys():4041's `AT_WEAP && otmp` with its second term false,
//     which is where mon_wield_item() leaves a monster it found no weapon for.
//     An attacker that is holding one stops instead, on the armed blow at
//     :4041-4121 that this slice does not port.
//
// No fresh case here reaches AT_KICK, AT_BUTT, AT_STNG, AT_TUCH or AT_TENT,
// and none can on the first level. makemon.c rndmonst_adj():1671 caps a random
// monster at monmax_difficulty(), which monst.h:259 defines as
// `(level_difficulty() + u.ulevel) / 2`; on dungeon level 1 with a level-1 or
// level-2 hero that is 1. Every species at difficulty 1 with an AD_PHYS attack
// -- jackal, fox, kobold, goblin, sewer rat, kobold zombie, newt -- carries
// AT_BITE, AT_CLAW or AT_WEAP and nothing else. Reaching a pony's kick or a
// unicorn's butt needs a deeper level, so scripts/mhitu.test.mjs pins those
// verbs directly instead.
//
// The seeds were found by recording candidate walks and keeping the ones whose
// landed blows replay. Their domains and yields:
//
//   Segment 1 is the case QUALITY.json's monster-melee-hit-edge deferral
//   recorded when mattacku() first stopped at hitmu(). Its walk was cut to
//   thirteen keys then because the sewer rat's next blow landed; the whole
//   walk runs here.
//
//   Segment 2: Valkyrie, female, human, pettype:none, datetime 20260907114500,
//   seeds 6610001-6610400, walking 144 steps south and north. 400 seeds ran
//   through the port, 18 of them landed a blow that prints "hits", and 13 of
//   those plus one that stops at the knockback were recorded against C: 11
//   matched, one diverged on mthrowu.c monmulti() and one is the knockback
//   deferral. Seed 6610160 is the passing one whose walk lands both an AT_BITE
//   blow and an unarmed AT_WEAP one.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function walk(pattern, repeats) {
    return pattern.repeat(repeats);
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

export function loadMonsterMeleeHitPhysRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A Healer walking east and west. The opening space dismisses the
            // --More-- behind "You are lucky!  Full moon tonight."; without it
            // the tty swallows every direction key that follows and the game
            // never takes a turn.
            {
                seed: 880042,
                datetime: '20250612101500',
                nethackrc: nethackrc('Healer'),
                moves: ` ${walk('llllllhhhhhh', 12)}`,
            },
            // A Valkyrie walking south and north. This hero's welcome line
            // fits on one row and needs no --More--, so the walk opens on a
            // direction key.
            {
                seed: 6610160,
                datetime: '20260907114500',
                nethackrc: nethackrc('Valkyrie'),
                moves: walk('jjjjjjkkkkkk', 12),
            },
        ],
    }, 'monster melee physical hit recipe');
}

// The steps each segment is here for, what mhitu.c prints on them, and the
// hero's hit points once the step is over. The keys are seeds because the
// recipe's own rows carry no label.
export const MONSTER_MELEE_HIT_PHYS_EVENTS = new Map([
    [880042, [
        // mhitu.c:88-90's `nearmiss`, kept from the miss matrix's short cut of
        // this same walk: the roll equals the differential exactly.
        { keys: 10, says: 'The sewer rat just misses!', uhp: 13 },
        // The blow that the miss matrix stopped short of. AT_BITE, so
        // hitmsg():195-197 picks "bites", and a 1d3 roll of 2 comes off a
        // Healer already down to 13 of 13.
        { keys: 14, says: 'The sewer rat bites!', uhp: 11 },
        // AT_CLAW takes hitmsg()'s default arm at :221-222. A kobold zombie's
        // 1d4 rolled 1 here, against 10 hit points.
        { keys: 81, says: 'The kobold zombie hits!', uhp: 9 },
    ]],
    [6610160, [
        // A jackal's 1d2 rolled its maximum against a full 16.
        { keys: 8, says: 'The jackal bites!', uhp: 14 },
        // The unarmed AT_WEAP blow, 1d4 for 3. mswings() prints nothing
        // because MON_WEP() is null, which is the same thing that keeps
        // mhitm_ad_phys() out of its armed arm.
        { keys: 39, says: 'The kobold hits!', uhp: 13 },
        // The same kobold missing, so the segment shows both sides of one
        // attacker's to-hit test rather than only the side it is here for.
        { keys: 55, says: 'The kobold misses!', uhp: 10 },
    ]],
]);

// The differential compares whole screens, so a segment that stopped reaching
// hitmu() would still pass if the port and C agreed on the map. This names the
// line each one exists for and the hit points it cost, replayed through the
// port alone.
export async function verifyMonsterMeleeHitPhysSegment(recipeSegment) {
    const events = MONSTER_MELEE_HIT_PHYS_EVENTS.get(recipeSegment.seed);
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

export async function runMonsterMeleeHitPhysMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster melee physical hit',
            recipe: loadMonsterMeleeHitPhysRecipe(),
        }],
        summaryLabel: 'MONSTER MELEE PHYSICAL HIT',
        verifySegment: verifyMonsterMeleeHitPhysSegment,
    });
}

runMatrixCli(import.meta.url, runMonsterMeleeHitPhysMatrix, 'monster melee physical hit');
