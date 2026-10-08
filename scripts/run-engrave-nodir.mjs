#!/usr/bin/env node

// C-first E-command evidence for engrave.c's six NODIR wand effects.
// Seeds 1402801-1402810 were chosen before recording; C inventory observations
// corrected the stasis/detection wand letters when startup supplied an oil lamp.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { WAN_STASIS } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = ['stasis', 'light', 'secret-door-detection', 'create-monster',
    'wishing', 'enlightenment', 'blind-light', 'stasis-repeat', 'empty-stasis',
    'extended-light'];

export function loadEngraveNodirRecipes() {
    return cases.map(name => ({ label: `engrave ${name}`,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/engrave.c/nodir-${name}.session.json`, import.meta.url))) }));
}

export async function runEngraveNodirMatrix() {
    return runFreshMatrix({
        entries: loadEngraveNodirRecipes(),
        summaryLabel: 'ENGRAVE NODIR',
        chunkLimit: 1, // Each independent debug game gets a clean C installation.
        verifySegment: async input => {
            if (!input.moves.includes('wand of stasis')) return;
            await runSegment(input);
            let wand = game.invent;
            while (wand && wand.otyp !== WAN_STASIS) wand = wand.nobj;
            assert.ok(wand, 'the independently wished stasis wand remains carried');
            // zap.c consumes the charge before the text prompt. Canceling the
            // text twice still spends two charges and preserves level stasis.
            const empty = input.moves.includes('(0:0)');
            const uses = input.moves.match(/E[ef]/gu).length;
            assert.equal(wand.spe, empty ? 0 : 3 - uses);
            if (empty) assert.equal(game.level.flags.stasis_until, 0);
            else assert.ok(game.level.flags.stasis_until > game.moves);
        },
    });
}

runMatrixCli(import.meta.url, runEngraveNodirMatrix, 'engrave NODIR');
