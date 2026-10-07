#!/usr/bin/env node
// Independent do.c ordinary boulder floor witnesses for the two drop callers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { BOULDER } from '../js/objects.js';
import { transparencyIndexViews } from '../js/vision.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const BOULDER_DROP_CASES = ['heavy-wish', 'giant-manual'];
export function loadBoulderDropRecipe(name) {
    return validateCleanRecipe(JSON.parse(fs.readFileSync(new URL(
        `../recipes/do.c/boulder-floor-${name}.session.json`, import.meta.url,
    ), 'utf8')), `boulder floor ${name}`);
}
async function verifyBoulderDropSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, null);
    const { ux, uy } = game.u;
    let boulder = game.level.objects[ux][uy];
    while (boulder && boulder.otyp !== BOULDER) boulder = boulder.nexthere;
    assert.ok(boulder, 'the dry floor owns the dropped boulder');
    assert.equal(boulder.where, OBJ_FLOOR);
    assert.equal(boulder.ox, ux);
    assert.equal(boulder.oy, uy);
    // vision.c:block_point makes this square opaque; viz_clear is module-owned.
    assert.equal(transparencyIndexViews()[uy][ux], 0);
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.notEqual(obj.otyp, BOULDER);
}
export async function runBoulderDropMatrix() {
    return runFreshMatrix({
        entries: BOULDER_DROP_CASES.map(name => ({
            label: name, recipe: loadBoulderDropRecipe(name),
        })),
        verifySegment: verifyBoulderDropSegment,
        summaryLabel: 'DO.C BOULDER FLOOR', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runBoulderDropMatrix, 'boulder floor');
