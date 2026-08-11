#!/usr/bin/env node

// Record and replay wizard-mode wishes for a container against the patched C
// reference. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// mkobj.c mksobj():1010-1021 sends five of the seven container types to
// mkbox_cnts() (303-384), which picks a maximum from the type, spends
// rn2(n + 1) on how many objects to put inside, and for each one walks
// boxiprobs[] with rnd(100), calls mkobj() for the class it lands on, and
// adjusts a few results. objnam.c readobjnam()'s typfnd: tail reaches all of
// that through mksobj(), so a wish is the shortest input that drives it.
//
// Nothing on the screen distinguishes a full container from an empty one: a
// freshly created container has cknown 0 (mkobj.c unknow_object()), and
// objnam.c doname_base():1373 appends " containing %ld item%s" only when
// cknown is set. The inventory line reads "a bag" either way, so the PRNG log
// is what separates the branches, and verifyWishedContainerSegment() below
// reads the contents the port built so the two are pinned together.
//
// Two of the seven types are outside the matrix. A chest and a large box roll
// their own lock, trap and tknown state in mksobj() and take a bare `break;`
// in objnam.c's spe switch (5142-5146); an ice box is stocked with corpses
// whose timers mkbox_cnts() then stops. readobjnam() refuses all three, and
// scripts/wizard-wish.test.mjs pins that refusal.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    COIN_CLASS,
    FOOD_CLASS,
    GEM_CLASS,
    OILSKIN_SACK,
    POTION_CLASS,
    RING_CLASS,
    SACK,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    WAND_CLASS,
} from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// cmd.c:2000 binds C('w') to the "wizwish" row.
const WIZWISH_KEY = '\x17';
const NEWLINE = '\n';
const WAIT = '.';

// One clock for the whole matrix. The moon phase and Friday-the-13th tests
// hack.c and mklev.c make would move every roll below, and the branch each
// case is here for is chosen by its seed; a per-case clock would only make the
// table harder to re-derive.
const DATETIME = '20310417113000';

// `contents` lists the object classes mkbox_cnts() puts in the container, in
// the order it adds them, and is empty where rn2(n + 1) answered 0. Each entry
// records the rnd(100) that boxiprobs[] (mkobj.c:48-56) was walked with: its
// nine rows are the cumulative bands 1-18 gem, 19-33 food, 34-51 potion,
// 52-69 scroll, 70-81 spellbook, 82-88 coin, 89-94 wand, 95-99 ring, 100
// amulet.
export const CASES = [
    // --- SACK and OILSKIN_SACK, whose maximum depends on the turn ---
    // mkbox_cnts():321-327 gives a sack no contents at all while
    // svm.moves <= 1 and the level is not being built, so the wish spends
    // rn2(1) and stops. This is the one segment that wishes before taking a
    // turn, which is what puts svm.moves at 1.
    { seed: 7710030, wish: 'sack', opened: false,
      otyp: SACK, contents: [] },
    // The same wish one turn later, where the early-out no longer applies:
    // n is 1 and rn2(2) answered 0, so the sack is still empty but the draw
    // is rn2(2) rather than rn2(1).
    { seed: 7710003, wish: 'sack', opened: true,
      otyp: SACK, contents: [] },
    // rn2(2) answered 1: rnd(100)=13 lands in the gem band.
    { seed: 7710004, wish: 'sack', opened: true,
      otyp: SACK, contents: [GEM_CLASS] },
    // An oilskin sack, which shares mkbox_cnts()'s SACK arm through C's
    // fallthrough. rnd(100)=96 lands in the ring band.
    { seed: 7710010, wish: 'oilskin sack', opened: true,
      otyp: OILSKIN_SACK, contents: [RING_CLASS] },
    // The same type on a seed whose content is a spellbook (rnd(100)=73).
    { seed: 7710011, wish: 'oilskin sack', opened: true,
      otyp: OILSKIN_SACK, contents: [SPBOOK_CLASS] },

    // --- BAG_OF_HOLDING, whose maximum is 1 on every turn ---
    // rn2(2) answered 0. Reaching the empty branch on a bag of holding
    // separates its unconditional n = 1 from the sack arm above it: were the
    // port to take the sack's early-out here, this would spend rn2(1).
    { seed: 7710020, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [] },
    // The coin arm (mkbox_cnts():360-363), which is the only content class
    // with adjustment code of its own: rnd(level_difficulty() + 2) * rnd(75)
    // gold pieces, re-weighed on the spot. rnd(100)=83.
    { seed: 7710100, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [COIN_CLASS] },
    // A wand (rnd(100)=90), the class whose bag-of-holding adjustment at
    // 377-378 rerolls a wand of cancellation. This seed rolls a different
    // wand, so the loop is entered zero times and the rerolled case stays
    // unrecorded; boxiprobs[] gives the wand band 6 chances in 100 and
    // mkobj() one wand of cancellation in 45, which no small scan reaches.
    { seed: 7710139, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [WAND_CLASS] },
    // A cursed bag with contents, so weight() takes its cursed arm
    // (mkobj.c weight():1950-1953 doubles what a cursed bag of holding
    // carries) on a container the hero is about to be encumbered by.
    // rnd(100)=72 is the spellbook band.
    { seed: 7710201, wish: 'cursed bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [SPBOOK_CLASS] },
    // A food item (rnd(100)=19). mkobj()'s FOOD_CLASS arm can answer a
    // corpse, whose rot timer would outlive the segment; this seed answers an
    // ordinary one.
    { seed: 7710109, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [FOOD_CLASS] },
    // A potion (rnd(100)=34).
    { seed: 7710101, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [POTION_CLASS] },
    // A scroll (rnd(100)=54), which takes the matrix to eight of boxiprobs[]'s
    // nine classes. The ninth is the amulet, whose band is the single value
    // 100; a scan of eighty seeds found none, and finding one would say
    // nothing the other eight do not, because mkbox_cnts() treats every class
    // but the coin alike.
    { seed: 7710104, wish: 'bag of holding', opened: true,
      otyp: BAG_OF_HOLDING, contents: [SCROLL_CLASS] },

    // --- BAG_OF_TRICKS, the container mksobj() never sends to mkbox_cnts() ---
    // mksobj():1036-1039 puts a bag of tricks in the HORN_OF_PLENTY arm and
    // gives it rn1(18, 3) charges instead, so admitting it costs no container
    // machinery at all. It is here because obj.h Is_container() counts it, and
    // the refusal this matrix retired was written against that macro.
    { seed: 7710050, wish: 'bag of tricks', opened: true,
      otyp: BAG_OF_TRICKS, contents: [] },
];

// pettype:none keeps a pet from moving while the prompt is open, !acoustics
// silences dosounds(), and playmode:debug is what cmd.c can_do_extcmd() reads
// before admitting the WIZMODECMD "wizwish" row. Every case wishes as the same
// hero, because the branch under test is chosen by the seed and the typed line.
function nethackrc() {
    return [
        'OPTIONS=name:Bagger,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n');
}

// A wish, then a wait so the inventory line paints over a screen the reply
// settled and a turn the wish wrongly spent would show. `opened` prepends a
// wait as well, which is what carries svm.moves past mkbox_cnts()'s
// initial-inventory early-out.
function moves(entry) {
    return `${entry.opened ? WAIT : ''}${WIZWISH_KEY}${entry.wish}`
        + `${NEWLINE}${WAIT}`;
}

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: moves(entry),
    };
}

export function loadWishedContainerRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(segment),
    }, 'wished container recipe');
}

// The recipes carry replay inputs only, so a segment is matched back to its
// case by the seed and keys that produced it.
export function caseFor(recipeSegment) {
    const found = CASES.find(
        (entry) => entry.seed === recipeSegment.seed
            && moves(entry) === recipeSegment.moves,
    );
    if (!found)
        throw new Error(`no case configures ${JSON.stringify(recipeSegment)}`);
    return found;
}

// Read the contents out of the running game. The recorded screens cannot show
// them, so without this the matrix would prove only that the port spends C's
// draws, not that it puts what they chose into the container.
export async function verifyWishedContainerSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);
    await runSegment(recipeSegment);

    const held = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === entry.otyp) held.push(obj);
    if (held.length !== 1) {
        throw new Error(
            `seed ${entry.seed}: "${entry.wish}" left ${held.length} objects `
            + `of otyp ${entry.otyp} in inventory`,
        );
    }
    const [box] = held;
    const inside = [];
    for (let obj = box.cobj; obj; obj = obj.nobj) inside.push(obj.oclass);
    if (inside.length !== entry.contents.length
        || inside.some((oclass, at) => oclass !== entry.contents[at])) {
        throw new Error(
            `seed ${entry.seed}: "${entry.wish}" holds classes `
            + `[${inside}] rather than [${entry.contents}]`,
        );
    }
}

export async function runWishedContainerMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wished container',
            recipe: loadWishedContainerRecipe(),
        }],
        summaryLabel: 'WISHED CONTAINER',
        verifySegment: verifyWishedContainerSegment,
        // One segment per recorder run. A second wish inside one run exits the
        // recorder at the boundary that submits it, whichever pair of segments
        // is put together; scripts/run-wizard-wish.mjs records one at a time
        // for the same reason.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWishedContainerMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`wished container: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
