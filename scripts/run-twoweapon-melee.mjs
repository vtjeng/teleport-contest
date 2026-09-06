#!/usr/bin/env node

// Run the checked-in matrix for a hero who is fighting with two weapons and
// swings both of them at one target, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output in
// an isolated temporary workspace.
//
// What the matrix pins is uhitm.c hitum()'s second attack (791-812) and the
// damage arms u.twoweap diverts, entered from do_attack() as the first attack
// is. The second swing is not a repeat of the first:
//
//   uhitm.c:801   find_roll_to_hit() is handed uswapwep, so weapon.c
//                 weapon_hit_bonus():1553 reads P_TWO_WEAPON_COMBAT rather
//                 than the weapon's own skill. It starts Unskilled for every
//                 role -- no object's weapon_type() is P_TWO_WEAPON_COMBAT, so
//                 weapon.c skill_init() only lifts it off P_ISRESTRICTED -- so
//                 both swings take -9 instead of the wielded weapon's bonus.
//   uhitm.c:783   has no counterpart at 801-807: only the first swing of a turn
//                 exercises Dexterity, so a landed second blow spends no
//                 rn2(19).
//   uhitm.c:1465  hmd->twohits sends hmon_hitmon_dmg_recalc() down the 3/4
//                 strength branch instead of 1467's bimanual 3/2.
//   uhitm.c:1489  weapon_dam_bonus() answers -3 for the same Unskilled reading.
//   uhitm.c:712   `u.twoweap` in hmon_hitmon_weapon_melee()'s special-attack
//                 gate suppresses the Rogue's backstab and the dieroll == 2
//                 shatter for both swings.
//   uhitm.c:1498  use_skill() trains P_TWO_WEAPON_COMBAT, not the weapon's
//                 skill, because weapon.c uwep_skill_type():1534 branches on
//                 u.twoweap.
//   uhitm.c:1830  `!u.twoweap` keeps maybe_knockback FALSE, so mhitm_knockback()
//                 draws nothing on either swing.
//
// Three of C's six gate terms at 797-799 are constantly false in this port and
// are not restated in js/uhitm.js; see the comment on hitum() for the greps
// that show so. The two live ones each have rows here: `!malive`, the first
// blow killing the target, and the second swing landing at all.
//
// Seeds came from a port-side scan, not from any recorded session. The scan
// replayed each seed with no keys, kept the ones whose starting room put a
// hostile on one of the hero's eight neighbouring squares, pressed #twoweapon
// and then that direction, and kept the seeds whose segment ran to the end with
// two-weapon combat on. Its domain and yield, all at the datetime below:
//
//   Samurai/male/lawful,      seeds 7710000-7710299: 24 adjacent, 20 clean.
//   Rogue/male/chaotic,       seeds 5500000-5500299: 26 adjacent, 26 clean.
//   Archeologist/male/lawful, seeds 5600000-5600299: 26 adjacent, 22 clean.
//
// The three roles are the whole of what a fresh start can offer: wield.c
// can_twoweapon() admits only a role whose u_init.c loadout fills both hands
// with objects TWOWEAPOK() accepts and whose monst.c role monster has more than
// one AT_WEAP attack, and scripts/run-twoweapon-command.mjs records the six
// roles that fail it and which arm each one reaches.

import { A_DEX } from '../js/const.js';
import { acurr } from '../js/attrib.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const TWOWEAPON_MELEE_DATETIME = '20260214031500';

// cmd.c extcmdlist[] binds '#' to doextcmd(); "twoweapon" names row 0x58.
const TWOWEAPON = '#twoweapon\n';

function nethackrc({ role, gender, align }) {
    return [
        `OPTIONS=name:Dual,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        'OPTIONS=pettype:none,!acoustics,time',
        '',
    ].join('\n');
}

// u_init.c:143-144 wields a katana over a short sword, u_init.c:134-135 a short
// sword over a stack of daggers, and u_init.c:44,48 a bullwhip over a pick-axe.
// The three pairs cover a plain weapon in both hands, a stack in the off hand,
// and a weapon-tool in both.
const SAMURAI = nethackrc({ role: 'Samurai', gender: 'male', align: 'lawful' });
const ROGUE = nethackrc({ role: 'Rogue', gender: 'male', align: 'chaotic' });
const ARCHEOLOGIST = nethackrc({
    role: 'Archeologist', gender: 'male', align: 'lawful',
});

function segment(seed, rc, direction, { twoweap = true } = {}) {
    return {
        seed,
        datetime: TWOWEAPON_MELEE_DATETIME,
        nethackrc: rc,
        // wield.c:848-853 toggles two-weapon combat back off with no draw and
        // no time, so a doubled command reaches the direction key at the same
        // place in the random-number stream as a single one.
        moves: `${TWOWEAPON.repeat(twoweap ? 1 : 2)}${direction}`,
    };
}

// The Samurai half: a katana of oc_wsdam 10 in hand and a short sword of
// oc_wsdam 6 in the off hand, so the two swings roll different dice and the
// order of rnd(10) and rnd(6) says which weapon landed.
export function loadTwoWeaponMeleeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Both swings miss. The plainest evidence that the second swing
            // happens at all: one keystroke, two rnd(20) rolls.
            segment(7710009, SAMURAI, 'k'),
            // Miss then hit. The short sword's rnd(6) is the only damage die,
            // so the blow that landed was the off-hand one.
            segment(7710083, SAMURAI, 'l'),
            // Hit then miss, the mirror image: rnd(10) then a bare rnd(20).
            // uhitm.c:809 skips the second passive() when the second swing
            // missed, so no rn2(3) follows that roll.
            segment(7710111, SAMURAI, 'b'),
            // Miss then kill. This is the shape seed0107 records, against a
            // G_NOCORPSE species so that corpse_chance() is never asked.
            segment(7710045, SAMURAI, 'l'),
            // Miss then kill with corpse_chance() consulted and declining.
            segment(7710160, SAMURAI, 'l'),
            // The first swing kills, so uhitm.c:799's `!malive` closes the
            // gate: one rnd(20) for the whole turn.
            segment(7710085, SAMURAI, 'b'),
            // The same gate with a corpse left behind, which puts mkobj() and
            // the corpse timeout between the kill and the end of the turn.
            segment(7710272, SAMURAI, 'h'),
        ],
    }, 'two-weapon melee recipe');
}

// The other two loadouts. A Rogue's off hand holds a stack of daggers, so the
// object known_hitum() strikes with has quan > 1; an Archeologist holds a
// weapon-tool in each hand, which is how hmon_hitmon_do_hit():1391 reaches
// hmon_hitmon_weapon() through is_weptool() rather than WEAPON_CLASS.
export function loadTwoWeaponSecondaryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Both swings land and the target survives both, the only
            // combination the Samurai rows above do not reach.
            segment(5500201, ROGUE, 'h'),
            // Hit then kill: the off-hand dagger finishes what the short sword
            // started, so mon->mhp crosses zero on the second swing.
            segment(5500107, ROGUE, 'j'),
            // Miss then hit, with the dagger stack's rnd(4).
            segment(5500280, ROGUE, 'h'),
            // A bullwhip lands: hmon_hitmon_msg_hit():1647 prints "lash"
            // rather than "hit" for a P_WHIP weapon. The pick-axe then kills.
            segment(5600049, ARCHEOLOGIST, 'y'),
            // The same "lash" arm with the pick-axe missing behind it.
            segment(5600182, ARCHEOLOGIST, 'u'),
        ],
    }, 'two-weapon secondary weapon recipe');
}

// The control half. Each row repeats a row above with the command toggled back
// off, so the hero reaches the direction key holding the same weapons at the
// same place in the random-number stream and swings once instead of twice.
// Anything these rows and their partners share is not the second attack.
export function loadSingleSwingControlRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The partner of the both-miss row: the same rnd(20) miss, and
            // then the turn ends.
            segment(7710009, SAMURAI, 'k', { twoweap: false }),
            // The partner of the miss-then-hit row, and the sharpest of the
            // four: rnd(20)=6 misses with the two-weapon penalty applied and
            // kills the newt without it, off one roll of the same die.
            segment(7710083, SAMURAI, 'l', { twoweap: false }),
            // The partner of the hit-then-miss row: the katana lands
            // identically, and nothing follows it.
            segment(7710111, SAMURAI, 'b', { twoweap: false }),
            // The partner of the both-hit row, under the Rogue loadout.
            segment(5500201, ROGUE, 'h', { twoweap: false }),
        ],
    }, 'single swing control recipe');
}

// Each segment states which side of hitum():797 it is here for. Checking it on
// the port before the differential runs means a segment that stopped selecting
// its arm fails as a setup error rather than as a screen mismatch.
async function verifyTwoWeaponMeleeSegment(recipeSegment) {
    const expectTwoWeapon = !recipeSegment.moves.startsWith(
        `${TWOWEAPON}${TWOWEAPON}`,
    );

    // Stop on the last key before the direction, so the hands and the toggle
    // are read as the attack itself will find them.
    await runSegment({
        ...recipeSegment,
        moves: recipeSegment.moves.slice(0, -1),
    });
    if (game.u.twoweap !== expectTwoWeapon) {
        throw new Error(
            `seed ${recipeSegment.seed}: u.twoweap is ${game.u.twoweap}`,
        );
    }
    // uhitm.c:762 captures uswapwep as `secondwep` only while u.twoweap is
    // set, and 776 reads u.twoweap for gt.twohits, so both hands have to be
    // full for either row to mean what it says.
    if (!game.uwep || !game.uswapwep) {
        throw new Error(`seed ${recipeSegment.seed}: a hand is empty`);
    }
    if (game.uarms) {
        throw new Error(`seed ${recipeSegment.seed}: wearing a shield`);
    }
    // wield.c:861 spends a move when rnd(20) beats Dexterity, which shifts
    // every later draw. Recording it keeps the rows honest about why two
    // segments at one seed can diverge before the attack.
    if (!Number.isInteger(acurr(game, A_DEX))) {
        throw new Error(`seed ${recipeSegment.seed}: no Dexterity`);
    }
}

export async function runTwoWeaponMeleeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'two-weapon second swing',
            recipe: loadTwoWeaponMeleeRecipe(),
        }, {
            label: 'two-weapon secondary weapons',
            recipe: loadTwoWeaponSecondaryRecipe(),
        }, {
            label: 'single swing control',
            recipe: loadSingleSwingControlRecipe(),
        }],
        summaryLabel: 'TWOWEAPON MELEE',
        verifySegment: verifyTwoWeaponMeleeSegment,
    });
}

runMatrixCli(import.meta.url, runTwoWeaponMeleeMatrix, 'twoweapon melee');
