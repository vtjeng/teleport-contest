#!/usr/bin/env node
// Fixed C-first Knight/Healer inputs vary current Constitution and cursed
// effects. Both recipes were recorded before comparing JavaScript.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { A_CON, SICK, TIMEOUT } from '../js/const.js';
import { acurr } from '../js/attrib.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const CURSED_HORN_CASES = ['knight', 'healer'];
export function loadCursedHornRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/apply.c/unicorn-horn-cursed-${name}-independent.session.json`,
        import.meta.url,
    )));
}
export async function verifyCursedHornSegment(input) {
    const name = CURSED_HORN_CASES.find(n => loadCursedHornRecipe(n).segments[0].seed === input.seed);
    const recorded = JSON.parse(readFileSync(new URL(
        `../recordings/apply.c/unicorn-horn-cursed-${name}-independent.session.json`,
        import.meta.url,
    ))).segments[0];
    let boundary;
    await runSegment({ ...input, recorderIsDst: recorded.recorderIsDst }, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    if (name === 'knight') {
        // C step28 draws rn2(11)=8 at apply.c2272: 20+8, then timeout
        // decrements once in the command turn. The live Constitution is 11.
        assert.equal(acurr(game, A_CON), 11);
        assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 27);
        assert.equal(game._pending_message, 'You feel deathly sick.');
        assert.ok(recorded.steps[28].rng.includes(
            'rn2(11)=8 @ use_unicorn_horn(apply.c:2272)',
        ));
    } else {
        // C steps24/26/28 choose confusion then vomiting twice, with no
        // Constitution duration draw. These neighboring arms stay unchanged.
        assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 0);
        assert.equal(recorded.steps.filter(step => step.rng.some(
            draw => draw.includes('use_unicorn_horn(apply.c:2272)'),
        )).length, 0);
    }
}
export async function runCursedHornMatrix() {
    return runFreshMatrix({
        entries: CURSED_HORN_CASES.map(name => ({
            label: name, recipe: loadCursedHornRecipe(name),
        })),
        verifySegment: verifyCursedHornSegment,
        summaryLabel: 'CURSED UNICORN HORN', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runCursedHornMatrix, 'cursed unicorn horn');
