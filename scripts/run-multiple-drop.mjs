#!/usr/bin/env node
// do.c multiple drop: independently chosen consecutive seeds exercise source
// menu styles, counted splitting, filters, pickup history and confirmation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CORPSE, DART } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MULTIPLE_DROP_CASES = [
    'full-autoall', 'full-manual-count', 'traditional', 'combination',
    'paranoid-decline', 'full-cancel', 'unsafe-corpse-decline',
    'full-filtered', 'justpicked-count', 'paranoid-accept', 'paranoid-quit',
    'extcmd-autoall', 'partial-manual', 'full-A-alone', 'full-empty-inventory',
    'full-hint-repeat', 'traditional-filtered',
];
export function loadMultipleDropRecipe(name) {
    return validateCleanRecipe(JSON.parse(fs.readFileSync(new URL(
        `../recipes/do.c/multiple-drop-${name}.session.json`, import.meta.url,
    ), 'utf8')), `multiple drop ${name}`);
}
function floorPile() {
    const items = [];
    for (let obj = game.level.objects[game.u.ux]?.[game.u.uy]; obj; obj = obj.nexthere)
        items.push(obj);
    return items;
}
export async function verifyMultipleDropSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, null);
    const pile = floorPile();
    if (segment.nethackrc.includes('MultiDrop1,')) {
        // u_init.c quivers the Tourist's darts; menudrop_split drops only three.
        assert.equal(pile.filter(obj => obj.otyp === DART).reduce((n, obj) => n + obj.quan, 0), 3);
        assert.ok(game.uquiver?.quan > 0);
    }
    if (segment.nethackrc.includes('CorpseDrop,')) {
        let corpse = game.invent;
        while (corpse && corpse.otyp !== CORPSE) corpse = corpse.nobj;
        assert.ok(corpse);
        assert.equal(pile.length, 0);
    }
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.equal(Boolean(obj.bypass), false);
}
export async function runMultipleDropMatrix() {
    return runFreshMatrix({
        entries: MULTIPLE_DROP_CASES.map(name => ({ label: name, recipe: loadMultipleDropRecipe(name) })),
        verifySegment: verifyMultipleDropSegment,
        summaryLabel: 'DO.C MULTIPLE DROP', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runMultipleDropMatrix, 'multiple drop');
