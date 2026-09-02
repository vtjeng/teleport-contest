#!/usr/bin/env node

// Record and replay the line wintty.c tty_end_menu() (2728-2733) cuts off,
// through the inventory menu invent.c ddoinv() opens.
//
//     len = strlen(curr->str) + 2; /* extra space at beg & end */
//     if (len > (int) ttyDisplay->cols) {
//         curr->str[ttyDisplay->cols - 2] = 0;
//         len = ttyDisplay->cols;
//     }
//
// The cut is destructive and lands two cells short of the terminal, so the
// boundary is asymmetric: a stored line of exactly `cols - 2` characters
// survives whole, and one of `cols - 1` loses its last character. Four wishes
// straddle that boundary by name length alone; nothing else about them
// differs, so the recorded screens isolate where the cut falls.
//
// Reaching a stored line longer than the terminal needs an object name longer
// than any the dungeon generates, which is why these segments wish in debug
// mode. objnam.c readobjnam():5347-5349 labels the object with the text after
// " named ", and invent.c prints the label in the menu.
//
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { donameFresh } from '../js/objnam.js';
import { LONG_SWORD } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';
const WAIT = '.';
const WIZWISH_KEY = '\x17'; /* C('w'), cmd.c's "wizwish" row */
// The wish's own prinv() line is as long as the menu line it produces, so the
// two longest cases end their turn on a --More--. The space clears that; for
// the two shorter ones it is an ordinary rest, which both sides take alike.
const INVENTORY = ' i\x1b';
// 7710103 is the seed the #twoweapon matrix uses for every case that is not
// measuring a draw: a start with no monster beside the hero, so the leading
// wait reaches no unported path.
const SEED = 7710103;

// tty_add_menu() writes the accelerator and its separator ahead of the name
// invent.c formats, so the stored line is four characters longer than the
// object's name. The wished sword takes the first free letter, 'p'.
const ACCELERATOR = 'p - ';

// `stored` counts "p - a long sword named " plus the name; the verifier
// measures the port's own line against it rather than trusting the sum.
export const CLIP_CASES = [
    // One character below the boundary: the menu asks for 79 of the 80
    // columns and nothing is cut.
    { nameLength: 54, stored: 77 },
    // Exactly `cols - 2`, where `len` comes to exactly 80. The comparison at
    // :2729 is `>`, so this line survives whole -- the case that separates a
    // cut at `cols - 2` from one at `cols - 1`.
    { nameLength: 55, stored: 78 },
    // One character above. Cut back to 78, so its screen has to match the
    // case above it exactly, one 'a' shorter than the name asked for.
    { nameLength: 56, stored: 79 },
    // Past the terminal, and cut back to the same 78. This is the case that
    // shows the cut is to a fixed width, not by a fixed amount. 62 is as long
    // as the label can get: getline.c:169 stops accepting input at COLNO - 1
    // characters, and "long sword named " already spends 17 of the 79.
    { nameLength: 62, stored: 85 },
];

function nethackrc() {
    return [
        'OPTIONS=name:Clipr,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n');
}

function clipSegment({ nameLength }) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: `${WAIT}${WIZWISH_KEY}long sword named `
            + `${'a'.repeat(nameLength)}\n${INVENTORY}`,
    };
}

export function loadMenuLineClipRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CLIP_CASES.map((entry) => clipSegment(entry)),
    });
}

export async function verifyMenuLineClipSegment(recipeSegment) {
    const found = CLIP_CASES.find(
        (entry) => clipSegment(entry).moves === recipeSegment.moves,
    );
    if (!found) throw new Error(`no clip case for ${recipeSegment.moves}`);
    const { nameLength, stored } = found;

    // Stop with the wish granted and the menu still unopened.
    await runSegment({
        ...recipeSegment,
        moves: recipeSegment.moves.slice(0, -INVENTORY.length),
    });
    let wished = null;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === LONG_SWORD) wished = obj;
    if (!wished) throw new Error('the wish produced no long sword');
    if (wished.oextra?.oname !== 'a'.repeat(nameLength))
        throw new Error(`the label is ${wished.oextra?.oname}`);

    // Which side of wintty.c:2729 the stored line falls on is the whole point
    // of the case, so its length is checked before the screens are.
    const measured = ACCELERATOR.length + donameFresh(wished, game).length;
    if (measured !== stored)
        throw new Error(`case ${nameLength} stores ${measured} characters`);

    // ddoinv() costs no time, so opening and closing the menu leaves the turn
    // counter where the wish left it.
    const movesBefore = game.moves;
    await runSegment(recipeSegment);
    if (game.moves !== movesBefore)
        throw new Error('the inventory menu spent a move');
}

export async function runMenuLineClipMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'menu line clip',
            recipe: loadMenuLineClipRecipe(),
        }],
        summaryLabel: 'MENU LINE CLIP',
        verifySegment: verifyMenuLineClipSegment,
        // A debug-mode game leaves a save behind, so each segment records on
        // its own; see .agents/validation.md.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMenuLineClipMatrix, 'menu line clip');
