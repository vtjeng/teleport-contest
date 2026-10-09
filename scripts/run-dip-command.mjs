#!/usr/bin/env node
// Seeds/date were fixed before recording, without a scan. C-first observations
// corrected an extra starting lamp's inventory letters and the grease pager.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { DAGGER, POT_ACID, SPEAR, TOWEL } from '../js/objects.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    { id: 'acid-dip-spear', type: SPEAR, quantity: 1, corrosion: 1 },
    { id: 'acid-dip-greased-daggers', type: DAGGER, quantity: 2, corrosion: 0 },
].map(c => ({ ...c, recipe: JSON.parse(readFileSync(new URL(
    '../recipes/potion.c/' + c.id + '.session.json', import.meta.url))) }));

async function verifyAcidDip(segment) {
    const expected = cases.find(c => c.recipe.segments[0].seed === segment.seed);
    await runSegment(segment);
    const inventory = [];
    for (let obj = game.invent; obj; obj = obj.nobj) inventory.push(obj);
    const target = inventory.find(obj => obj.otyp === expected.type);
    assert.ok(target, 'the dipped target remains in inventory');
    // trap.c:erode_obj corrodes intact ungreased gear once; EF_GREASE leaves
    // corrosion unchanged and rn2(2)=0 dissolves this independent case's grease.
    assert.equal(target.quan, expected.quantity);
    assert.equal(target.oeroded2, expected.corrosion);
    assert.ok(!target.greased);
    // potion.c:2640 calls poof for both ER_DAMAGED and ER_GREASED results.
    assert.ok(!inventory.some(obj => obj.otyp === POT_ACID));
}

export async function runDipCommandMatrix() {
    return runFreshMatrix({
        entries: cases.map(c => ({ label: c.id, recipe: c.recipe })),
        summaryLabel: 'ACID DIP',
        verifySegment: verifyAcidDip,
        chunkLimit: 1, // Debug termination saves; isolate each source case.
    });
}

// potion.c:dodip2341: both roles accept a pool's canonical y_n prompt.
// Role changes the surviving inventory and the subsequent liquid effects.
export async function runPoolDipCommandMatrix() {
    const roles = ['barbarian', 'knight'];
    return runFreshMatrix({
        entries: roles.map(role => ({ label: `pool towel ${role}`,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
                `../recipes/potion.c/pool-dip-towel-${role}.session.json`, import.meta.url,
            )))),
        })),
        summaryLabel: 'POOL DIP', chunkLimit: 1,
        verifySegment: async segment => {
            const role = roles.find(role =>
                segment.nethackrc.toLowerCase().includes(`role:${role},`));
            const reference = JSON.parse(readFileSync(new URL(
                `../recordings/potion.c/pool-dip-towel-${role}.session.json`, import.meta.url,
            )));
            let boundary;
            const output = await runSegment(segment, { onBoundary(error) { boundary = error; } });
            if (boundary) throw boundary;
            const comparison = compareSessionOutputs(reference, {
                rng: output.getRngLog(), screens: output.getScreens(), cursors: output.getCursors(),
                animFrames: output.getAnimationFramesByStep(),
            });
            assert.equal(comparison.passed, true, JSON.stringify(comparison));
            assert.ok(output.getScreens().some(screen =>
                screen.includes('Dip a towel into the pool of water?')));
            assert.ok(output.getScreens().some(screen => screen.includes('Your towel gets wet.')));
            const inventory = [];
            for (let obj = game.invent; obj; obj = obj.nobj) inventory.push(obj);
            assert.ok(inventory.some(obj => obj.otyp === TOWEL && obj.spe > 0));
        },
    });
}
runMatrixCli(import.meta.url, runDipCommandMatrix, 'acid dip');
