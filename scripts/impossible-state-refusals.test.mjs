// Refusals the port removed because no production caller can reach them: each
// stood for a state the game never creates or a call shape no C caller makes.
//
// - js/unported_monster_actions.js assertSimpleActionState(): a monster with
//   both mcanmove and mfrozen (every writer of a nonzero mfrozen clears
//   mcanmove, and every writer of mcanmove = 1 clears mfrozen), and a tame
//   non-minion without dog.c's edog extension (tamedog() and initedog() add
//   it before any monster becomes tame).
// - js/unported_monster_actions.js admitSimpleDestinationAndRegion(): a
//   destination that mon.c mfndpos() selected but no terrain arm admits.
//   m_move() and dog_move() take every destination from mfndpos(), and with
//   m_move()'s can_tunnel and can_unlock each terrain type mfndpos() can
//   select has an arm.
// - js/shk.js shk_move(): a shopkeeper without its eshk extension; every
//   writer of isshk = true creates it first.
// - js/makemon_create.js preflightCreation() and its helpers: makemon() call
//   shapes and markers no C caller produces.
// - js/makemon_create.js rnd_offensive_item(), rnd_defensive_item() and
//   rnd_misc_item(): a switch default past rn2()'s range. Each switch has a
//   case for every value rn2(n) returns (muse.c 2035-2080, 1222-1270,
//   2654-2686); C falls out of it and returns 0, as the port now does.
//
// - js/mon.js mongone(): a monster already detached. C mongone() has no such
//   check; it calls m_detach(), which reports a second detach through
//   impossible() (mon.c 2791-2797) and is now ported.
//
// - js/tty_message.js tty_message_menu(): a selection mode other than
//   PICK_ONE or PICK_NONE. invent.c display_pickinv()'s two calls pass one
//   of those, and C has no other arm.
//
// - js/exper.js more_experienced(): a total past 2^53, where a JavaScript
//   number stops being an exact integer. Every grant is a C int, the
//   largest experience() for one kill.
//
// - js/quest.js expulsion(): seal = TRUE, which none of chat_with_leader()'s
//   three calls passes; the arm is ported, and quest.c needs no refusal
//   operation from its callers.
//
// - js/trap_effects.js preflight_dotrap(), and its calls in dotrap() and
//   hack.js requireSimpleHeroDestination(): a trap of no known type. Every
//   type from ARROW_TRAP to VIBRATING_SQUARE has its trapeffect_*() arm, and
//   trapeffect_selector() answers any other with C's impossible().
//
// - js/cmd.js callExtcmdFunction(): an extcmdlist[] row with no function.
//   Only '#', clicklook and mouseaction lack one, and rhack() runs those
//   itself; scripts/command-dispatch-tables.test.mjs pins the three.
//
// - js/invent.js addinv_core2(): an Archeologist's scroll reaching the
//   synchronous addinv() with no message owner. The arm now prints through
//   ttyPline by default, as C's pline() does; the gap note it replaced is
//   listed so it cannot return. (No game reaches the arm through a split:
//   potion.c toggle_blindness() deciphers every carried scroll as sight
//   returns, as recordings/invent.c/archeologist-*-deciphers-before-split
//   show.)
//
// This check fails when one of those refusals returns. The makemon() species,
// shopkeeper and Rogue-level chameleon refusals that C could reach are ported;
// scripts/deleted-refusal-classes.test.mjs keeps their class from returning.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

const REMOVED_REFUSALS = {
    'unported_monster_actions.js': [
        'inconsistent frozen monster state',
        'a tame pet without dog state',
        'mfndpos() door or special terrain movement',
    ],
    'shk.js': ['shk_move without eshk extension'],
    'mon.js': ['mongone: monster is already detached'],
    'tty_message.js': ['unsupported tty_message_menu mode'],
    'quest.js': [
        'sealing the quest branch',
        'a quest conversation requires an unsupported operation',
    ],
    'trap_effects.js': ["'trap activation'", 'preflight_dotrap'],
    'hack.js': ['preflight_dotrap'],
    'cmd.js': ['for the extended command'],
    'invent.js': ["'invent.c addinv_core2 pline'"],
    'exper.js': ["past JavaScript's exact-integer range", 'Number.isSafeInteger'],
    'makemon_create.js': [
        'mmflags 0x',
        'random coordinates outside mklev',
        'runtime creation without its async tail owner',
        'shopkeeper extension outside shkinit',
        "'outside mklev'",
        'edog creation during mklev',
        'random monster groups',
        'monster record outside the mutable catalog',
        'waiting-vampire reversion state',
        'waiting-vampire target',
        'revival doppelganger shape change',
        'runtime creation without an unused async continuation',
        'rnd_offensive_item selected an invalid case',
        'rnd_defensive_item selected an invalid case',
        'rnd_misc_item selected an invalid case',
    ],
};

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function read(file) {
    return stripComments(readFileSync(`${JS_DIR}${file}`, 'utf8'));
}

test('no removed impossible-state refusal returns', () => {
    const findings = [];
    for (const [file, texts] of Object.entries(REMOVED_REFUSALS)) {
        const code = read(file);
        for (const text of texts) {
            if (code.includes(text)) findings.push(`${file}: ${text}`);
        }
    }
    assert.deepEqual(findings, []);
});
