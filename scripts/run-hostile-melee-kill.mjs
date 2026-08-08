#!/usr/bin/env node

// Run the checked-in matrix for a hero whose melee blow kills the monster it
// lands on, through fresh C recordings. Every segment contains replay inputs
// only; runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// What the matrix pins is mon.c killed() (3469-3473) and xkilled() (3476-3740)
// with everything they reach: mondead() (3080-3177), m_detach() (2733-2803),
// mon_leaving_level() (2695-2730), lifesaved_monster() (2838-2884),
// corpse_chance() (3180-3249), make_corpse() (563-941), exper.c experience()
// (84-166) and attrib.c adjalign() (1297-1316).
//
// An ordinary kill draws exactly twice, and both draws sit between the kill
// message and experience(), which is why the arm cannot be ported in halves:
//
//   rn2(6)    xkilled():3587, the "illogical but traditional" treasure drop.
//             A zero opens the drop; five kills in six spend the call and go
//             no further.
//   rn2(tmp)  corpse_chance():3248, where tmp is
//             2 + ((geno & G_FREQ) < 2) + verysmall(mdat). The species split
//             is what the rows below exercise: a sewer rat is G_FREQ 1 and
//             MZ_TINY, so 4; a jackal is G_FREQ 3 and MZ_SMALL, so 2; a newt
//             is G_FREQ 5 and MZ_TINY, so 3; and a goblin is G_FREQ 2, which
//             fails `< 2`, so 2 by a different route than the jackal's.
//
// The drop adds three or more of its own: mkobj()'s class and type rolls, then
// either zap.c obj_resists()'s rn2(100) inside invent.c delobj() when the
// object is deleted, or nothing when it lands on the floor.
//
// mondead() itself draws nothing on this path. Its rn2(10) at 3104 belongs to
// a steam vortex and its rnd(5) at 3149 to a Keystone Kop, and both stop.
//
// Seeds came from a port-side scan, not from any recorded session. The scan
// replayed each seed with no keys, kept the ones whose starting room put a
// hostile on one of the hero's eight neighbouring squares, pressed that
// direction, and kept the seeds whose segment ran to the end with the hero's
// experience above zero. Its domain and yield, all at the datetime below:
//
//   Valkyrie/female/neutral,  seeds 7710000-7710599: 49 adjacent, 31 killed.
//   Rogue/male/chaotic,       seeds 5500000-5500599: 56 adjacent, 21 killed.
//   Monk/female/neutral,      seeds 9900000-9900599: 59 adjacent, 38 killed.
//   Tourist/male/neutral,     seeds 6600000-6600599: 52 adjacent,  5 killed.
//
// Eleven of those adjacent seeds killed a monster that died still wearing or
// wielding something, and stopped at steal.c mdrop_obj()'s equipped-object
// refusal in js/steal.js. That arm is recorded as the deferral
// dead-monster-drops-equipped-gear and is deliberately absent below.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const KILL_DATETIME = '20260214031500';

function nethackrc({ role, gender, align, options }) {
    return [
        `OPTIONS=name:Lich,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

const DEFAULT_OPTIONS = 'pettype:none,!acoustics,time';

function valkyrie(options = DEFAULT_OPTIONS) {
    return nethackrc({
        role: 'Valkyrie', gender: 'female', align: 'neutral', options,
    });
}

function rogue(options = DEFAULT_OPTIONS) {
    return nethackrc({
        role: 'Rogue', gender: 'male', align: 'chaotic', options,
    });
}

function monk(options = DEFAULT_OPTIONS) {
    return nethackrc({
        role: 'Monk', gender: 'female', align: 'neutral', options,
    });
}

function tourist(options = DEFAULT_OPTIONS) {
    return nethackrc({
        role: 'Tourist', gender: 'male', align: 'neutral', options,
    });
}

// The wielded half. A Valkyrie swings a +1 long sword and a Rogue a +0 short
// sword, so both reach hmon_hitmon_weapon_melee() rather than the bare-handed
// arm, and both kill a first-level hostile outright far more often than not.
export function loadWieldedMeleeKillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base row: a lichen, whose corpse_chance() divisor is 2
            // because G_FREQ 4 clears `< 2` and MZ_SMALL is not verysmall.
            // rn2(6)=1 declines the drop and rn2(2)=0 leaves the corpse.
            { seed: 7710044, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'l' },
            // A sewer rat, the only divisor-4 species here: G_FREQ 1 clears
            // `< 2` and MZ_TINY clears verysmall(). rn2(4)=1 leaves bare
            // floor, which is what seed0006's recorded rat does.
            { seed: 7710009, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'k' },
            // rn2(6)=0, so the drop fires and the object is large enough and
            // not food, reaching place_object() and stackobj() at 3624-3625.
            // rn2(4)=2 then declines the corpse, so the square holds the drop
            // alone.
            { seed: 7710085, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'b' },
            // rn2(6)=0 again, but this drop is deleted rather than placed:
            // invent.c delobj() spends zap.c obj_resists()'s rn2(100) and the
            // square ends up empty, because rn2(2)=1 declines the corpse too.
            { seed: 7710581, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'j' },
            // A grid bug with rn2(6)=0. The second conjunct at 3587,
            // `!(svm.mvitals[mndx].mvflags & G_NOCORPSE)`, is what stops the
            // drop here, and make_corpse() returns 0 at 849 for the same
            // flag even though corpse_chance() said yes.
            { seed: 7710111, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'b' },
            // A goblin carrying two daggers it is not wielding, so
            // m_detach():2779 relobj() drops them, and rn2(6)=0 adds a third
            // object on top. rn2(2)=1 declines the corpse.
            { seed: 7710240, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'k' },
            // The goblin that leaves a corpse, which is seed0200's recorded
            // outcome: divisor 2 by way of G_FREQ 2 failing `< 2` rather than
            // the lichen's route. Its malign is 3, so adjalign() raises the
            // record where the neutral rows above leave it alone.
            { seed: 7710348, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'l' },
            // Both halves at once: rn2(6)=0 places a potion and rn2(3)=0
            // leaves a fox corpse under it, so stackobj() runs twice on the
            // same square.
            { seed: 7710572, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'b' },
            // A kobold, malign 2 against a neutral hero.
            { seed: 7710050, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'k' },
            // The same species with the corpse taken instead.
            { seed: 7710322, datetime: KILL_DATETIME,
                nethackrc: valkyrie(), moves: 'h' },
            // A chaotic hero, which changes what makemon.c set_malign() gave
            // the target and so what adjalign() adds: a kobold is maligntyp
            // -2 and co-aligned with this Rogue, so its malign is max(3,2)=3
            // rather than the 2 the Valkyrie row above collects.
            { seed: 5500122, datetime: KILL_DATETIME,
                nethackrc: rogue(), moves: 'n' },
            // A kobold zombie: mondata.h nonliving() is true, so xkilled():
            // 3507 prints "destroy" rather than "kill". rn2(3)=1 declines the
            // corpse, which keeps make_corpse()'s undead arm out of reach.
            { seed: 5500256, datetime: KILL_DATETIME,
                nethackrc: rogue(), moves: 'j' },
            // A newt whose drop lands, under a chaotic hero.
            { seed: 5500334, datetime: KILL_DATETIME,
                nethackrc: rogue(), moves: 'u' },
        ],
    }, 'wielded melee kill recipe');
}

// The bare-handed half. A Tourist and a Monk both strike with empty hands, so
// hmon_hitmon_barehands() rolls the damage and hmon_hitmon_stagger() spends an
// rnd(100) before the kill; nothing downstream of killed() differs, which is
// the point of running the same arms from the other side of uhitm.c:1826.
export function loadBarehandedMeleeKillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A Tourist against a lichen, the bare-handed twin of the wielded
            // base row: rn2(6) declines the drop and rn2(2)=0 leaves a corpse.
            { seed: 6600023, datetime: KILL_DATETIME,
                nethackrc: tourist(), moves: 'u' },
            // A Tourist against a goblin carrying a dagger, so relobj() drops
            // it and no corpse follows.
            { seed: 6600038, datetime: KILL_DATETIME,
                nethackrc: tourist(), moves: 'h' },
            // A Monk, whose martial-arts damage die is different again.
            // rn2(6)=0 opens the drop and delobj() removes what it made.
            { seed: 9900036, datetime: KILL_DATETIME,
                nethackrc: monk(), moves: 'l' },
            // A Monk whose drop lands on the floor.
            { seed: 9900233, datetime: KILL_DATETIME,
                nethackrc: monk(), moves: 'y' },
            // A Monk against a goblin that leaves a corpse.
            { seed: 9900243, datetime: KILL_DATETIME,
                nethackrc: monk(), moves: 'b' },
            // The same Monk kill with `verbose` off. killed()'s message has no
            // verbose gate, so this row and the one above it must differ in no
            // screen and no random-number call; a difference would mean the
            // kill text had picked up a setting C does not consult.
            { seed: 9900243, datetime: KILL_DATETIME,
                nethackrc: monk(`${DEFAULT_OPTIONS},!verbose`), moves: 'b' },
        ],
    }, 'bare-handed melee kill recipe');
}

export async function runHostileMeleeKillMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wielded melee kill',
            recipe: loadWieldedMeleeKillRecipe(),
        }, {
            label: 'bare-handed melee kill',
            recipe: loadBarehandedMeleeKillRecipe(),
        }],
        summaryLabel: 'HOSTILE MELEE KILL',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runHostileMeleeKillMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `hostile melee kill: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
