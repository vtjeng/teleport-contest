#!/usr/bin/env node

// Record and replay the character-selection header role.c plsel_startmenu()
// (2806-2845) builds, through the four names that separate its "%.20s" cut
// from a cut at twenty characters.
//
//     Sprintf(qbuf, "%.20s the %.20s %.20s %.20s %.20s",
//             svp.plname, aligns[ALGN].adj, genders[GEND].adj,
//             races[RACE].adj, rolename);
//
// A "%.Ns" precision counts bytes. Four of the five fields come from the
// compiled-in role, race, gender and alignment tables and are ASCII, but
// options.c nmcpy() copies svp.plname up to PL_NSIZ - 1 == 31 bytes, so a
// name of 21 bytes or more is cut here even when it holds twenty characters
// or fewer -- and the cut can land inside a multibyte character.
//
// Every segment answers the same six keys, so the name is the only thing that
// differs between them. The keys reach both consumers of the header: the role,
// race, gender and alignment menus take plsel_startmenu()'s other Sprintf at
// 2821, and the confirmation loop at role.c:2655 takes the one above.
//
// The header is a menu line, not a raw print. Recorder patch 006 draws it
// through process_menu_window(), which hands nomux_putch() one signed char per
// byte; every high-bit byte is below 32 there and leaves its shadow cell as
// the preceding clear left it. So each multibyte character inside the kept
// prefix shows up as blank columns, and the whole observable is ASCII.
//
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A Wednesday morning with no calendar notice and no moon phase to announce.
const DATETIME = '20340517080910';
// Nothing here measures generation, so the seed only has to be a start the
// selection menus can run in front of.
const SEED = 4820577;
// n declines the automatic pick; w, h, m and n choose Wizard, human, male and
// neutral; y accepts the confirmation and starts the game.
const MOVES = 'nwhmny';
// aligns[].adj, genders[].adj, races[].adj and rolename for that character,
// each far short of its own twenty-byte cut.
const HEADER_TAIL = ' the neutral male human Wizard';
// tty_end_menu() sizes the window from `strlen(curr->str) + 2`, so a 20-byte
// name and this 30-byte tail put the header's 50 bytes at offx == 80 - 52 - 1,
// and process_menu_window() draws from one column right of that.
const HEADER_COLUMN = 28;

export const HEADER_CASES = [
    {
        // 23 ASCII characters, where byte and code-unit counts agree. This
        // case pins the limit itself rather than the unit it counts.
        plname: 'Aardvarkbcdefghijklmnop',
        field: 'Aardvarkbcdefghijklm',
    },
    {
        // 20 characters in 21 bytes, the two-byte one 19th. The cut at byte
        // 20 falls between characters and drops the final 'm'; the kept
        // e-acute leaves both of its byte columns blank.
        plname: 'Aardvarkbcdefghijkém',
        field: 'Aardvarkbcdefghijk  ',
    },
    {
        // 20 characters in 21 bytes, the two-byte one last. The cut falls
        // inside it and keeps its lead byte, which holds one blank column.
        // Re-encoding that byte as U+FFFD instead would occupy three.
        plname: 'Aardvarkbcdefghijklé',
        field: 'Aardvarkbcdefghijkl ',
    },
    {
        // 19 characters in exactly 20 bytes: at the limit, so not cut. This
        // separates a cut at 20 bytes from one at 19.
        plname: 'Aardvarkbcdefghijké',
        field: 'Aardvarkbcdefghijk  ',
    },
];

function nethackrc(plname) {
    return [
        `OPTIONS=name:${plname}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        '',
    ].join('\n');
}

function headerSegment({ plname }) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(plname),
        moves: MOVES,
    };
}

export function loadCharacterHeaderClipRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: HEADER_CASES.map((entry) => headerSegment(entry)),
    });
}

export async function verifyCharacterHeaderClipSegment(recipeSegment) {
    const found = HEADER_CASES.find(
        (entry) => headerSegment(entry).nethackrc === recipeSegment.nethackrc,
    );
    if (!found) throw new Error('no header case for this rc');
    const { plname, field } = found;

    // Stop with the confirmation menu drawn and its answer unread, so the
    // header stays on the live terminal.
    await runSegment({
        ...recipeSegment,
        moves: recipeSegment.moves.slice(0, -1),
    });

    // Everything below measures the cut in the header, so svp.plname has to
    // arrive whole first: every name here is inside nmcpy()'s 31 bytes.
    if (game.plname !== plname) {
        throw new Error(
            `svp.plname is ${JSON.stringify(game.plname)}`,
        );
    }
    if (encodeUtf8ByteString(game.plname).length > 31)
        throw new Error('the case name outgrew nmcpy()');

    const header = game.nhDisplay.grid[2]
        .map(({ ch }) => ch).join('').trimEnd();
    const expected = `${' '.repeat(HEADER_COLUMN)}${field}${HEADER_TAIL}`;
    if (header !== expected)
        throw new Error(`header row is ${JSON.stringify(header)}`);

    // The complete replay accepts the confirmation and starts the game, which
    // is the boundary the recorded screens are compared through.
    let boundary = null;
    await runSegment(recipeSegment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.plname !== plname)
        throw new Error('starting the game changed svp.plname');
}

export async function runCharacterHeaderClipMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'character header clip',
            recipe: loadCharacterHeaderClipRecipe(),
        }],
        summaryLabel: 'CHARACTER HEADER CLIP',
        verifySegment: verifyCharacterHeaderClipSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runCharacterHeaderClipMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `character header clip: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
