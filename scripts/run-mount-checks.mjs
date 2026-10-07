#!/usr/bin/env node
// steed.c:mount_steed debug wounded-leg healing and refusal entry points.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WOUNDED_LEGS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MOUNT_CHECK_CASES = ['heal', 'decline'];
export function loadMountCheckRecipe(name) {
    return validateCleanRecipe(JSON.parse(fs.readFileSync(new URL(
        `../recipes/steed.c/mount-wounded-${name}.session.json`, import.meta.url,
    ), 'utf8')), `mount wounded ${name}`);
}
async function verifyMountCheckSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, null);
    const wounded = game.u.uprops[WOUNDED_LEGS];
    // The final heal confirmation is y for the successful mounted case.
    const healed = segment.moves.includes('ly y');
    if (healed) {
        assert.equal(wounded.intrinsic, 0);
        assert.equal(wounded.extrinsic, 0);
        assert.ok(game.u.usteed);
        assert.equal(game.u.usteed.mx, game.u.ux);
        assert.equal(game.u.usteed.my, game.u.uy);
        assert.equal(game.level.monsters[game.u.ux][game.u.uy], null);
    } else {
        assert.ok(wounded.intrinsic > 0);
        assert.equal(game.u.usteed, null);
    }
}
export async function runMountCheckMatrix() {
    return runFreshMatrix({
        entries: MOUNT_CHECK_CASES.map(name => ({
            label: name, recipe: loadMountCheckRecipe(name),
        })),
        verifySegment: verifyMountCheckSegment,
        summaryLabel: 'STEED.C MOUNT CHECKS', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runMountCheckMatrix, 'mount checks');
