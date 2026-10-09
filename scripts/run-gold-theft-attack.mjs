#!/usr/bin/env node
// Independent uhitm.c:mhitm_ad_sgld hero entry. Monster-turn recipes remain
// blocked on the separately owned monmove.c:distfleeck caller admission.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LEPRECHAUN } from '../js/monsters.js';
import { Upolyd } from '../js/const.js';
import { findgold } from '../js/steal.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadGoldTheftCases() {
    return ['hero-positive', 'hero-hostile-variation'].map(name => {
        const path = new URL(`../recipes/uhitm.c/gold-theft-${name}.session.json`, import.meta.url);
        return { name,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}

export async function verifyGoldTheftSegment(segment) {
    let boundary;
    const result = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, PM_LEPRECHAUN);
    assert.equal(Upolyd(game.u), true);
    // Both C-only first attacks report acquisition (steps107/105). Startup
    // gold was dropped beforehand, so any purse proves positive transfer.
    assert.match(result.getScreens().join('\n'), /Your purse feels heavier\./u);
    assert.ok(findgold(game.invent).quan > 0);
}

export function runGoldTheftMatrix() {
    return runFreshMatrix({
        entries: loadGoldTheftCases().map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'GOLD THEFT ATTACK', chunkLimit: 1,
        verifySegment: verifyGoldTheftSegment,
    });
}

runMatrixCli(import.meta.url, runGoldTheftMatrix, 'gold theft attack');
