#!/usr/bin/env node

// Run the checked-in matrix for the two shknam.c shtypes[] rows that share the
// shkbooks name list through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// The hero walks from the up staircase she starts on to D:1's down staircase
// and presses `>`. The second-hand bookstore takes 10% of mkshop()'s roll and
// rare books 3%, and the two rows are mirror images: the bookstore stocks
// 90% SCROLL_CLASS and 10% SPBOOK_CLASS, rare books the reverse. C prints
// "You descend the stairs." and stops at a `--More--` drawn over the level
// being left, so every segment ends with a space, which lets the D:2 map, its
// stocked shop and its shopkeeper through.
//
// Each segment is compared strictly: the whole of mklev()'s random-number
// stream for D:2, both screens and the cursor at each.
//
// What only a screen can catch. mkshobj_at()'s 3.6 tribute replaces one
// stocked square with a novel, and the title comes from a single rn2(41) over
// do_name.c sir_Terry_novels[]; a port that picked the wrong entry from the
// same draw would match the log exactly and print a different book. mkshop()'s
// type roll is one rnd(100) whatever it selects, so an off-by-one over
// shtypes[]'s prob column would put a different shop here while drawing the
// same number. And nameshk() derives the keeper's name and gender from
// ubirthday and m_id without drawing at all; both bookstore rows pass the same
// shkbooks array, which is why an Irish place name on the status line is
// evidence for either row.
//
// Choosing the seeds: paths were found by breadth-first search over the
// generated D:1 map and replayed through the port to confirm that the hero
// reaches the staircase with nothing unported interrupting her. Which shop a
// seed produces, and what it stocked, was then read off the generated D:2. The
// seeds are otherwise arbitrary; a datetime is shared within a character
// because the date changes level generation, which would invalidate every path
// recorded against it.
//
// What no segment covers, and why. The delicatessen, wand shop and health
// food store belong to scripts/run-shop-deli-wand-health.mjs, and the lighting
// store's prob column is 0, so mkshop() can never roll it. No segment stocks a
// second bookstore either: C sets
// svc.context.tribute.bookstock on the first novel it places and never places
// another, but mkshop() makes at most one shop per level and no recorded
// descent reaches a third level, so nothing can observe the flag's second
// reading. scripts/mkroom-shop.test.mjs pins that arm directly instead.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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

// shtypes[] row 2, 10% of mkshop()'s roll, whose iprobs[] is
// {90, SCROLL_CLASS}, {10, SPBOOK_CLASS}.
export function loadSecondHandBookstoreRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Eleven squares, every one of them the 90% SCROLL_CLASS row, plus
            // the tribute novel. A port that read the second iprobs[] pair
            // when it should have read the first stocks nothing here.
            valkyrie({ seed: 7500432, walk: 'lnjjjjjjjjn' }),
            // Twenty-nine squares that reach the 10% SPBOOK_CLASS row three
            // times, so both pairs of one iprobs[] are drawn in one segment.
            valkyrie({ seed: 7500472, walk: 'llllnnlllln' }),
        ],
    }, 'second-hand bookstore recipe');
}

// shtypes[] row 9, 3% of mkshop()'s roll, whose iprobs[] mirrors row 2:
// {90, SPBOOK_CLASS}, {10, SCROLL_CLASS}. Both rows name shkbooks, so a port
// that keyed the stock off the name list rather than the row would stock the
// two identically and fail against the segments above.
export function loadRareBooksRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Fourteen squares, twelve spellbooks and two scrolls, so the 10%
            // row is exercised alongside the 90% one.
            valkyrie({ seed: 7510158, walk: 'hyhhjjbjjjbjbjhhhhhhhh' }),
            // Seven squares, all of them spellbooks: the 10% row never comes
            // up, which is the mirror of the first bookstore segment.
            valkyrie({ seed: 7521343, walk: 'llkkkkkkuuukkkllkuu' }),
        ],
    }, 'rare books recipe');
}

// mkshobj_at()'s 3.6 tribute arm lands on one square of the level's first
// bookstore, chosen by stock_room()'s rnd(stockcount) before any square is
// stocked, and the novel's title costs its own rn2(41). Every segment in this
// file exercises the arm, since a fresh game's svc.context.tribute.bookstock
// is clear; the pair below is here because the special square falls at the two
// ends of the stocking loop, first square and last, where an off-by-one in the
// stockcount comparison shows up.
export function loadTributeNovelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The novel is the first of ten stocked squares in a rare books.
            valkyrie({ seed: 7520095, walk: 'kkyyhhhhbbhhb' }),
            // A shop mimic disguised as a scroll stands in a second-hand
            // bookstore, so set_mimic_sym()'s shop arm draws from the same
            // iprobs[] that stocked the room, and the novel sits mid-loop.
            valkyrie({ seed: 7500385, walk: 'hyykkkkkkkkkky' }),
            // Two mimics in one bookstore: one disguised as a spellbook from
            // the 10% row and one strange object, so the mimic's own mkobj()
            // runs on both classes this shop stocks.
            valkyrie({ seed: 7515159, walk: 'hhjjjjnjjnnjj' }),
        ],
    }, 'tribute novel recipe');
}

// A second role, race, gender, alignment and date, with a pet that follows the
// hero down. keepdogs() and the shop's stocking now draw from one stream in
// that order, so nothing above can be a property of one character's.
export function loadBookstoreSamuraiRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A second-hand bookstore of seven scrolls and the novel.
            samurai({ seed: 7502814, walk: 'hhhhhhhyyhhhhhhhh' }),
            // A rare books of eight spellbooks, one scroll and the novel.
            samurai({ seed: 7525740, walk: 'ulllukuullukuuululllll' }),
        ],
    }, 'bookstore samurai recipe');
}

export async function runShopBooksMatrix() {
    return runFreshMatrix({
        entries: [
            {
                label: 'second-hand bookstore',
                recipe: loadSecondHandBookstoreRecipe(),
            },
            {
                label: 'rare books',
                recipe: loadRareBooksRecipe(),
            },
            {
                label: 'tribute novel',
                recipe: loadTributeNovelRecipe(),
            },
            {
                label: 'bookstore samurai',
                recipe: loadBookstoreSamuraiRecipe(),
            },
        ],
        summaryLabel: 'SHOP BOOKS',
    });
}

runMatrixCli(import.meta.url, runShopBooksMatrix, 'shop books');
