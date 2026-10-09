#!/usr/bin/env node
// Independent role variations reach Wizard1 through level teleportation.
// Seeds 16591013 and 16591019 were chosen before JS comparison; the source map return
// selection excludes transparent cells from hell_tweaks protection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SPE_BOOK_OF_THE_DEAD } from '../js/objects.js';
import { PM_WIZARD_OF_YENDOR } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function recipes() {
    return ['knight', 'valkyrie'].map(name => {
        const path = new URL(`../recipes/sp_lev.c/wizard1-map-mask-${name}.session.json`, import.meta.url);
        return { label: name, recipe: validateCleanRecipe(
            JSON.parse(readFileSync(path, 'utf8')), path.pathname,
        ) };
    });
}

async function verifyWizardTower(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.deepEqual(game.u.uz, game.wiz1_level);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);
    // dat/wizard1.lua creates the Wizard and Book at the tower center.
    let wizardCount = 0, bookCount = 0;
    for (let m = game.level.monlist; m; m = m.nmon)
        if (m.data.pmidx === PM_WIZARD_OF_YENDOR) ++wizardCount;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === SPE_BOOK_OF_THE_DEAD) ++bookCount;
    assert.equal(wizardCount, 1);
    assert.equal(bookCount, 1);
}

export function runWizardTowerMapMatrix() {
    return runFreshMatrix({ entries: recipes(), chunkLimit: 1,
        summaryLabel: 'WIZARD TOWER MAP', verifySegment: verifyWizardTower });
}
runMatrixCli(import.meta.url, runWizardTowerMapMatrix, 'wizard tower map');
