#!/usr/bin/env node

// Run the checked-in matrix for mkroom.c mkshop() through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The hero walks from the up staircase she starts on to D:1's down staircase
// and presses `>`. mklev.c makelevel()'s shop test needs only `u_depth > 1`
// and rn2(2) < 3, so it fires on every D:2 with enough rooms; mkshop() then
// takes the first ordinary room with one door, no staircase and space beside
// the door, and rolls its type. C prints "You descend the stairs." and stops
// at a `--More--` drawn over the level being left, so every segment ends with
// a space, which lets the D:2 map, its stocked shop and its shopkeeper
// through.
//
// Each segment is compared strictly: the whole of mklev()'s random-number
// stream for D:2 including the shop's stock and its keeper's purse, both
// screens, and the cursor at each. Two things this slice can get wrong appear
// in no random-number log and only on the screen. mkshop()'s type roll is one
// rnd(100) whatever it selects, so an off-by-one over shtypes[]'s prob column
// shifts every shop type while drawing the same number; and nameshk() derives
// the keeper's name from ubirthday and m_id without drawing at all.
//
// Choosing the seeds: paths were found by breadth-first search over the
// generated D:1 map and replayed through the port to confirm that the hero
// reaches the staircase with nothing unported interrupting her. Which shop a
// seed produces was then read off the generated D:2. The seeds are otherwise
// arbitrary; a datetime is shared within a character because the date changes
// level generation, which would invalidate every path recorded against it.
//
// What no segment covers, and why. The two bookstore rows are covered by
// scripts/run-shop-books.mjs, and the delicatessen, wand shop and health food
// store by scripts/run-shop-deli-wand-health.mjs. A shop room that
// C rejects for its shape, and a level whose rooms all fail the search, draw
// nothing extra and are already covered by scripts/run-leave-level.mjs, whose
// seeds were chosen for having no eligible shop room.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const VALKYRIE_DATETIME = '20330607081011';

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

// One character walks most of the matrix, so that the shop type is the only
// thing changing between its segments.
function valkyrie(fields) {
    return descent({ name: 'Shopper', role: 'Valkyrie', ...fields });
}

export function loadShopDescentRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A general store, shtypes[]'s first row and 42% of the roll. Its
            // shopkeeper is the only one whose starting stock draws a random
            // number: shkinit() tests shknms == shkgeneral and spends rn2(5)
            // on whether he carries a scroll of charging. He does here.
            valkyrie({ seed: 7331075, walk: 'hhjjjnjjjj' }),
            // The same shop type on a differently shaped room, so a port that
            // had fixed one room's stocking order fails here.
            valkyrie({ seed: 7331196, walk: 'jjjjjjjjjn' }),
            // A used armor dealership, 14% of the roll, whose iprobs[] are
            // 90% armor and 10% weapons rather than the general store's single
            // RANDOM_CLASS row.
            valkyrie({ seed: 7330006, walk: 'hhhyhhyhhhh' }),
            // An antique weapons outlet, 5% of the roll, in a small room:
            // isbig() is false here, so the wand and spellbook override below
            // cannot be what produced the type.
            valkyrie({ seed: 7333046, walk: 'lnjjnllllnnjjn' }),
            // An unlit shop room, which is the only case that runs mkshop()'s
            // lighting loop over lx-1..hx+1 and ly-1..hy+1. The loop draws
            // nothing, so a wrong bound shows up as lit or dark cells on the
            // D:2 screen and nowhere else.
            valkyrie({ seed: 7332989, walk: 'lnnjjjjnnjjb' }),
            // A second unlit room, with a different shop type and a room small
            // enough that the border the loop lights is most of what it
            // touches.
            valkyrie({ seed: 7333496, walk: 'jbhhhhhyhhh' }),
            // A big room whose roll selected a wand or spellbook shop, which
            // mkroom.c:199-201 rewrites to a general store. The rewrite spends
            // no random number, so a port that skipped it would draw the same
            // stream and stock the wrong shop.
            valkyrie({ seed: 7332144, walk: 'llllulllnnllllll' }),
            // The same override on a smaller big room, and the one general
            // store in the matrix whose rn2(5) came up 0, so its shopkeeper
            // carries no scroll of charging.
            valkyrie({ seed: 7330791, walk: 'llllullllllllllllllljjll' }),
            // The control: seed 7331075's walk without the descent. Nothing
            // about the shop can reach it, which is what makes the first
            // segment attributable to the arrival alone.
            {
                seed: 7331075,
                datetime: VALKYRIE_DATETIME,
                nethackrc: nethackrc({ name: 'Shopper', role: 'Valkyrie' }),
                moves: 'hhjjjnjjjj',
            },
            // A second role, race, gender and alignment, with a pet that
            // follows the hero down: keepdogs() and the shop's stocking now
            // draw from the same stream, in that order. This general store's
            // rn2(5) also came up 0, so its keeper carries no scroll of
            // charging either.
            descent({
                seed: 7340099, name: 'Follower', role: 'Ranger', race: 'elf',
                gender: 'male', align: 'chaotic', pettype: 'dog',
                walk: 'klllullulllllllu',
            }),
            // A liquor emporium, 10% of the roll and the first shop here whose
            // stock is a single class other than the general store's
            // RANDOM_CLASS: iprobs[] is 100% POTION_CLASS. Its keeper's list
            // is shkliquors, which matches none of shkinit()'s four mongets()
            // tests, so he draws nothing after his purse and carries neither
            // the touchstone nor the charging scroll.
            valkyrie({ seed: 7330325, walk: 'njjlnljjll' }),
            // A second liquor emporium in a wider room, so the potion stock is
            // twelve squares rather than six.
            valkyrie({ seed: 7364483, walk: 'hhhhhhhhhhhhhhj' }),
            // A jewelers, 3% of the roll, whose iprobs[] are the first in this
            // matrix to reach three entries: 85% rings, 10% gems, 5% amulets.
            // This room stocks all three. The keeper's shkrings list is the
            // only one that reaches shkinit()'s TOUCHSTONE arm, and its
            // rn2(2) came up non-zero here, so he carries a charging scroll
            // as well.
            valkyrie({ seed: 7385612, walk: 'jhhhhhhhhhhhhh' }),
            // A second jewelers, where that rn2(2) came up 0: the touchstone
            // stands alone and every later draw in the shop moves with it.
            valkyrie({ seed: 7360485, walk: 'bbhhhhbbbhhhhy' }),
            // A hardware store, 3% of the roll and the one shop whose keeper's
            // name costs a random number: nameshk()'s shktools arm draws
            // rn2(40) instead of indexing by name_wanted. The shkinit() chain
            // short-circuits on its first clause here, so the charging scroll
            // arrives with no rn2 at all.
            valkyrie({ seed: 7380123, walk: 'kkllululuullll' }),
            // A second hardware store, in the largest shop room in the matrix
            // at thirty-two stocked squares, so the tool stock is long enough
            // for a wrong get_shop_item() walk to show.
            valkyrie({ seed: 7372938, walk: 'ljjjjjjjjjjhb' }),
        ],
    }, 'shop descent recipe');
}

// A third role on a different date, kept in its own recipe because it shares
// neither. runFreshMatrix() chunks a longer recipe into recorder runs of ten
// itself, so the recipe above is not split for that reason.
export function loadShopDescentSamuraiRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A used armor dealership in a big room. isbig() is true and the
            // rolled symb is ARMOR_CLASS, so the override's second test is
            // what has to fail; a port that overrode on room size alone would
            // turn this into a general store.
            descent({
                seed: 7350362, name: 'Descend', role: 'Samurai',
                gender: 'male', align: 'lawful', datetime: '20291112131415',
                walk: 'hhhhbhhhhhhhhh',
            }),
            // An antique weapons outlet for the same character, so the two
            // shop types are compared against one starting inventory.
            descent({
                seed: 7351399, name: 'Descend', role: 'Samurai',
                gender: 'male', align: 'lawful', datetime: '20291112131415',
                walk: 'jnlllllllnlllnllluuuukkkkkkkku',
            }),
        ],
    }, 'shop descent samurai recipe');
}

export async function runShopDescentMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'shop descent', recipe: loadShopDescentRecipe() },
            {
                label: 'shop descent samurai',
                recipe: loadShopDescentSamuraiRecipe(),
            },
        ],
        summaryLabel: 'SHOP DESCENT',
    });
}

runMatrixCli(import.meta.url, runShopDescentMatrix, 'shop descent');
