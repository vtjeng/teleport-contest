#!/usr/bin/env node
// Independent C-first eyewear and set_bc witnesses. The C recorder fixed
// wish letters and menu/pager inputs before JavaScript comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BC_CHAIN, BLINDED, OBJ_INVENT, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['eyewear-held-towel', 'You can see again.'],
    ['eyewear-apply-blindfold', 'You can see again.'],
    ['eyewear-blind-punishment', 'You are being punished for your misbehavior!'],
    ['eyewear-punished-potion', 'A cloud of darkness falls upon you.'],
    ['eyewear-punished-carried', "You can't see any more."],
    ['eyewear-eyes-regain-remove', 'You can see!'],
    ['eyewear-born-blind-eyes', 'For the first time in your life, you can see!'],
    ['eyewear-takeoffall', 'You finish disrobing.'],
    ['eyewear-cursed-towel-removal', 'You push your blindfold off.'],
    ['eyewear-nymph-forced-removal', 'The water nymph stole a blindfold.'],
];
const witnesses = CASES.map(([label, message]) => ({ label, message,
    recipe: JSON.parse(readFileSync(new URL(
        `../recipes/do_wear.c/${label}.session.json`, import.meta.url))),
}));
export async function runEyewearBlindnessMatrix() {
    return runFreshMatrix({ entries: witnesses, chunkLimit: 1,
        summaryLabel: 'EYEWEAR BLINDNESS',
        verifySegment: async (segment) => {
            let boundary;
            const replay = await runSegment(segment, {
                onBoundary: error => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const witness = witnesses.find(({ recipe }) =>
                recipe.segments.some(input => input.seed === segment.seed
                    && input.moves === segment.moves));
            assert.ok(replay.getScreens().some(screen => screen.includes(witness.message)),
                'production commands must reach the intended C sight-change arm');
            if (witness.label === 'eyewear-held-towel')
                assert.equal(game.uwep, null, 'wearing releases the held towel');
            if (witness.label.includes('punish')) {
                assert.ok(game.uball && game.uchain);
                assert.ok(Number.isInteger(game.u.bglyph));
                assert.ok(Number.isInteger(game.u.cglyph));
            }
            if (witness.label === 'eyewear-punished-carried') {
                assert.equal(game.uball.where, OBJ_INVENT);
                assert.equal(game.u.bc_felt, BC_CHAIN);
            }
            if (witness.label === 'eyewear-punished-potion')
                assert.ok(game.u.uprops[BLINDED].intrinsic & TIMEOUT);
            if (witness.label === 'eyewear-born-blind-eyes')
                assert.equal(game.u.uroleplay.blind, false, 'Eyes clears the source conduct flag');
            if (witness.label.includes('eyes')
                || witness.label === 'eyewear-held-towel'
                || witness.label === 'eyewear-apply-blindfold'
                || witness.label === 'eyewear-takeoffall'
                || witness.label === 'eyewear-cursed-towel-removal'
                || witness.label === 'eyewear-nymph-forced-removal')
                assert.equal(game.ublindf, null, 'the removal command completes Blindf_off');
        },
    });
}
runMatrixCli(import.meta.url, runEyewearBlindnessMatrix, 'eyewear blindness');
