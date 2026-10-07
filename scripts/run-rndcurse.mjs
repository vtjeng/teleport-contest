#!/usr/bin/env node

// sit.c rndcurse active monster-spell and prayer entries, independently
// selected before JS comparison. Seed7135101 reaches the lich spell with
// blindness or invulnerability set from the observed C wizard menu. The
// predetermined C-only prayer range7135202..7135211 yielded three curse
// witnesses; retain the first two completed first-prayer cases7135203/04.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['lich-blind', 'lich-visible', 'prayer-first', 'prayer-variation'];

export function loadRndcurseRecipe(name) {
    assert.ok(CASES.includes(name));
    return validateCleanRecipe(JSON.parse(fs.readFileSync(new URL(
        `../recipes/sit.c/rndcurse-${name}-b135.session.json`, import.meta.url,
    ))), `rndcurse ${name}`);
}

export async function runRndcurseMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: name, recipe: loadRndcurseRecipe(name) })),
        summaryLabel: 'RANDOM CURSE',
        chunkLimit: 1,
        verifySegment: async segment => {
            await runSegment(segment);
            let cursed = 0;
            for (let obj = game.invent; obj; obj = obj.nobj)
                if (obj.cursed) ++cursed;
            assert.ok(cursed > 0, 'production caller applies BUC changes to live inventory');
            assert.ok(!game.unported.has('sit.c rndcurse'));
            // C's rnd(14) chooses item1 (the blessed starting quarterstaff)
            // for both lich variants and prayer7135203. Prayer7135204 picks
            // 11,13,4 and therefore leaves that weapon blessed.
            assert.equal(Boolean(game.uwep.blessed), segment.seed === 7135204);
        },
    });
}

runMatrixCli(import.meta.url, runRndcurseMatrix, 'rndcurse');
