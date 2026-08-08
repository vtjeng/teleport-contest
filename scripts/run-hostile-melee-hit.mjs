#!/usr/bin/env node

// Run the checked-in matrix for a hero whose melee attempt against a hostile
// monster lands without killing it, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output in
// an isolated temporary workspace.
//
// What the matrix pins is uhitm.c hmon() (817-834) and hmon_hitmon()
// (1752-1935) with the helpers they reach, entered from known_hitum()'s hit arm
// (610-644). Nine random-number calls can come out of one landed blow, and only
// the first four are shared with a miss:
//
//   rn2(20)   eat.c gethungry(), reached from hack.c overexertion().
//   rn2(19)   attrib.c exercise(A_STR, TRUE) at uhitm.c:543.
//   rnd(20)   the to-hit roll at uhitm.c:780.
//   rn2(19)   attrib.c exercise(A_DEX, TRUE) at uhitm.c:783, which only a
//             landed blow reaches.
//   rnd(N)    the damage die. weapon.c dmgval() rolls oc_wsdam for a wielded
//             weapon against a small target; uhitm.c hmon_hitmon_barehands()
//             rolls rnd(2) or rnd(4) for a fist.
//   rnd(100)  uhitm.c hmon_hitmon_stagger():1571, bare-handed only, and only
//             when the blow did more than one point.
//   rn2(3)    uhitm.c mhitm_knockback():5256, wielded only, and again only
//             above one point of damage.
//   rn2(6)    uhitm.c mhitm_knockback():5269, which rejects five hits in six.
//   rn2(25)   uhitm.c known_hitum():624, the morale check on a survivor.
//   rn2(3)    uhitm.c:6013, the guard on passive()'s second switch.
//
// The stagger and knockback arms are exclusive: hmon_hitmon():1826-1831 sends a
// hero with nothing in hand to the first and a hero holding a weapon to the
// second, and both need `dmg > 1`. Every one of those four combinations appears
// below.
//
// The target has to survive and then sit out the turn. Surviving is what makes
// this matrix different from the kill the three development sessions record:
// hmon_hitmon_msg_hit():1641-1645 prints nothing when the blow was fatal, so
// "You hit the lichen." exists only here. Sitting out matters for the same
// reason it did for the miss matrix: js/unported_monster_actions.js refuses a
// monster's attack on the hero, and a wounded target is alive and adjacent.
//
// Seeds were found by a port-side scan, not by copying any recorded session.
// The scan replayed each seed with no keys, kept the ones whose starting room
// put a hostile on one of the hero's eight neighbouring squares, pressed that
// direction and kept the seeds whose segment ran to the end with the target
// alive and below its full hit points. Its domain and yield:
//
//   Healer/female/20260214031500, seeds 4400000-4400599: 50 seeds put a
//     hostile next to the hero, of which 18 were wounded and survived.
//   Valkyrie/female/20260214031500, seeds 7710000-7715999: 510 adjacent, 3
//     wounded survivors -- a +1 spear kills nearly everything it lands on.
//   Tourist/male/20260214031500, seeds 6600000-6600599: 52 adjacent, 19
//     wounded survivors.
//   Archeologist/male/20260214031500, seeds 5500000-5500599: 55 adjacent, 1
//     wounded survivor.
//   The same three roles with two presses, over the Healer range: 2 seeds.
//
// Barbarian (seeds 3300000-3305999) and Caveman (2200000-2204999) were scanned
// and yielded nothing: a two-handed sword or a club with a Strength bonus of 3
// kills every hostile that generates beside the hero on the first level, so no
// role that can do more than four points of damage leaves a survivor. That is
// why every message below ends in "." -- zap.c exclam() returns "!" only above
// four points -- and why scripts/uhitm-hmon.test.mjs pins that arm directly
// instead.

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

function healer(options = 'pettype:none,!acoustics,time') {
    return nethackrc({ role: 'Healer', gender: 'female', options });
}

function tourist(options = 'pettype:none,!acoustics,time') {
    return nethackrc({ role: 'Tourist', gender: 'male', options });
}

function archeologist(options = 'pettype:none,!acoustics,time') {
    return nethackrc({ role: 'Archeologist', gender: 'male', options });
}

// The wielded-weapon half. A Healer's scalpel is a WEAPON_CLASS knife of
// oc_wsdam 3 with no enchantment, and a starting Healer has neither a Strength
// damage bonus nor a knife skill above Basic, so hmon_hitmon_weapon_melee()
// plus hmon_hitmon_dmg_recalc() produce exactly rnd(3) points. That is the
// narrowest damage any wielded weapon in the game does, which is what leaves a
// first-level hostile alive to be hit again.
export function loadWieldedMeleeHitRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: a lichen to the east, one key, `verbose` left on,
            // so hmon_hitmon_msg_hit() takes its mon_nam() arm at uhitm.c:1650
            // and names the target. Two points of damage, so uhitm.c:1829 sets
            // maybe_knockback and mhitm_knockback() draws its pair.
            {
                seed: 4400255,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'l',
            },
            // The same seed and key with `verbose` off, which is uhitm.c:1648's
            // "You hit it." The damage is unchanged, so the two segments differ
            // in one screen and no random-number call.
            {
                seed: 4400255,
                datetime: MELEE_DATETIME,
                nethackrc: healer('pettype:none,!acoustics,time,!verbose'),
                moves: 'l',
            },
            // One point of damage instead of two. uhitm.c:1829's `hmd.dmg > 1`
            // fails, so maybe_knockback stays FALSE and the rn2(3) and rn2(6)
            // above are absent from this segment's slice.
            {
                seed: 4400119,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'k',
            },
            // A grid bug, which is MZ_TINY where every other target here is
            // MZ_SMALL. It is the one species whose size clears
            // mhitm_knockback():5325, so the rn2(6) above it is all that stops
            // the knockback.
            {
                seed: 4400022,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'n',
            },
            {
                seed: 4400042,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'u',
            },
            // A newt rather than a lichen or a rat: armor class 8 against the
            // lichen's 9, so find_roll_to_hit() is fed a different number.
            {
                seed: 4400399,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'h',
            },
            // Two swings at the same target in one segment, which is what shows
            // the per-attempt draws repeating rather than being spent once for
            // the turn. Both open with a hit; the second key misses.
            {
                seed: 4400364,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'kk',
            },
            {
                seed: 4400470,
                datetime: MELEE_DATETIME,
                nethackrc: healer(),
                moves: 'uu',
            },
            // An Archeologist's bullwhip is the P_WHIP arm of
            // hmon_hitmon_msg_hit():1652-1653, which prints "lash" rather than
            // "hit". Its oc_wsdam is 2 and it starts at +2, so the blow does
            // three or four points and the knockback pair is drawn.
            {
                seed: 5500071,
                datetime: MELEE_DATETIME,
                nethackrc: archeologist(),
                moves: 'h',
            },
            // A Valkyrie's +1 spear, which is oc_wsdam 6 rather than the
            // scalpel's 3 and P_SPEAR rather than P_KNIFE, so dmgval() rolls a
            // different die and hmon_hitmon_weapon_melee()'s Healer branch at
            // uhitm.c:949-952 is skipped. Only three seeds in six thousand
            // leave a Valkyrie's target alive; this is one of them.
            {
                seed: 7712202,
                datetime: MELEE_DATETIME,
                nethackrc: nethackrc({
                    role: 'Valkyrie',
                    gender: 'female',
                    options: 'pettype:none,!acoustics,time',
                }),
                moves: 'h',
            },
        ],
    }, 'wielded melee hit recipe');
}

// The bare-handed half. A Tourist wields nothing and wears no body armor or
// shield, so hmon_hitmon():1786 sets hmd.unarmed and uhitm.c:1827 sends the
// blow to hmon_hitmon_stagger() rather than to the knockback. martial_bonus()
// is false for the role, so hmon_hitmon_barehands() rolls rnd(2), and
// P_BARE_HANDED_COMBAT starts Unskilled, so weapon_dam_bonus() adds nothing.
export function loadBarehandedMeleeHitRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Two points of damage: uhitm.c:1827's `hmd.dmg > 1` holds and
            // hmon_hitmon_stagger() draws its rnd(100).
            {
                seed: 6600223,
                datetime: MELEE_DATETIME,
                nethackrc: tourist(),
                moves: 'j',
            },
            // One point, so the rnd(100) is absent. This pair is the
            // bare-handed twin of the two Healer rows above it.
            {
                seed: 6600204,
                datetime: MELEE_DATETIME,
                nethackrc: tourist(),
                moves: 'b',
            },
            {
                seed: 6600017,
                datetime: MELEE_DATETIME,
                nethackrc: tourist(),
                moves: 'h',
            },
            {
                seed: 6600094,
                datetime: MELEE_DATETIME,
                nethackrc: tourist(),
                moves: 'b',
            },
            // Bare-handed with `verbose` off, so the "You hit it." arm is
            // covered on this side too.
            {
                seed: 6600223,
                datetime: MELEE_DATETIME,
                nethackrc: tourist('pettype:none,!acoustics,time,!verbose'),
                moves: 'j',
            },
        ],
    }, 'bare-handed melee hit recipe');
}

export async function runHostileMeleeHitMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wielded melee hit',
            recipe: loadWieldedMeleeHitRecipe(),
        }, {
            label: 'bare-handed melee hit',
            recipe: loadBarehandedMeleeHitRecipe(),
        }],
        summaryLabel: 'HOSTILE MELEE HIT',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runHostileMeleeHitMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `hostile melee hit: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
