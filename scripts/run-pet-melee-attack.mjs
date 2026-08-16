#!/usr/bin/env node

// Run the checked-in matrix for a pet's melee attack on an adjacent hostile,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is mhitm.c mattackm() (292-577) and everything the
// physical melee group reaches: missmm() (74-93), pre_mm_attack() (40-73),
// noises() (26-38), hitmm() (642-731), mdamagem() (1014-1120) on its AD_PHYS
// path, passivemm() (1301-1408), uhitm.c mhitm_ad_phys()'s mhitm arm
// (4128-4200), mon.c monkilled() (3376-3418) with mondied() and
// corpse_chance() under it, makemon.c grow_up() (2049-2100), and dogmove.c
// dog_move()'s return-attack block (1145-1171).
//
// Every attack draws `dieroll = rnd(20 + i)` at mhitm.c:441 and, while the
// defender lives, passivemm()'s rn2(3) at :1363. A landed blow adds
// mdamagem()'s d(damn,damd) at :1025 and the knockback pair uhitm.c
// mhitm_knockback() spends at :5258 and :5269. A kill replaces passivemm()'s
// draw -- C returns at :1359-1360 with `mdead` set -- with corpse_chance()'s
// rn2(tmp) at mon.c:3248 and grow_up()'s rnd(victim->m_lev + 1) at
// makemon.c:2095. rnd.c:163 is `x = RND(x) + 1`, so even rnd(1) spends a call.
//
// The kill's draws land one recorded step after the blow whenever
// monkilled()'s line reaches a --More--: xwaitforspace() suspends C inside
// mdamagem(), so corpse_chance() and grow_up() run on the next key. Rows below
// cover both pacings, and the matrix compares per step rather than on totals.
//
// The replay is spaces throughout. `rest_on_space` binds <space> to #wait, so
// one key both rests a move and dismisses a --More--, and `!safe_wait` drops
// do.c cmd_safety_prevention()'s "Are you waiting to get hit?" query, which
// otherwise refuses every wait beside a hostile. Without those two options the
// shortest input that reaches a pet fight is three keys per turn.
//
// Seeds came from a C-side scan, not from any recorded session. The scan
// recorded Valkyrie seeds 7710001-7710030 at the datetime below with forty
// spaces each and kept the ones whose log holds a draw at mhitm.c:441; a
// port-side replay then measured how far each seed still matches, and the
// rows below are the ones that match through a kill. Its domain and yield:
//
//   Valkyrie/female/neutral, seeds 7710001-7710030: 17 fought, 6 usable.
//
// The eleven fights left out stop for owners outside this matrix: worn.c
// m_dowear() when a monster picks equipment up, mon.c restrap() when a hider
// hides again, and makemon.c grow_up()'s level gain once a pet's maximum hit
// points pass its level ceiling.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PET_MELEE_DATETIME = '20260401120000';

// A pet is the point of the matrix, so pettype is left at its default and the
// role decides the species: a Valkyrie gets whichever of the kitten and the
// little dog makemon.c pet_type()'s rn2(2) picks.
export const PET_MELEE_RC = [
    'OPTIONS=name:FreshDiff,role:Valkyrie,race:human,gender:female,'
    + 'align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=rest_on_space,!safe_wait',
    '',
].join('\n');

function waits(count) {
    return ' '.repeat(count);
}

export function loadPetMeleeAttackRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A little dog kills a grid bug with the first blow it lands, so
            // the whole of hitmm(), mdamagem() and the kill sit in one step
            // with no --More-- between them. corpse_chance()'s divisor is 3,
            // because a grid bug is G_FREQ 1 and MZ_TINY, and rn2(3)=1
            // declines the corpse.
            { seed: 7710013, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(40) },
            // A kitten against a jackal: two misses, then a landed blow whose
            // rn2(4)=3 opens dogmove.c:1158's return attack, which misses in
            // its turn and prints missmm()'s line with the roles swapped.
            // Four --More-- splits follow, and the kill at step 24 leaves no
            // corpse on rn2(2)=1.
            { seed: 7710017, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(40) },
            // A little dog against a kobold zombie, which mondata.h
            // nonliving() sends to monkilled()'s "destroyed" verb rather than
            // "killed". Its line blocks at a --More--, so corpse_chance() and
            // grow_up() land on the following key.
            { seed: 7710019, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(40) },
            // A kitten against a newt, the shortest fight here: one miss and
            // one fatal blow.
            { seed: 7710022, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(40) },
            // The corpse row. A little dog trades blows with a fox for ten
            // turns -- including a return attack that lands, at step 10 --
            // and its kill draws rn2(3)=0, so mondied() reaches
            // make_corpse() and mkobj.c start_corpse_timeout() spends five
            // more calls. Twenty keys stop the segment on that step, because
            // the pet eats the corpse on the next one and dogmove.c
            // dog_eat() is unported.
            { seed: 7710023, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(20) },
            // A little dog against a fox again, with the return attack
            // landing this time, and a kill on the following key. Twenty-seven
            // keys stop before the pet's third kill of the game, where its
            // maximum hit points pass its level ceiling and grow_up()'s level
            // gain is outside this port.
            { seed: 7710020, datetime: PET_MELEE_DATETIME,
                nethackrc: PET_MELEE_RC, moves: waits(27) },
        ],
    }, 'pet melee attack recipe');
}

async function main() {
    await runFreshMatrix({
        entries: [{
            label: 'pet melee attack',
            recipe: loadPetMeleeAttackRecipe(),
        }],
        summaryLabel: 'pet melee attack',
    });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main().catch((error) => {
        process.stderr.write(`run-pet-melee-attack: ${error.message}\n`);
        process.exitCode = 2;
    });
}
