#!/usr/bin/env node

// Record and replay potion.c confusion and booze through the quaff command.
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFUSION } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { POT_BOOZE } from '../js/objects.js';
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

// The independent seed was selected before inspection, without a seed scan.
// Beatitude alone varies these three recipes. Newlines dismiss the taste
// message and decline the type-naming prompt so the elapsed action completes.
export function loadQuaffBoozeRecipes() {
    return ['blessed', 'uncursed', 'cursed'].map((beatitude) => ({
        label: `quaff ${beatitude} booze`,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/potion.c/booze-${beatitude}.session.json`,
            import.meta.url,
        ), 'utf8')),
    }));
}

export async function verifyBoozeSegment(input) {
    if (!input.moves.includes('potion of booze')) return;
    let boundary;
    await runSegment(input, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, undefined);
    for (let object = game.invent; object; object = object.nobj)
        assert.notEqual(object.otyp, POT_BOOZE, 'dopotion consumed the dose');
    const blessed = input.moves.includes('blessed potion of booze');
    assert.equal(game.u.uprops[CONFUSION].intrinsic > 0, !blessed);
    assert.equal(game.multi, 0, 'the full delayed action completed');
    if (input.moves.includes('\u0017cursed')) {
        assert.equal(game.nomovemsg, null);
        assert.match(game._ttyToplines, /You awake with a headache\./u);
    }
}

export async function runQuaffConfusionMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'quaff confusion',
            recipe: loadQuaffConfusionRecipe(),
        }, ...loadQuaffBoozeRecipes()],
        summaryLabel: 'QUAFF CONFUSION AND BOOZE',
        verifySegment: verifyBoozeSegment,
        // Debug games leave saves in the recorder installation, so each must
        // run in a separately cleared chunk.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runQuaffConfusionMatrix, 'quaff confusion');
