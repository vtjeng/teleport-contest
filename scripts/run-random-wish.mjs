#!/usr/bin/env node

// Record and replay the wishes objnam.c readobjnam() answers with an object of
// its own choosing, against the patched C reference. Every segment contains
// replay inputs only; runFreshMatrix() records new reference output in an
// isolated temporary workspace.
//
// Two lines reach that outcome. An Escape over an empty wish prompt leaves the
// buffer holding "\033", which zap.c makewish():6346-6347 turns into the empty
// string; readobjnam_preparse() answers 1 for it and objnam.c:4924-4925 jumps
// to `any:`, where wrpsym[rn2(13)] picks a class. A line that carries a class
// word and matches no type reaches the same place from the other side: the
// wiztrap: guard, the "polearm" and "hammer" picks and the null return at
// objnam.c:4959-4993 all read `!d.oclass` and so pass it by, and `any:`'s own
// guard does too. Both then arrive at typfnd: with d.typ 0, where
// objnam.c:5037 calls mkobj(d.oclass, FALSE).
//
// mkobj() draws a type from the class's probability table and mksobj() builds
// it, so the object is whatever the seed chose. The cases below are grouped by
// what each one shows: the eleven classes wrpsym[] can name, then the arms of
// objnam.c's spe switch (5122-5185) that only a drawn type reaches, then the
// count the `any:` route leaves at 0.
//
// Two outcomes are outside the matrix. An ice box is too heavy for the hero to
// hold, so invent.c hold_another_object() takes its drop arm and the segment
// stops there rather than on anything the wish parser did; seed 5510561 is one.
// And a corpse cannot be drawn at all, because objects.h gives it oc_prob 0.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    CHEST,
    EGG,
    FIGURINE,
    FOOD_CLASS,
    GEM_CLASS,
    LARGE_BOX,
    POTION_CLASS,
    RING_CLASS,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPBOOK_CLASS,
    TIN,
    TOOL_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// cmd.c:2000 binds C('w') to the "wizwish" row.
const WIZWISH_KEY = '\x17';
const ESCAPE_KEY = '\x1b';
const NEWLINE = '\n';
const WAIT = '.';

// One clock for the whole matrix, as the container matrix uses. The moon phase
// and Friday-the-13th tests hack.c and mklev.c make would move every roll
// below, and the branch each case is here for is chosen by its seed.
const DATETIME = '20300221084500';

// `otyp` and `oclass` are what the port builds; verifyRandomWishSegment() reads
// them out of the running game, because the recorded screens show the object's
// name rather than its type and two types can share a name. `quan` is listed
// only where it is not 1.
export const CASES = [
    // --- the eleven classes wrpsym[] holds ---
    // Eight entries name eight classes and five name three more twice over
    // ("spellbook"/"spell book" and "food"/"comestible" share theirs), so
    // eleven distinct classes can come out of the rn2(13).
    { seed: 5510008, oclass: WAND_CLASS, otyp: 410 /* WAN_LIGHT */ },
    { seed: 5510019, oclass: RING_CLASS,
      otyp: 189 /* RIN_FIRE_RESISTANCE */ },
    { seed: 5510050, oclass: POTION_CLASS, otyp: 298 /* POT_RESTORE_ABILITY */ },
    { seed: 5510031, oclass: SCROLL_CLASS, otyp: 328 /* SCR_ENCHANT_WEAPON */ },
    // A gem mksobj() made two of: mkobj.c mksobj():986-990 gives a gem that is
    // neither a luckstone nor a rock quan 2 once in six.
    { seed: 5510015, oclass: GEM_CLASS, otyp: 461 /* WORTHLESS_WHITE_GLASS */,
      quan: 2 },
    { seed: 5510006, oclass: AMULET_CLASS,
      otyp: 209 /* AMULET_OF_MAGICAL_BREATHING */ },
    { seed: 5510000, oclass: SPBOOK_CLASS, otyp: 367 /* SPE_MAGIC_MISSILE */ },
    { seed: 5510004, oclass: WEAPON_CLASS, otyp: 50 /* SCIMITAR */ },
    { seed: 5510002, oclass: ARMOR_CLASS, otyp: 133 /* ORCISH_RING_MAIL */ },
    { seed: 5510007, oclass: TOOL_CLASS, otyp: 236 /* LEASH */ },
    { seed: 5510001, oclass: FOOD_CLASS, otyp: 293 /* FOOD_RATION */ },

    // --- the spe switch arms only a drawn type reaches ---
    // objnam.c:5122's `d.otmp->spe = 0`. mkobj.c mksobj():925-937 sends every
    // tin through eat.c set_tin_variety(), which leaves either spinach (spe 1)
    // or a negative variety code, and the wish tail overwrites both with 0.
    // The name is the evidence: objnam.c xname() reads spe to spell a tin,
    // so a surviving code would print "tin of <something>".
    { seed: 5510150, oclass: FOOD_CLASS, otyp: TIN },
    // The same arm on a stack of two, which mksobj():998-1001 makes one time
    // in six for a food item.
    { seed: 5510056, oclass: FOOD_CLASS, otyp: TIN, quan: 2 },
    // objnam.c:5137-5139's `d.otmp->spe = d.ftype`, the named-fruit spe.
    { seed: 5510603, oclass: FOOD_CLASS, otyp: SLIME_MOLD },
    // objnam.c:5147-5165 with C's P null, which collapses to CORPSTAT_RANDOM
    // and replaces the gender mksobj():1216-1223 rolled for the figurine.
    { seed: 5510054, oclass: TOOL_CLASS, otyp: FIGURINE },
    // objnam.c:5141-5146's bare `break;`, which a large box and a chest share
    // with the skeleton key, the heavy iron ball and the iron chain. Both are
    // also mkbox_cnts() types with a maximum above 1, so the box arrives
    // holding what mkobj.c:338-380 put in it.
    { seed: 5510077, oclass: TOOL_CLASS, otyp: LARGE_BOX },
    // A chest, which is heavy enough that hold_another_object() reaches
    // encumber_msg() and the inventory line carries a load message.
    { seed: 5510434, oclass: TOOL_CLASS, otyp: CHEST },
    // An egg, which objnam.c's spe switch does not name at all: it takes the
    // `default:` arm and keeps what mksobj() left. Its corpsenm arm at
    // 5227-5229 needs a monster the wish named, and this one names none.
    { seed: 5510083, oclass: FOOD_CLASS, otyp: EGG },

    // --- the count the `any:` route never defaults to 1 ---
    // C's `goto any` steps over objnam.c:4927-4928, the only line that raises
    // d.cnt from 0, so the count block at 5069-5083 leaves mksobj()'s own
    // quantity alone. A multigen weapon is where that shows: mksobj():963
    // gives it rn1(6, 6) of itself, and a d.cnt of 1 would cut the stack to
    // one shuriken.
    { seed: 5510033, oclass: WEAPON_CLASS, otyp: 25 /* SHURIKEN */, quan: 9 },
    // The same route on a stack mksobj() built for a different reason:
    // mksobj():988 gives ROCK rn1(6, 6) inside the gem class.
    { seed: 5510353, oclass: GEM_CLASS, otyp: 474 /* ROCK */, quan: 9 },

    // --- the other line that reaches typfnd: with d.typ 0 ---
    // A wish that carries a class word and matches no type. It spends no
    // rn2(13), because `any:`'s guard reads the class word the parse already
    // set, and objnam.c:5037 then draws inside that class rather than across
    // all of them. This is the class-word half of the "wish-name-that-matches-
    // nothing" deferral; its no-class-word half still stops, on makewish()'s
    // unported retry loop.
    { seed: 5510041, wish: 'zzyzx potion', oclass: POTION_CLASS,
      otyp: 319 /* POT_FRUIT_JUICE */ },
];

// pettype:none keeps a pet from moving while the prompt is open, !acoustics
// silences dosounds(), and playmode:debug is what cmd.c can_do_extcmd() reads
// before admitting the WIZMODECMD "wizwish" row. Every case wishes as the same
// hero, because the branch under test is chosen by the seed.
function nethackrc() {
    return [
        'OPTIONS=name:Wisher,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n');
}

// A wait, then the wish, then a wait. The opening wait puts the prompt over a
// screen an ordinary turn produced rather than the arrival screen; the closing
// one paints over the inventory line, so a turn the wish wrongly spent would
// show. An entry with no `wish` text presses Escape over the empty line.
function moves(entry) {
    const line = entry.wish === undefined
        ? ESCAPE_KEY
        : `${entry.wish}${NEWLINE}`;
    return `${WAIT}${WIZWISH_KEY}${line}${WAIT}`;
}

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: moves(entry),
    };
}

export function loadRandomWishRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(segment),
    }, 'random wish recipe');
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

// Read the granted object out of the running game. The recorded screens carry
// its name, which is what a player sees, but a name does not pin a type: an
// undiscovered wand prints as "a short wand" whichever wand it is, and two
// container types print alike. This reads otyp, oclass and quantity directly,
// so the matrix pins which object mkobj() chose as well as how it reads.
export async function verifyRandomWishSegment(recipeSegment) {
    const entry = caseFor(recipeSegment);
    await runSegment(recipeSegment);

    // The wished object is the last one added, and next_ident() hands out
    // rising ids, so the largest id in inventory is it.
    let granted = null;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (!granted || obj.o_id > granted.o_id) granted = obj;
    if (!granted)
        throw new Error(`seed ${entry.seed}: the wish granted nothing`);
    const wanted = {
        otyp: entry.otyp, oclass: entry.oclass, quan: entry.quan ?? 1,
    };
    const got = {
        otyp: granted.otyp, oclass: granted.oclass, quan: granted.quan,
    };
    for (const [field, value] of Object.entries(wanted)) {
        if (got[field] !== value) {
            throw new Error(
                `seed ${entry.seed}: granted ${JSON.stringify(got)} rather `
                + `than ${JSON.stringify(wanted)}`,
            );
        }
    }
}

export async function runRandomWishMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'random wish',
            recipe: loadRandomWishRecipe(),
        }],
        summaryLabel: 'RANDOM WISH',
        verifySegment: verifyRandomWishSegment,
        // One segment per recorder run. A second wish inside one run exits the
        // recorder at the boundary that submits it, whichever pair of segments
        // is put together; scripts/run-wizard-wish.mjs and
        // scripts/run-wished-container.mjs record one at a time for the same
        // reason.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runRandomWishMatrix, 'random wish');
