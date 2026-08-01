#!/usr/bin/env node

// Run the checked-in matrix for makemon.c set_mimic_sym()'s shop arm through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The hero walks from the up staircase she starts on to D:1's down staircase
// and presses `>`. shknam.c mkshobj_at() replaces a stocked square with a
// mimic on rn2(100) < depth(), so 2% of a D:2 shop's squares hold one and
// about a third of D:2 shops hold at least one; makemon() then calls
// set_mimic_sym(), whose `rt >= SHOPBASE` arm decides what the mimic looks
// like. C prints "You descend the stairs." and stops at a `--More--` drawn
// over the level being left, so every segment ends with a space, which lets
// the D:2 map and the disguised mimic on it through.
//
// Each segment is compared strictly: the whole of mklev()'s random-number
// stream for D:2, both screens and the cursor at each. The arm's own draws
// are one rn2(10) per shop mimic, plus the rnd(100) that get_shop_item()
// spends when that first draw falls below the depth, plus the rn2(15) a
// general store's RANDOM_CLASS stock costs on top. What the log cannot catch
// is the disguise itself: a mimic that drew the same numbers and settled on
// the wrong object class is a one-cell screen difference and nothing else,
// which is why every segment below runs to the drawn D:2 map.
//
// Choosing the seeds: candidates were found by breadth-first search over the
// generated D:1 map for a walk to the down staircase, replayed through the
// port to confirm that nothing unported interrupts it, and then filtered on
// the D:2 shop holding a mimic. Which arm each mimic took was read off its
// mappearance afterwards. The seeds are otherwise arbitrary; a datetime is
// shared within a character because the date changes level generation, which
// would invalidate every path recorded against it.
//
// What no segment covers, and why. C's two remaining arms set the appearance
// from the shop's stock without reaching assign_sym: a negative iprobs[] itype
// and the health food store's VEGETARIAN_CLASS. Both belong to shop rows that
// js/shknam.js SUPPORTED_SHOPS refuses outright, so no recording can reach
// them until those rows stock. js/makemon_create.js refuses each by name and
// scripts/makemon-create.test.mjs pins the refusals.
//
// No segment puts a jewelers or a hardware store on the stock arm either. Each
// is 3% of mkshop()'s roll and the arm itself is 2 draws in 10, so the pair is
// rare: over 8,500 scanned seeds the only candidate was seed 7411559, whose
// D:1 walk trips the `map_object()` defect recorded in ROADMAP.md and misses a
// potion's colour before the descent begins. It was dropped rather than
// recorded against the wrong colour.

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

// One character walks most of the matrix, so that the shop and its mimic are
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

// The arm C takes when rn2(10) reaches the hero's depth, which at depth two is
// eight draws in ten: the mimic becomes S_MIMIC_DEF and assign_sym turns that
// into a strange object. get_shop_item() is never called, so the shop's own
// stock table cannot be what produced the disguise.
export function loadShopMimicStrangeObjectRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A general store, the commonest shop at 42% of mkshop()'s roll.
            valkyrie({ seed: 7412011, walk: 'jnnnjjjhjjhb' }),
            // The same arm in a used armor dealership, so the disguise cannot
            // have come from the room's shop type.
            valkyrie({ seed: 7410325, walk: 'hhhykkkkkkkhyy' }),
            // Two mimics in one general store. Each spends its own rn2(10),
            // so a port that drew once for the room would diverge here and
            // nowhere above.
            valkyrie({ seed: 7410411, walk: 'hhyhkklkkkkkll' }),
            // A liquor emporium, whose keeper draws nothing after his purse,
            // so the mimic's rn2(10) is the only draw between the stock and
            // the map.
            valkyrie({ seed: 7411345, walk: 'yhbbjjjllllljjljjhhb' }),
            // A hardware store holding two, the fourth shop type here.
            valkyrie({ seed: 7410763, walk: 'jbjnlljjjjjhjjhhhjhhhkhhkhhhhhhyy' }),
        ],
    }, 'shop mimic strange-object recipe');
}

// The arm C takes when rn2(10) falls below the hero's depth: get_shop_item()
// picks a class from the shop's own iprobs[], and assign_sym turns that class
// into a concrete object through mkobj(). Two draws in ten at depth two, so
// each of these seeds is the rarer half of the test.
export function loadShopMimicStockRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A used armor dealership whose walk landed on the 10% WEAPON_CLASS
            // row rather than the 90% ARMOR_CLASS one, so a port that read only
            // the first iprobs[] pair fails here.
            valkyrie({ seed: 7412050, walk: 'yhhkkkkkkkkkkhhhhhhhhhhhhb' }),
            // A liquor emporium, whose single iprobs[] row is 100% POTION_CLASS.
            valkyrie({ seed: 7411995, walk: 'jjjhhjjjjhhhhhh' }),
            // An antique weapons outlet on its 90% WEAPON_CLASS row.
            valkyrie({ seed: 7412408, walk: 'kyyykkkkhkkkyhy' }),
            // A second used armor dealership holding one mimic on each arm, so
            // the two disguises are drawn from one stream in source order.
            valkyrie({ seed: 7432945, walk: 'hyhhjjjjjllljjjjjjhhk' }),
        ],
    }, 'shop mimic stock recipe');
}

// A general store's iprobs[] is one RANDOM_CLASS row, which is the class C
// rerolls: `s_sym = syms[rn2(SIZE(syms) - 2) + 2]` costs a third draw and
// skips syms[]'s two MAXOCLASSES entries, so a shop mimic can never be
// furniture however the reroll lands.
export function loadShopMimicRerollRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The reroll landed on WEAPON_CLASS.
            valkyrie({ seed: 7412748, walk: 'hhhhkkkllklkkkhhhhhyy' }),
            // On COIN_CLASS, which assign_sym answers with GOLD_PIECE directly
            // instead of calling mkobj().
            valkyrie({ seed: 7412091, walk: 'yhyyhhjjjjjhjjjhjjjhhjjhhh' }),
            // On SCROLL_CLASS, which does call mkobj() and so draws the
            // scroll's own type inside the disguise.
            valkyrie({ seed: 7410313, walk: 'kkhhkkllllllllljllljllllll' }),
            // One general store holding both arms: a strange object from the
            // first mimic and a rerolled tool from the second.
            valkyrie({ seed: 7411701, walk: 'lllljjjjjjjjllllllllllllllnn' }),
        ],
    }, 'shop mimic reroll recipe');
}

// A second role, race, gender, alignment and date, with a pet that follows the
// hero down. keepdogs() and the shop's stocking now draw from one stream in
// that order, so nothing above can be a property of one character's.
export function loadShopMimicSamuraiRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A general store holding three mimics: one on the stock arm and
            // two strange objects, in that order.
            samurai({ seed: 7420079, walk: 'kkllllljjllluuu' }),
            // A liquor emporium holding two, both strange objects.
            samurai({ seed: 7421647, walk: 'jjjjjjjjjjnnn' }),
            // A general store holding one, the shortest walk in the matrix.
            samurai({ seed: 7420985, walk: 'yhhhkhhhhhhy' }),
        ],
    }, 'shop mimic samurai recipe');
}

export async function runShopMimicMatrix() {
    return runFreshMatrix({
        entries: [
            {
                label: 'shop mimic strange object',
                recipe: loadShopMimicStrangeObjectRecipe(),
            },
            {
                label: 'shop mimic stock',
                recipe: loadShopMimicStockRecipe(),
            },
            {
                label: 'shop mimic reroll',
                recipe: loadShopMimicRerollRecipe(),
            },
            {
                label: 'shop mimic samurai',
                recipe: loadShopMimicSamuraiRecipe(),
            },
        ],
        summaryLabel: 'SHOP MIMIC',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runShopMimicMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`shop mimic: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
