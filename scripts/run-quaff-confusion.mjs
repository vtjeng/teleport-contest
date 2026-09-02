#!/usr/bin/env node

// Record and replay potion.c peffect_confusion() through the quaff command.
// Every segment contains replay inputs only; runFreshMatrix() records new C
// output in an isolated workspace before comparing the JavaScript port.
//
// The first segment covers a newly confused hero and the cursed potion's
// rn1(7, 24) timeout. The second prepares two blessed potions before drinking
// either one: the first dose starts confusion, and the second reaches the
// already-confused arm that increments potion_nothing and adds rn1(7, 8).
// Seed 812302 starts on a level without monsters, so each dose reaches the
// next observable command boundary without an unrelated monster-action stop.
//
// peffect_confusion() also prints alternate feedback when Hallucination is
// active. No ported command can establish that state yet; QUALITY.json tracks
// its fresh-differential obligation under
// quaff-confusion-hallucinating-feedback.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203091500';
const WIZWISH = '\x17'; // cmd.c's C('w') binding for wiz_wish().
const QUAFF = 'q';
const POTION_SLOT = 'o';

function nethackrc(name) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug,pettype:none,!autopickup,!debug_mongen',
        '',
    ].join('\n');
}

function segment(name, moves) {
    return {
        seed: 812302,
        datetime: DATETIME,
        nethackrc: nethackrc(name),
        moves,
    };
}

function wish(potion) {
    return `${WIZWISH}${potion}\n`;
}

export function loadQuaffConfusionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            segment(
                'ConfCursed',
                `.${wish('cursed potion of confusion')}`
                + `${QUAFF}${POTION_SLOT}`,
            ),
            segment(
                'ConfAgain',
                `.${wish('blessed potion of confusion')}`
                + `${wish('blessed potion of confusion')}`
                + `${QUAFF}${POTION_SLOT}${QUAFF}${POTION_SLOT}`,
            ),
        ],
    }, 'quaff confusion recipe');
}

export async function runQuaffConfusionMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'quaff confusion',
            recipe: loadQuaffConfusionRecipe(),
        }],
        summaryLabel: 'QUAFF CONFUSION',
        // Debug games leave saves in the recorder installation, so each must
        // run in a separately cleared chunk.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runQuaffConfusionMatrix, 'quaff confusion');
