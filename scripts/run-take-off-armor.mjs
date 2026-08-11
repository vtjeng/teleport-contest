#!/usr/bin/env node

// Run the checked-in matrix for the 'T' command through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The command is do_wear.c dotakeoff(), which reaches count_worn_stuff(),
// invent.c getobj() through takeoff_ok() and equip_ok(),
// armor_or_accessory_off(), select_off(), cursed(), armoroff() and one of
// Armor_off(), Cloak_off(), Helmet_off(), Shield_off() and Shirt_off(). For a
// suit whose oc_delay is not 0 the last of those is reached several turns
// later, through hack.c nomul() and allmain.c moveloop_core() into unmul().
//
// Roles are chosen for the armor they start in, because u_init.c is the only
// way this port can put armor on a hero: 'W' is unported, and a wish delivers
// to the pack rather than to a slot. Between them the roles below cover all
// five ported slots, both arms of dotakeoff()'s prompt test, and the answers
// getobj() hands back that armor_or_accessory_off() then refuses.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'T' to dotakeoff(); extcmdlist[]:1886 names the same
// handler 'takeoff', which the '#' prompt reaches. decl.c quitchars[] is
// " \r\n\033", and the recorder's terminal sets ICRNL, so Escape and space
// are the two cancels a recording can send to the object prompt.
export const TAKEOFF_KEY = 'T';
export const TAKEOFF_BY_NAME = '#takeoff\n';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

const PLAIN = 'pettype:none,!acoustics,!autopickup';
// A pet and the two status fields a wrongly spent turn would move. The AC
// field moves on every successful removal, so the status line is a second
// witness that the item really left its slot.
const PET_AND_CLOCK = 'pettype:dog,!acoustics,!autopickup,time,showexp';
// off_msg() is the only line 'T' prints on success and flags.verbose gates it,
// so this variation is what distinguishes the message from the removal.
const TERSE = 'pettype:none,!acoustics,!autopickup,!verbose,time';

function nethackrc({ role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:TakeOff,role:${role},race:${race},gender:${gender},`
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

// u_init.c's starting armor, by role. The letter beside each piece is the
// invlet u_init() assigns it, which is what the prompt advertises and what
// the segments below type.
const WIZARD = { role: 'Wizard', gender: 'male' }; // b cloak of magic resist.
const TOURIST = { role: 'Tourist', gender: 'male' }; // Hawaiian shirt
const VALKYRIE = { role: 'Valkyrie' }; // b small shield
const ARCHEOLOGIST = { role: 'Archeologist', gender: 'male' }; // b jacket,
                                                              // c fedora
const MONK = { role: 'Monk', gender: 'male' }; // a gloves, b robe
const PRIEST = { role: 'Priest', align: 'chaotic' }; // b robe, c small shield
const KNIGHT = { role: 'Knight', gender: 'male', align: 'lawful' };
// Knight: c ring mail, d helmet, e small shield, f leather gloves
// The two roles below wear the delayed suits. objects.h gives every suit but
// the leather jacket a non-zero oc_delay, and armoroff() spends it as helpless
// turns before Armor_off() runs; the two here are the widest spread u_init.c
// offers, 5 turns against 3. They also split objnam.c suit_simple_name(): its
// " mail" test answers "mail" for splint mail and neither test matches
// "leather armor", so the Caveman's message ends "your suit."
const SAMURAI = { role: 'Samurai', gender: 'male', align: 'lawful' };
// Samurai: c splint mail, oc_delay 5
const CAVEMAN = { role: 'Caveman' }; // e leather armor, oc_delay 3

export function loadTakeOffRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // One worn piece, so count_worn_stuff() answers Narmorpieces == 1
            // and dotakeoff() skips getobj() entirely. One segment per slot
            // whose <X>_off() is ported and whose only starting item carries
            // oc_delay 0: cloak, shirt and shield.
            segment(7710101, TAKEOFF_KEY, WIZARD),
            segment(7710112, TAKEOFF_KEY, TOURIST),
            segment(7710103, TAKEOFF_KEY, VALKYRIE),
            // The same arm for a suit whose oc_delay is not 0, so armoroff()
            // takes its delayed branch: nomul(-5) buys five turns in which
            // moveloop_core() reads no key, and unmul() prints the message and
            // runs Armor_off() on the last of them. The wait before the 'T'
            // puts the fifth turn on a multiple of 7, so runmode_delay_output()
            // also draws one animation frame in the middle of the removal.
            segment(7710113, TAKEOFF_KEY, SAMURAI),
            // Two worn pieces, so the prompt arm fires; the fedora leaves
            // Narmorpieces at 1, so the second 'T' takes the no-prompt arm.
            // Helmet_off() is the one <X>_off() with a side effect this goal
            // ports: an Archeologist's Luck drops by one.
            segment(7710104, `${TAKEOFF_KEY}c${WAIT}${TAKEOFF_KEY}`,
                ARCHEOLOGIST),
            // A second cloak type through the prompt arm, and a +1 item, so
            // off_msg()'s doname() is not always formatting a +0.
            segment(7710105, `${TAKEOFF_KEY}b`, MONK),
            // getobj()'s retry loop: a letter no slot holds, the --More--
            // that follows it, the re-prompt, and then the robe.
            segment(7710106,
                `${TAKEOFF_KEY}z${SPACE_KEY}b`, PRIEST),
            // Four worn pieces, the largest starting set. Taking the shield
            // off leaves three, so the second prompt advertises a shorter
            // set; Escape cancels it.
            segment(7710107,
                `${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}${ESCAPE_KEY}`, KNIGHT),
            // The same shield answered a second time, now unworn: getobj()
            // hands back a GETOBJ_EXCLUDE_INACCESS object and
            // armor_or_accessory_off() answers "You are not wearing that."
            segment(7710108,
                `${TAKEOFF_KEY}e${WAIT}${TAKEOFF_KEY}e`, KNIGHT),
            // The last worn piece, then dotakeoff()'s empty-slots arm, which
            // prints without prompting because both counts are 0.
            segment(7710109, `${TAKEOFF_KEY}${WAIT}${TAKEOFF_KEY}`, WIZARD),
            // The same command reached by name at the '#' prompt.
            segment(7710110, TAKEOFF_BY_NAME, WIZARD),
        ],
    }, 'take off armor recipe');
}

export function loadTakeOffOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // flags.verbose off: the item still leaves its slot and the AC
            // field still moves, but off_msg() prints nothing.
            segment(7710121, TAKEOFF_KEY, WIZARD, TERSE),
            // A pet on the level and a visible turn counter, for the two
            // cancels a recording can send. Both leave the clock, the pet and
            // the armor where they were.
            segment(7710122,
                `${TAKEOFF_KEY}${ESCAPE_KEY}${WAIT}`
                + `${TAKEOFF_KEY}${SPACE_KEY}`,
                ARCHEOLOGIST, PET_AND_CLOCK),
            // A carried weapon's letter: takeoff_ok() answers
            // GETOBJ_EXCLUDE_INACCESS because the bullwhip is not worn, so
            // getobj() still hands it back and the refusal comes from
            // armor_or_accessory_off() rather than from the prompt.
            segment(7710123,
                `${TAKEOFF_KEY}a${WAIT}${TAKEOFF_KEY}${ESCAPE_KEY}`,
                ARCHEOLOGIST, PET_AND_CLOCK),
            // cmd.c:1886's takeoff row carries no CMD_M_PREFIX, so rhack()
            // reports the prefix rather than running the command.
            segment(7710124, `m${TAKEOFF_KEY}`, KNIGHT, PET_AND_CLOCK),
            // A delayed removal with a pet on the level and the clock shown:
            // the three turns the leather armor costs are turns the dog moves
            // in and the counter advances through, so a delay spent wrongly
            // shows up in both. suit_simple_name() answers "suit" here.
            segment(7710114, TAKEOFF_KEY, CAVEMAN, PET_AND_CLOCK),
            // flags.verbose off against a delayed removal. The message comes
            // from gn.nomovemsg through unmul() rather than from off_msg(),
            // which armoroff() calls only on its no-delay branch, so this one
            // is printed where the Wizard's "You were wearing" line above is
            // not.
            segment(7710125, TAKEOFF_KEY, SAMURAI, TERSE),
        ],
    }, 'take off armor options recipe');
}

export async function runTakeOffMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'take off armor',
            recipe: loadTakeOffRecipe(),
        }],
        summaryLabel: 'TAKE OFF ARMOR',
        chunkLimit: 5,
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'take off armor (option variations)',
            recipe: loadTakeOffOptionsRecipe(),
        }],
        summaryLabel: 'TAKE OFF ARMOR (OPTION VARIATIONS)',
        chunkLimit: 2,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runTakeOffMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `take off armor: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
