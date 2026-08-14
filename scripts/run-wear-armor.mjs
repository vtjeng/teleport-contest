#!/usr/bin/env node

// Run the checked-in matrix for the 'W' command through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The command is do_wear.c dowear(), which reaches invent.c getobj() through
// wear_ok() and equip_ok(), then accessory_or_armor_on(), canwearobj() and
// worn.c setworn(). From there the command forks on the piece's oc_delay:
// oc_delay 0 runs hack.c unmul() and the ga.afternmv callback on the spot and
// then on_msg(), while any other value spends the delay under nomul() and
// reaches the same callback several turns later, through allmain.c
// moveloop_core(), with "You finish your dressing maneuver." in place of
// on_msg().
//
// The shield and the suit are the two slots this port puts armor into, and
// their callbacks are Shield_on() and Armor_on(). Every role that starts with
// either starts with it already worn (u_init.c ini_inv_use_obj()), so the
// segments below either take the piece off with the already-ported 'T' first
// or wish for a second one. Wishing is also the only way this port can hold
// armor it has never worn: mksobj() leaves obj->known 0 for armor where
// u_init.c sets it to 1, so a wished piece hides its enchantment until its
// callback reveals it.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'W' to dowear(); extcmdlist[]:1932 names the same
// handler 'wear', which the '#' prompt reaches. decl.c quitchars[] is
// " \r\n\033", and the recorder's terminal sets ICRNL, so Escape and space
// are the two cancels a recording can send to the object prompt.
export const WEAR_KEY = 'W';
export const WEAR_BY_NAME = '#wear\n';
export const TAKEOFF_KEY = 'T';
export const WISH_KEY = '\x17'; /* C('w'), the "wizwish" row's key */
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const INVENTORY_KEY = 'i';
export const WAIT = '.';

// The turn counter and the experience field are shown throughout: 'W' spends
// exactly one turn on success and none on any refusal, and the AC field moves
// only when the piece reaches its slot, so the status line is a second witness
// beside the message.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';
// A pet, so the turn the command spends is one something else moves in.
const PET = 'pettype:dog,!acoustics,!autopickup,time,showexp';
// Wizard mode, for the segments that wish for a second piece of armor.
const DEBUG = `${PLAIN},playmode:debug`;

function nethackrc({ role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:Wear,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens and closes with a wait, so a refusal that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(seed, moves, character, options = PLAIN) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ ...character, options }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// u_init.c's starting gear, by role. The letter beside each piece is the
// invlet u_init() assigns it, which is what the prompt advertises and what the
// segments below type.
//
// Valkyrie: a +1 spear (wielded), b +0 dagger, c +3 small shield (worn),
// d food ration. The spear is not bimanual and u.twoweap is FALSE, so
// canwearobj() reaches `*mask = W_ARMS` rather than either shield refusal.
const VALKYRIE = { role: 'Valkyrie' };
// Barbarian: a two-handed weapon (wielded), b a second weapon, c ring mail
// (worn), d food ration, and an oil lamp when `!rn2(6)` at u_init.c:671 says
// so. u_init.c:666 picks the weapon pair with rn2(100), so which two-handed
// weapon this role wields -- and therefore which word canwearobj() chooses --
// is a property of the seed. The two seeds below are the two answers.
const BARBARIAN = { role: 'Barbarian', gender: 'male', align: 'neutral' };
// The two roles that start in a suit whose oc_delay is not 0, which is what
// sends 'W' down C's nomul() arm. objects.h gives splint mail 5 and leather
// armor 3, the widest spread u_init.c offers. Both roles carry the suit at
// `e`, and it is the one armor piece they wear, so the 'T' that clears the
// slot needs no letter of its own.
const SAMURAI = { role: 'Samurai', gender: 'male', align: 'lawful' };
const CAVEMAN = { role: 'Caveman' };
// The one role u_init.c starts with money -- u.umoney0 = rnd(1000) at
// u_init.c:756 -- which is what getobj()'s gold arm needs. Her Hawaiian shirt
// at `h` is her only worn piece, so the 'T' before the 'W' needs no letter and
// leaves one letter for the prompt to suggest.
const TOURIST = { role: 'Tourist', gender: 'male' };

// Take the starting shield off, then put it back on. `c` is the shield's
// invlet and the only letter wear_ok() suggests once it is off.
const OFF_THEN_ON = `${TAKEOFF_KEY}${WEAR_KEY}c`;
// The same round trip for the two suits above, at their own invlet. Each half
// spends the suit's oc_delay in turns during which moveloop_core() reads no
// key, so the 'W' is not seen until the 'T' has finished.
const SUIT_OFF_THEN_ON = `${TAKEOFF_KEY}${WEAR_KEY}e`;

export function loadWearRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The whole spine: getobj() advertises the one letter wear_ok()
            // suggests, canwearobj() answers W_ARMS, setworn() moves AC from
            // 10 back to 6, unmul("") runs Shield_on() and on_msg() prints
            // "You are now wearing a small shield." -- xname(), so no
            // enchantment where off_msg()'s doname() shows one. The closing
            // wait is what shows the command spent one turn and not two.
            // Seed 7720100 rather than 7720101: at 7720101 a monster wears an
            // engraving away on the turn the 'W' spends, which stops the
            // segment on a branch of the turn loop this goal does not own.
            segment(7720100, OFF_THEN_ON, VALKYRIE),
            // The same spine with a pet on the level, so the turn 'W' spends
            // is one the dog moves in.
            segment(7720102, OFF_THEN_ON, VALKYRIE, PET),
            // The two cancels a recording can send to the prompt. Both leave
            // the shield off, the clock where it was and no message behind.
            segment(7720103, `${TAKEOFF_KEY}${WEAR_KEY}${ESCAPE_KEY}`,
                VALKYRIE),
            segment(7720104, `${TAKEOFF_KEY}${WEAR_KEY}${SPACE_KEY}`,
                VALKYRIE),
            // The shield still worn: equip_ok() answers
            // GETOBJ_EXCLUDE_INACCESS for it and GETOBJ_EXCLUDE for the rest
            // of the pack, so getobj() reports "You don't have anything else
            // to wear." without prompting.
            segment(7720105, WEAR_KEY, VALKYRIE),
            // dowear() reached by name at the '#' prompt.
            segment(7720106, `${TAKEOFF_KEY}${WEAR_BY_NAME}c`, VALKYRIE),
            // cmd.c:1932's wear row carries no CMD_M_PREFIX, so rhack()
            // reports the prefix rather than running the command.
            segment(7720107, `m${WEAR_KEY}`, VALKYRIE),
            // do_wear.c:2396-2399, the delayed arm, at both ends of the
            // spread u_init.c offers. The AC field moves on the turn the 'W'
            // is typed, because setworn() runs before nomul(); the pet then
            // moves through three or five turns the hero cannot act in, and
            // the last of them prints "You finish your dressing maneuver."
            // and nothing else. C prints no on_msg() on this arm, so the
            // message that announces a small shield has no counterpart here.
            //
            // The Caveman opens with two extra waits, and they are load
            // bearing. Nothing overwrites the answered "What do you want to
            // wear?" between the prompt and that closing message, so any
            // animation frame runmode_delay_output() flushes inside the
            // countdown lands on a top line the QUALITY.json deferral
            // getobj-prompt-leaves-the-top-line-in-c-only already measures:
            // C still shows the query where this port has cleared it. Under
            // the default RUN_LEAP that frame needs svm.moves % 7 == 0, so
            // the waits move the three-turn window off turn 7 -- from 6-8 to
            // 8-10 -- and the Samurai's five-turn window at 8-12 clears turn
            // 7 on its own. Both roles still take a frame during the 'T'
            // half, which needs no prompt and so shows the same blank line in
            // both programs.
            segment(7720131, `${WAIT}${WAIT}${SUIT_OFF_THEN_ON}`, CAVEMAN,
                PET),
            segment(7720132, SUIT_OFF_THEN_ON, SAMURAI, PET),
            // The two letters getobj() itself turns away. `d` is the
            // Valkyrie's food ration, which wear_ok() excludes but the prompt
            // still accepts by hand, so invent.c silly_thing() answers; the
            // Tourist's `$` reaches the gold arm one loop earlier and answers
            // "You cannot wear gold." Both end the command without a turn.
            segment(7720108, `${TAKEOFF_KEY}${WEAR_KEY}d`, VALKYRIE),
            segment(7720109, `${TAKEOFF_KEY}${WEAR_KEY}$`, TOURIST),
        ],
    }, 'wear armor recipe');
}

// on_msg()'s flags.verbose arm has no segment here, and cannot have one until
// the QUALITY.json deferral getobj-prompt-leaves-the-top-line-in-c-only is
// closed. With verbose on, on_msg() overwrites the "What do you want to wear?"
// prompt, which hides the fact that this port clears the prompt where C leaves
// it standing; with verbose off, nothing overwrites it and the divergence is
// the whole of what the screen shows. scripts/wear-armor.test.mjs calls
// on_msg() directly for that arm instead, and the deferral carries the case.

// Wish for `what`, then play `moves`. Wishing costs no turn, so the clock
// still shows what the opening wait left.
function wishSegment(seed, what, moves, character = VALKYRIE) {
    return segment(seed, `${WISH_KEY}${what}\n${moves}`, character, DEBUG);
}

export function loadWearWishRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The Shield_on() witness, and the only segment in the matrix
            // where the callback does anything. The 'T' clears the slot, the
            // wish adds a shield at `e` with obj->known 0, and the two
            // inventory windows either side of the 'W' name it "a small
            // shield" and then "a +2 small shield (being worn)".
            segment(7720121,
                `${TAKEOFF_KEY}${WISH_KEY}+2 small shield\n`
                + `${INVENTORY_KEY}${ESCAPE_KEY}${WEAR_KEY}e`
                + `${INVENTORY_KEY}${ESCAPE_KEY}`,
                VALKYRIE, DEBUG),
            // canwearobj()'s filled-slot arm: the starting shield is still on,
            // so the wished one draws already_wearing(an(c_shield)), "You are
            // already wearing a shield.", and no turn is spent. The prompt
            // reads "[*]" because canwearobj() downplays the only candidate.
            wishSegment(7720122, '+2 small shield', `${WEAR_KEY}e`),
            // accessory_or_armor_on()'s own already_wearing(c_that_) at
            // do_wear.c:2213, the one that ends in '!' rather than '.'. The
            // worn shield is excluded from the prompt but getobj() still
            // hands it back when its letter is typed by hand.
            wishSegment(7720125, '+2 small shield', `${WEAR_KEY}c`),
            // canwearobj()'s two-handed-weapon arm, both of the words it can
            // choose. At seed 7720123 u_init.c gives the Barbarian a
            // two-handed sword and no lamp, so is_sword() answers TRUE and
            // the wished shield lands at `e`; at seed 7720124 it gives a
            // battle-axe and a lamp, so the message names an axe and the
            // shield lands at `f`.
            wishSegment(7720123, '+0 small shield', `${WEAR_KEY}e`, BARBARIAN),
            wishSegment(7720124, '+0 small shield', `${WEAR_KEY}f`, BARBARIAN),
            // The Armor_on() witness, on each arm of the fork. A Valkyrie
            // starts with the suit slot empty, so no 'T' is needed and the
            // wished suit is the only letter wear_ok() suggests. objects.h
            // gives the dwarvish mithril-coat an oc_delay of 1, the shortest
            // non-zero one, so its countdown runs out on the very next turn;
            // the leather jacket is the one suit with oc_delay 0 and so the
            // one that takes unmul("") and on_msg() immediately. The
            // inventory windows either side of the 'W' show obj->known
            // turning over: "a dwarvish mithril-coat" becomes "a +2 dwarvish
            // mithril-coat (being worn)".
            segment(7720133,
                `${WISH_KEY}+2 dwarvish mithril-coat\n`
                + `${INVENTORY_KEY}${ESCAPE_KEY}${WEAR_KEY}e`
                + `${INVENTORY_KEY}${ESCAPE_KEY}`,
                VALKYRIE, DEBUG),
            segment(7720134,
                `${WISH_KEY}+2 leather jacket\n`
                + `${INVENTORY_KEY}${ESCAPE_KEY}${WEAR_KEY}e`
                + `${INVENTORY_KEY}${ESCAPE_KEY}`,
                VALKYRIE, DEBUG),
        ],
    }, 'wear armor wish recipe');
}

export async function runWearMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'wear armor',
            recipe: loadWearRecipe(),
        }],
        summaryLabel: 'WEAR ARMOR',
        chunkLimit: 4,
    });
    if (!ordinary.passed) return ordinary;
    // Every wish segment plays in wizard mode, and the recorder leaves a save
    // behind for a debug game it terminates, so each one records alone.
    return runFreshMatrix({
        entries: [{
            label: 'wear armor (wished pieces)',
            recipe: loadWearWishRecipe(),
        }],
        summaryLabel: 'WEAR ARMOR (WISHED PIECES)',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWearMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `wear armor: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
