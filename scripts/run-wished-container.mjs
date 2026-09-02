#!/usr/bin/env node

// Record and replay wizard-mode wishes for a container against the patched C
// reference. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// mkobj.c mksobj_init() (868-1175) sends six of the seven container types to
// mkbox_cnts() (303-384) from its arm at 1010-1022. mkbox_cnts() picks a
// maximum from the type, spends rn2(n + 1) on how many objects to put inside,
// and for each one walks boxiprobs[] with rnd(100), calls mkobj() for the
// class it lands on, and adjusts a few results. objnam.c readobjnam()'s
// typfnd: tail reaches all of that through mksobj(), so a wish is the
// shortest input that drives it.
//
// Two of the six take a route of their own. A chest and a large box spend
// three draws before the fallthrough (1012-1014): rn2(5) for olocked, rn2(10)
// for otrapped, and, only when otrapped came out set, rn2(100) for tknown.
// Their maximum then follows the lock -- 7 or 5 for a chest, 5 or 3 for a
// large box -- so the bound printed with the count draw is what separates the
// four. An ice box has a maximum of 20 and a loop body of its own (339-349):
// mksobj(CORPSE, TRUE, FALSE), age set to 0, and the corpse's ROT_CORPSE,
// REVIVE_MON and SHRINK_GLOB timers stopped.
//
// Nothing on the screen distinguishes a full container from an empty one: a
// freshly created container has cknown 0 (mkobj.c unknow_object()), and
// objnam.c doname_base():1373 appends " containing %ld item%s" only when
// cknown is set. The inventory line reads "a bag" either way, so the PRNG log
// is what separates the branches, and verifyWishedContainerSegment() below
// reads the contents the port built so the two are pinned together.
//
// The ice box is also the one type heavy enough to leave the hero's hands.
// objects.h:903 gives it 900 before any corpse, so invent.c
// hold_another_object() (1207-1306) weighs it against
// max(near_capacity(), flags.pickup_burden) and reaches drop_it for all but
// the lightest. Two segments sit either side of that test with the same wish:
// the ice box holding one corpse is carried, and the one holding four is
// dropped where the hero stands. Nothing about the type decides it.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    CHEST,
    COIN_CLASS,
    CORPSE,
    FOOD_CLASS,
    GEM_CLASS,
    ICE_BOX,
    LARGE_BOX,
    OILSKIN_SACK,
    POTION_CLASS,
    RING_CLASS,
    SACK,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    WAND_CLASS,
} from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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
// amulet. An ice box skips that walk, so its `contents` is FOOD_CLASS once per
// corpse and verifyWishedContainerSegment() checks each one further.
//
// `locked` and `trapped` are the state mksobj_init():1012-1014 rolled, and
// only a chest and a large box carry them. `dropped` marks the one segment
// where hold_another_object() puts the container on the floor rather than in
// the hero's inventory; every other case leaves it held.
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

    // --- BAG_OF_TRICKS, the one container mkbox_cnts() never sees ---
    // mksobj_init():1036-1039 puts a bag of tricks in the HORN_OF_PLENTY arm
    // and gives it rn1(18, 3) charges instead, so admitting it costs no
    // container machinery at all. It is here because obj.h Is_container()
    // counts it, and the refusal this matrix retired was written against that
    // macro.
    { seed: 7710050, wish: 'bag of tricks', opened: true,
      otyp: BAG_OF_TRICKS, contents: [] },

    // --- CHEST, whose maximum is 7 when locked and 5 when not ---
    // Locked and trapped, so all three of mksobj_init():1012-1014's draws are
    // spent: rn2(5)=1, rn2(10)=0, and the rn2(100)=65 that C's `&&` makes only
    // for a trapped box. No other segment in this matrix reaches that third
    // draw. rn2(8)=4 then counts the contents, and rnd(100) answers 42, 5, 5
    // and 41 for them.
    { seed: 7710336, wish: 'chest', opened: true, otyp: CHEST,
      locked: true, trapped: true,
      contents: [POTION_CLASS, GEM_CLASS, GEM_CLASS, POTION_CLASS] },
    // Unlocked and untrapped: rn2(5)=0, rn2(10)=8, and no tknown draw at all.
    // The count draw is rn2(6), whose 5 is its own upper end -- a port holding
    // the locked maximum here would draw rn2(8) and diverge on the bound
    // before the count could matter. rnd(100) answers 45, 55, 76, 79 and 5.
    { seed: 7710327, wish: 'chest', opened: true, otyp: CHEST,
      locked: false, trapped: false,
      contents: [POTION_CLASS, SCROLL_CLASS, SPBOOK_CLASS, SPBOOK_CLASS,
                 GEM_CLASS] },

    // --- LARGE_BOX, whose maximum is 5 when locked and 3 when not ---
    // Locked (rn2(5)=2) and untrapped (rn2(10)=4), so rn2(6) counts the
    // contents, again at its upper end of 5. rnd(100) answers 34, 92, 69, 82
    // and 89; the 82 is a coin, which re-enters mkbox_cnts():360-363 on a box
    // that is not a bag of holding and spends rnd(3) and rnd(75) there.
    { seed: 7710401, wish: 'large box', opened: true, otyp: LARGE_BOX,
      locked: true, trapped: false,
      contents: [POTION_CLASS, WAND_CLASS, SCROLL_CLASS, COIN_CLASS,
                 WAND_CLASS] },
    // Unlocked (rn2(5)=0) and untrapped (rn2(10)=5), so the count draw is
    // rn2(4), a bound no other case in this matrix uses, and its 3 is again
    // the upper end. rnd(100) answers 1, 7 and 68.
    { seed: 7710408, wish: 'large box', opened: true, otyp: LARGE_BOX,
      locked: false, trapped: false,
      contents: [GEM_CLASS, GEM_CLASS, SCROLL_CLASS] },

    // --- ICE_BOX, stocked with corpses and weighed on the way in ---
    // rn2(21)=1, so one mksobj(CORPSE, TRUE, FALSE) runs and the box weighs
    // 910. That is inside max(near_capacity(), pickup_burden), so
    // invent.c:1274-1276 keeps it and prinv() prints the inventory letter.
    { seed: 7710500, wish: 'ice box', opened: true, otyp: ICE_BOX,
      contents: [FOOD_CLASS] },
    // The same wish where rn2(21)=4. Four corpses take the box to 1340, past
    // that limit, so hold_another_object() reaches drop_it, prints "Oops!  The
    // ice box drops to the floor!" and leaves the box on the ground. Only the
    // weight differs between these two segments, which is the whole of what
    // decides the branch.
    //
    // The four corpses stay four stacks even though two share a monster type.
    // mkobj.c mksobj():1216-1223 rolls each corpse a gender into spe, those
    // two drew different ones, and invent.c mergable():4416-4419 compares spe,
    // so add_to_container() links them separately. Where two do merge the
    // container holds fewer stacks than the count draw made, which is why
    // `contents` is a list of stacks and not a count.
    { seed: 7710501, wish: 'ice box', opened: true, otyp: ICE_BOX,
      dropped: true,
      contents: [FOOD_CLASS, FOOD_CLASS, FOOD_CLASS, FOOD_CLASS] },
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

// Read the container out of the running game. The recorded screens cannot show
// what is inside it, so without this the matrix would prove only that the port
// spends C's draws, not that it puts what they chose into the container.
export async function verifyWishedContainerSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);
    await runSegment(recipeSegment);

    const held = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === entry.otyp) held.push(obj);
    const underfoot = [];
    for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj;
        obj = obj.nexthere) {
        if (obj.otyp === entry.otyp) underfoot.push(obj);
    }
    const landed = entry.dropped ? underfoot : held;
    const elsewhere = entry.dropped ? held : underfoot;
    if (landed.length !== 1 || elsewhere.length !== 0) {
        throw new Error(
            `seed ${entry.seed}: "${entry.wish}" left ${held.length} objects `
            + `of otyp ${entry.otyp} in inventory and ${underfoot.length} `
            + `underfoot, wanted the container ${entry.dropped
                ? 'dropped' : 'held'}`,
        );
    }
    const [box] = landed;
    if (Object.hasOwn(entry, 'locked')
        && (Boolean(box.olocked) !== entry.locked
            || Boolean(box.otrapped) !== entry.trapped)) {
        throw new Error(
            `seed ${entry.seed}: "${entry.wish}" came out olocked `
            + `${Number(Boolean(box.olocked))} otrapped `
            + `${Number(Boolean(box.otrapped))} rather than `
            + `${Number(entry.locked)} and ${Number(entry.trapped)}`,
        );
    }
    // mkbox_cnts() prepends each object through add_to_container(), so the
    // chain runs newest first and `contents` reads the other way.
    const inside = [];
    for (let obj = box.cobj; obj; obj = obj.nobj) inside.unshift(obj.oclass);
    if (inside.length !== entry.contents.length
        || inside.some((oclass, at) => oclass !== entry.contents[at])) {
        throw new Error(
            `seed ${entry.seed}: "${entry.wish}" holds classes `
            + `[${inside}] rather than [${entry.contents}]`,
        );
    }
    if (entry.otyp !== ICE_BOX) return;
    // mkbox_cnts():339-349. Every ice-box object is a corpse whose age is 0
    // and whose three timers are stopped, and `contents` can only say
    // FOOD_CLASS about that.
    for (let obj = box.cobj; obj; obj = obj.nobj) {
        if (obj.otyp !== CORPSE || obj.age !== 0 || obj.timed !== 0) {
            throw new Error(
                `seed ${entry.seed}: "${entry.wish}" holds otyp ${obj.otyp} `
                + `aged ${obj.age} with ${obj.timed} timers, wanted a corpse `
                + 'aged 0 with none',
            );
        }
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

runMatrixCli(import.meta.url, runWishedContainerMatrix, 'wished container');
