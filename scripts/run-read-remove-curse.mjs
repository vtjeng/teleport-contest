#!/usr/bin/env node

// Record and replay read.c's cursed remove-curse scroll branch.
// A debug-mode Valkyrie wishes for a cursed scroll of remove curse and reads
// it. The cursed branch prints two messages ("You feel like someone is helping
// you." and "The scroll disintegrates.") and skips the invent-traversal loop.
// The recipe includes one space to dismiss the first --More-- (the
// concatenated "You read the scroll.  You feel like..."), then
// seffect_remove_curse() sets "The scroll disintegrates." as a pending
// message. docall()'s flush_screen(1) triggers the --More-- for that pending
// message, which the second MORE dismisses. The player then sees the "Call a
// scroll labeled PRATYAVAYAH:" prompt and presses ESC to dismiss it. useup()
// consumes the scroll.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const WIZWISH = '\x17'; // cmd.c's C('w') binding for wiz_wish().
const WAIT = '.';
const READ = 'r';
const SCROLL_SLOT = 'e'; // wished scroll follows Valkyrie's four starting items
const MORE = ' ';

function wish(objectName) {
    return `${WIZWISH}${objectName}\n`;
}

// Seed chosen independently; the hero is not confused or hallucinating, so the
// message is the default "like someone is helping you." branch.
export function loadReadRemoveCurseRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 7712309,
            datetime: '20310405120000',
            nethackrc: [
                'OPTIONS=name:CursedScroll,role:Valkyrie,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!autopickup,!acoustics',
                '',
            ].join('\n'),
            // Wait, wish for a cursed remove-curse scroll, then read it.
            // The first MORE dismisses the concatenated "You read the
            // scroll.  You feel like someone is helping you.--More--".
            // seffect_remove_curse() sets "The scroll disintegrates." as a
            // pending message. docall()'s flush_screen(1) triggers its
            // --More--, which the second MORE dismisses. The ESC cancels
            // the "Call a scroll labeled PRATYAVAYAH:" prompt. useup()
            // then consumes the scroll.
            moves: `${WAIT}${wish('cursed scroll of remove curse')}`
                + `${READ}${SCROLL_SLOT}${MORE}${MORE}\x1b`,
        }],
    }, 'read cursed remove-curse recipe');
}

export async function runReadRemoveCurseMatrix() {
    // The differential PRNG matches, and screens match through the 35th of
    // C's 36. The 36th C screen ("The scroll disintegrates.--More--") is a
    // pending message that docall()'s getlin() would have triggered; the
    // unported docall() throws before that happens. The focused test in
    // read-remove-curse.test.mjs verifies the boundary and pending message.
    const result = await runFreshMatrix({
        entries: [{
            label: 'cursed remove-curse scroll reading',
            recipe: loadReadRemoveCurseRecipe(),
        }],
        summaryLabel: 'READ CURSED REMOVE CURSE',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runReadRemoveCurseMatrix, 'read cursed remove curse');
