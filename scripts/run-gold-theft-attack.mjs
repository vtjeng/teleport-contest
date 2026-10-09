#!/usr/bin/env node
// Independent uhitm.c:mhitm_ad_sgld entries in all three attack directions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LEPRECHAUN } from '../js/monsters.js';
import { OBJ_MINVENT, Upolyd } from '../js/const.js';
import { findgold } from '../js/steal.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadGoldTheftCases() {
    return ['hero-positive', 'hero-hostile-variation', 'hero-repeat',
        'incoming-same-species', 'monster-pair'].map(name => {
        const path = new URL(`../recipes/uhitm.c/gold-theft-${name}.session.json`, import.meta.url);
        return { name,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}

export async function verifyGoldTheftSegment(segment) {
    const entry = loadGoldTheftCases().find(({ recipe }) =>
        recipe.segments[0].seed === segment.seed
        && recipe.segments[0].moves === segment.moves);
    assert.ok(entry);
    let boundary;
    const result = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = result.getScreens().join('\n');
    if (entry.name === 'monster-pair') {
        assert.equal(Upolyd(game.u), false);
        assert.equal(Boolean(findgold(game.invent)), false);
        assert.match(screens, /leprechaun steals some gold from the leprechaun\./u);
        assert.match(screens, /leprechaun suddenly disappears!/u);
        let mergedGold = false;
        for (let mon = game.level.monlist; mon; mon = mon.nmon) {
            const gold = findgold(mon.minvent);
            if (!gold) continue;
            assert.equal(gold.where, OBJ_MINVENT);
            assert.equal(gold.ocarry, mon);
            // makemon.c:796–797 gives a level-one leprechaun d(1,30)
            // initial gold. A larger stack proves add_to_minv merged theft.
            mergedGold ||= gold.quan > 30;
        }
        assert.equal(mergedGold, true);
        return;
    }
    assert.equal(game.u.umonnum, PM_LEPRECHAUN);
    assert.equal(Upolyd(game.u), true);
    // Both C-only first attacks report acquisition (steps107/105). Startup
    // gold was dropped beforehand, so any purse proves positive transfer.
    assert.match(screens, /Your purse feels heavier\./u);
    assert.ok(findgold(game.invent).quan > 0);
    if (entry.name === 'incoming-same-species') {
        assert.match(screens, /The leprechaun hits!/u);
        // Independent C111 completes the incoming same-mlet hit at 13/14 HP.
        assert.equal(game.u.mh, 13);
        assert.equal(game.u.mhmax, 14);
    }
}

export function runGoldTheftMatrix() {
    return runFreshMatrix({
        entries: loadGoldTheftCases().map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'GOLD THEFT ATTACK', chunkLimit: 1,
        verifySegment: verifyGoldTheftSegment,
    });
}

runMatrixCli(import.meta.url, runGoldTheftMatrix, 'gold theft attack');
