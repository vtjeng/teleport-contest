#!/usr/bin/env node

// Record and replay the `d` command against the patched C reference.
//
// do.c drop() branches on what the chosen object is attached to, and every
// branch it reaches for a hero standing on reachable ordinary floor has a
// case here. Which branch a keystroke selects is fixed by u_init.c's starting
// inventory, so a letter selects a branch the way a key selects a command:
//
// - ESCAPE_CASE cancels at the getobj() prompt. invent.c:1950 answers a
//   quitchars byte with Never_mind and a null object, so drop() returns
//   ECMD_FAIL at do.c:716-717 and no turn elapses. cmd.c dodrop() still calls
//   reset_occupations(), because ECMD_FAIL is 0x04 and therefore true.
// - CARRIED_CASE drops an object in no equipment slot: do.c:777-778 alone.
// - WIELDED_CASE, SWAPWEP_CASE and QUIVER_CASE each reach one of the three
//   slot clears at do.c:722-734 before that.
// - GOLD_CASE selects the '$' slot, which getobj() sends through its own arm
//   at invent.c:2007-2027 before drop() sees the object.
// - WORN_CASE reaches canletgo()'s first arm (do.c:667-671), which refuses a
//   worn piece with Norep and no turn.
// - LOADSTONE_CASE reaches canletgo()'s third arm (do.c:685-699), which
//   refuses a cursed loadstone with "For some reason, you cannot ..." and
//   sets its bknown.
// - MEATRING_CASE drops the one object type that satisfies do.c:753's second
//   disjunct without the first: a meat ring is FOOD_CLASS, not RING_CLASS.
//   Away from a sink the sink arm must still fall through.
// - MERGE_CASE drops two identical wished scrolls on one square, so the
//   second reaches invent.c stackobj() -> merged() -> obj_extract_self() and
//   leaves one floor node of quantity two.
//
// The last two need a wish, so each is recorded in its own debug game:
// record-session keeps one staged install per recipe, and two sequential
// debug games in one install collide.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed Tuesday morning with no calendar event, so nothing competes with
// the drop's own message for the top line.
const DATETIME = '20330809101112';
const ESC = '\x1b';
const WIZWISH_KEY = '\x17';
// Space dismisses the startup line; the trailing rest makes the turn the drop
// did or did not spend visible on the next screen.
const START = ' ';
const REST = '.';
const LIGHT_WISH = `${WIZWISH_KEY}scroll of light\n`;
// mkobj.c curses every loadstone it makes, so no "cursed" prefix is needed.
const LOADSTONE_WISH = `${WIZWISH_KEY}loadstone\n`;

// One seed per role. Neither is searched for: the starting inventory these
// cases select from comes from u_init.c and is the same on every seed.
const VALKYRIE_SEED = 4410001;
const TOURIST_SEED = 4410002;

function nethackrc(name, role, gender, align, {
    debug = false, verbose = true,
} = {}) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
            + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup'
            + (debug ? ',playmode:debug' : '')
            + (verbose ? '' : ',!verbose'),
        '',
    ].join('\n');
}

const VALKYRIE_RC = nethackrc('DropValk', 'Valkyrie', 'female', 'lawful');
const TOURIST_RC = nethackrc('DropTour', 'Tourist', 'male', 'neutral');
const MERGE_RC = nethackrc(
    'DropMerge', 'Valkyrie', 'female', 'lawful', { debug: true },
);
const LOADSTONE_RC = nethackrc(
    'DropStone', 'Valkyrie', 'female', 'lawful', { debug: true },
);
const MEATRING_RC = nethackrc(
    'DropMeat', 'Valkyrie', 'female', 'lawful', { debug: true },
);
// do.c:774's other side, `flags.verbose` off, is exported for the port-level
// test rather than recorded: an answered yn_function() prompt that is followed
// by no message keeps its row on the C terminal and loses it here, which the
// deferred entry drop-prompt-row-lost-without-a-following-message carries.
export const QUIET_RC = nethackrc(
    'DropQuiet', 'Valkyrie', 'female', 'lawful', { verbose: false },
);

// u_init.c:160-166 gives the Valkyrie a wielded spear, a dagger in the
// secondary slot, a worn small shield and a loose food ration, in that letter
// order; :150-159 gives the Tourist a quivered stack of darts, and u_init()
// gives every role a gold slot.
export const DROP_CASES = [
    {
        label: 'escape at the drop prompt',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: `d${ESC}`,
        // Nothing leaves the pack and no turn is spent.
        floor: null,
    },
    {
        label: 'a carried object',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'dd',
        floor: 'd',
    },
    {
        label: 'the wielded weapon',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'da',
        floor: 'a',
        slot: 'uwep',
    },
    {
        label: 'the secondary weapon',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'db',
        floor: 'b',
        slot: 'uswapwep',
    },
    {
        label: 'worn armor',
        seed: VALKYRIE_SEED,
        nethackrc: VALKYRIE_RC,
        keys: 'dc',
        // canletgo() refuses, so the shield stays worn and on the letter.
        floor: null,
    },
    {
        label: 'the gold slot',
        seed: TOURIST_SEED,
        nethackrc: TOURIST_RC,
        keys: 'd$',
        floor: '$',
    },
    {
        label: 'the quivered stack',
        seed: TOURIST_SEED,
        nethackrc: TOURIST_RC,
        keys: 'da',
        floor: 'a',
        slot: 'uquiver',
    },
];

export const LOADSTONE_CASE = {
    label: 'a cursed loadstone',
    seed: VALKYRIE_SEED,
    nethackrc: LOADSTONE_RC,
    setup: LOADSTONE_WISH,
    keys: 'de',
    floor: null,
};

export const MEATRING_CASE = {
    label: 'a meat ring away from a sink',
    seed: VALKYRIE_SEED,
    nethackrc: MEATRING_RC,
    setup: `${WIZWISH_KEY}meat ring\n`,
    keys: 'de',
    floor: 'e',
};

export const MERGE_CASE = {
    label: 'a second scroll merging into the floor pile',
    seed: VALKYRIE_SEED,
    nethackrc: MERGE_RC,
    // Each wish takes the lowest free letter, so the first scroll is 'e' and
    // the second is 'f' while 'e' lies on the floor.
    setup: `${LIGHT_WISH}de${LIGHT_WISH}`,
    keys: 'df',
    pileBefore: 1,
    mergedQuantity: 2,
};

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: entry.nethackrc,
        moves: START + (entry.setup ?? '') + entry.keys + REST,
    };
}

export function loadDropCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: DROP_CASES.map(segmentFor),
    }, 'drop command recipe');
}

export function loadDropLoadstoneRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(LOADSTONE_CASE)],
    }, 'drop loadstone recipe');
}

export function loadDropMeatRingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(MEATRING_CASE)],
    }, 'drop meat ring recipe');
}

export function loadDropMergeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(MERGE_CASE)],
    }, 'drop merge recipe');
}

function caseForSegment(segment) {
    const moves = segment.moves;
    const found = [...DROP_CASES, LOADSTONE_CASE, MEATRING_CASE, MERGE_CASE]
        .find((entry) => segmentFor(entry).moves === moves
            && segmentFor(entry).nethackrc === segment.nethackrc);
    if (!found) throw new Error(`no drop case for moves ${JSON.stringify(moves)}`);
    return found;
}

function inventoryLetters(state) {
    const letters = [];
    for (let obj = state.invent; obj; obj = obj.nobj) letters.push(obj.invlet);
    return letters;
}

function floorPile(state) {
    const pile = [];
    for (let obj = state.level.objects[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        pile.push(obj);
    }
    return pile;
}

export async function verifyDropCommandSegment(segment) {
    const entry = caseForSegment(segment);
    // The pack and pile as the drop finds them, so a letter that stayed is
    // distinguishable from one that never existed.
    await runSegment({ ...segment, moves: START + (entry.setup ?? '') });
    const before = inventoryLetters(game);
    const pileBefore = floorPile(game).length;
    if (pileBefore !== (entry.pileBefore ?? 0)) {
        throw new Error(
            `${entry.label}: the drop starts on a pile of ${pileBefore}`,
        );
    }
    if (entry.floor && !before.includes(entry.floor))
        throw new Error(`${entry.label}: the pack has no '${entry.floor}'`);
    if (entry.slot && !game[entry.slot])
        throw new Error(`${entry.label}: ${entry.slot} is empty before the drop`);

    let boundary = null;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;

    const after = inventoryLetters(game);
    const pile = floorPile(game);
    if (entry.mergedQuantity !== undefined) {
        if (pile.length !== 1 || pile[0].quan !== entry.mergedQuantity) {
            throw new Error(
                `${entry.label}: floor holds ${pile.length} node(s), `
                + `quantity ${pile.map((obj) => obj.quan).join('/')}`,
            );
        }
        return;
    }
    if (entry.floor === null) {
        if (pile.length !== pileBefore)
            throw new Error(`${entry.label}: a refused drop left the object`);
        if (after.join('') !== before.join(''))
            throw new Error(`${entry.label}: a refused drop changed the pack`);
        return;
    }
    if (pile.length !== pileBefore + 1)
        throw new Error(`${entry.label}: floor holds ${pile.length} node(s)`);
    if (pile[0].where !== OBJ_FLOOR
        || pile[0].ox !== game.u.ux || pile[0].oy !== game.u.uy) {
        throw new Error(`${entry.label}: dropped object is not on this square`);
    }
    if (after.includes(entry.floor))
        throw new Error(`${entry.label}: '${entry.floor}' is still carried`);
    if (entry.slot && game[entry.slot])
        throw new Error(`${entry.label}: ${entry.slot} still holds the object`);
    if (entry.slot && pile[0].owornmask)
        throw new Error(`${entry.label}: the dropped object is still worn`);
}

export async function runDropCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'drop command', recipe: loadDropCommandRecipe() },
            { label: 'drop loadstone', recipe: loadDropLoadstoneRecipe() },
            { label: 'drop meat ring', recipe: loadDropMeatRingRecipe() },
            { label: 'drop merge', recipe: loadDropMergeRecipe() },
        ],
        summaryLabel: 'DROP COMMAND',
        verifySegment: verifyDropCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runDropCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`drop command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
