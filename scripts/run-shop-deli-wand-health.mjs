#!/usr/bin/env node

// Run the checked-in matrix for the three shknam.c shtypes[] rows whose stock
// is not one object class per iprobs[] entry: the delicatessen, the wand shop
// ("quality apparel and accessories") and the health food store. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output in
// an isolated temporary workspace.
//
// The hero walks from the up staircase she starts on to D:1's down staircase
// and presses `>`. C prints "You descend the stairs." and stops at a `--More--`
// drawn over the level being left, so every segment ends with a space, which
// lets the D:2 map, its stocked shop and its shopkeeper through.
//
// Each segment is compared strictly: the whole of mklev()'s random-number
// stream for D:2, both screens and the cursor at each.
//
// What these three rows exercise that the earlier shop rows do not.
// mkshobj_at() dispatches on the sign of get_shop_item()'s answer: a
// non-negative answer is an object class for mkobj_at(), a negative one is the
// negation of a single object type for mksobj_at(), and the health food
// store's VEGETARIAN_CLASS reaches shkveg(), which weights every vegetarian
// food type by objects[].oc_prob and spends one rnd(maxprob) on it. A tin that
// comes out of shkveg() is then forced to a variety a vegetarian may eat by
// set_tin_variety(obj, HEALTHY_TIN), which draws again.
//
// What only a screen can catch. mkshop()'s type roll is one rnd(100) whatever
// it selects, so an off-by-one over shtypes[]'s prob column would put a
// different shop here while drawing the same number, and the same is true of
// each row's own iprobs[] shares inside get_shop_item(). nameshk() derives the
// keeper's name and gender from ubirthday and m_id without drawing at all,
// which is why an Indonesian, Welsh or Tibetan place name on the D:2 map is
// evidence for the row that owns that list. And a negated itype reaches the
// map as one glyph: a port that negated the wrong operand would draw a
// different object from the same stream.
//
// Choosing the seeds: paths were found by breadth-first search over the
// generated D:1 map and replayed through the port to confirm that the hero
// reaches the staircase with nothing unported interrupting her. Which shop a
// seed produces, and what it stocked, was then read off the generated D:2. The
// seeds are otherwise arbitrary; a datetime is shared within a character
// because the date changes level generation, which would invalidate every path
// recorded against it.
//
// One candidate was dropped rather than recorded: seed 7612489, a wand shop
// with both negated rows, whose D:1 walk trips the `map_object()` recolour
// defect recorded in ROADMAP.md at step 7, drawing a potion in colour 8 where
// C draws 6 with the random-number stream matching exactly. That is a third
// independent reproduction of the same defect on a walk with no descent.
//
// What no segment covers, and why. The lighting store is shtypes[11] and its
// prob column is 0, so mkshop()'s walk can never reach it; only the special
// level loader, which this port does not have, builds one. Its nine iprobs[]
// entries are all negated itypes, which the delicatessen's segments below
// already drive through the same arm.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VALKYRIE_DATETIME = '20330607081011';
const SAMURAI_DATETIME = '20291112131415';

// The key bound to the `down` command, extcmdlist[]'s 0x3E row.
const DOWN_COMMAND = '>';
// win/tty/getline.c xwaitforspace() reads quitchars[], which starts with a
// space; this is the key that dismisses the arrival's `--More--`.
const DISMISS_MORE = ' ';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', pettype = 'none' }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype},!acoustics,!autopickup`,
        '',
    ].join('\n');
}

function descent({ seed, walk, datetime = VALKYRIE_DATETIME, ...character }) {
    return {
        seed,
        datetime,
        nethackrc: nethackrc(character),
        moves: `${walk}${DOWN_COMMAND}${DISMISS_MORE}`,
    };
}

// One character walks most of the matrix, so that the shop and its stock are
// the only things changing between its segments.
function valkyrie(fields) {
    return descent({ name: 'Shopper', role: 'Valkyrie', ...fields });
}

function samurai(fields) {
    return descent({
        name: 'Descend',
        role: 'Samurai',
        gender: 'male',
        align: 'lawful',
        pettype: 'dog',
        datetime: SAMURAI_DATETIME,
        ...fields,
    });
}

// shtypes[5], 5% of mkshop()'s roll. Its iprobs[] is 83 FOOD_CLASS, then four
// negated types: 5 -POT_FRUIT_JUICE, 4 -POT_BOOZE, 5 -POT_WATER, 3 -ICE_BOX.
export function loadDelicatessenRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Fifteen squares that reach all four negated rows in one shop:
            // two potions of water, a booze, a fruit juice and an ice box,
            // alongside the FOOD_CLASS majority.
            valkyrie({ seed: 7600129, walk: 'kkkklkkkkkkkhhj' }),
            // Six squares, every one of them the 83% FOOD_CLASS row. A port
            // that reached mksobj_at() where mkobj_at() belongs stocks a
            // potion here instead of a food ration.
            valkyrie({ seed: 7601690, walk: 'hhhhhhhhhkkkhkkkkkkhhhhhyyy' }),
            // Three mimics, one of them disguised by set_mimic_sym()'s
            // negated-itype arm as a potion of water.
            valkyrie({ seed: 7611655, walk: 'kkkkkklkllllllulllllkk' }),
            // A second role, race, gender, alignment and date, with a pet that
            // follows the hero down, so keepdogs() and the shop's stocking
            // draw from one stream in that order. Three boozes, a water and an
            // ice box.
            samurai({ seed: 7707238, walk: 'jlllljjjjjhhjjjjjjjjjb' }),
        ],
    }, 'delicatessen recipe');
}

// shtypes[7], 3% of mkshop()'s roll: 90 WAND_CLASS, 5 -LEATHER_GLOVES and
// 5 -ELVEN_CLOAK. mkroom.c mkshop() turns this row into a general store in a
// room of more than twenty squares, so every shop below is a small one.
export function loadWandShopRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Fifteen squares reaching both negated rows once each.
            valkyrie({ seed: 7604357, walk: 'llnnjjhjjjjnlnn' }),
            // Ten squares with two pairs of gloves and two elven cloaks, so
            // neither negated row is a single sample.
            valkyrie({ seed: 7609698, walk: 'kkllkkkkhkkkkkk' }),
            // Ten squares of wands and nothing else: the 90% row alone.
            valkyrie({ seed: 7602638, walk: 'lllljjjjjljjjl' }),
            // The second character, with both negated rows again.
            samurai({ seed: 7711278, walk: 'hjhhhhhhhhhhhhhhhhhhyh' }),
        ],
    }, 'wand shop recipe');
}

// shtypes[10], 2% of mkshop()'s roll: 70 VEGETARIAN_CLASS, then 20
// -POT_FRUIT_JUICE, 4 -POT_HEALING, 3 -POT_FULL_HEALING, 2
// -SCR_FOOD_DETECTION and 1 -LUMP_OF_ROYAL_JELLY.
export function loadHealthFoodStoreRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Forty-eight squares. Two of its tins keep a lichen corpsenm and
            // take a variety from set_tin_variety(obj, HEALTHY_TIN)'s search
            // loop; the others come out as spinach, which is that function's
            // other exit.
            valkyrie({ seed: 7605798, walk: 'llllllllllllllln' }),
            // Six squares, all of them shkveg()'s, so no negated row comes up
            // at all.
            valkyrie({ seed: 7615411, walk: 'hhkhhhkhhhhhhhb' }),
            // Nine squares holding the 2% scroll of food detection, the
            // narrowest share any row in the table carries but one.
            valkyrie({ seed: 7619046, walk: 'bhhhhhhhjjhhhb' }),
            // The second character, and the only segment that stocks the 1%
            // lump of royal jelly. Also two scrolls of food detection and two
            // potions of full healing.
            samurai({
                seed: 7710655, walk: 'lukkhhhhhhhhhhhhhhjjjjjhhhhhy',
            }),
        ],
    }, 'health food store recipe');
}

// makemon.c set_mimic_sym()'s two remaining shop arms, which take the mimic's
// appearance from the shop's stock without reaching assign_sym. Both were
// unported until these rows stocked, because both belong to them.
export function loadMimicStockRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The negated-itype arm: a mimic in a health food store wearing a
            // potion of healing, its 4% row.
            valkyrie({ seed: 7603320, walk: 'klllkkkkkkkkkkkll' }),
            // The VEGETARIAN_CLASS arm's rn2(2) coming up non-zero: a lump of
            // royal jelly.
            valkyrie({ seed: 7609270, walk: 'hhjjjhjjhjjjjjjjhhhhk' }),
            // The same rn2(2) coming up zero: a slime mold, which also takes
            // svc.context.current_fruit and sets flags.made_fruit. A second
            // mimic in the same shop is an ordinary strange object.
            valkyrie({ seed: 7815745, walk: 'jjlllulllllllkllllllllllllj' }),
        ],
    }, 'shop mimic stock recipe');
}

export async function runShopDeliWandHealthMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'delicatessen', recipe: loadDelicatessenRecipe() },
            { label: 'wand shop', recipe: loadWandShopRecipe() },
            {
                label: 'health food store',
                recipe: loadHealthFoodStoreRecipe(),
            },
            { label: 'shop mimic stock', recipe: loadMimicStockRecipe() },
        ],
        summaryLabel: 'SHOP DELI WAND HEALTH',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runShopDeliWandHealthMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `shop deli wand health: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
