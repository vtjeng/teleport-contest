#!/usr/bin/env node

// Independent monmove.c:distfleeck -> monflee production caller witnesses.
// Both roles wield artifact light, create a nearby gremlin and force rest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const ROLES = ['knight', 'valkyrie'];
function loadRecipe(role) {
    return validateCleanRecipe(JSON.parse(readFileSync(new URL(
        `../recipes/monmove.c/sunsword-flight-${role}.session.json`, import.meta.url,
    ), 'utf8')));
}

export function runMonsterFlightMatrix() {
    return runFreshMatrix({
        entries: ROLES.map(role => ({ label: `Sunsword flight ${role}`, recipe: loadRecipe(role) })),
        summaryLabel: 'MONSTER FLIGHT', chunkLimit: 1,
        verifySegment: async segment => {
            const role = ROLES.find(role =>
                segment.nethackrc.toLowerCase().includes(`role:${role},`));
            const reference = JSON.parse(readFileSync(new URL(
                `../recordings/monmove.c/sunsword-flight-${role}.session.json`, import.meta.url,
            ), 'utf8'));
            let boundary;
            const output = await runSegment(segment, {
                onBoundary(error) { boundary = error; },
            });
            if (boundary) throw boundary;
            const comparison = compareSessionOutputs(reference, {
                rng: output.getRngLog(), screens: output.getScreens(),
                cursors: output.getCursors(), animFrames: output.getAnimationFramesByStep(),
            });
            assert.equal(comparison.passed, true, JSON.stringify(comparison));
            assert.ok(output.getScreens().some(screen =>
                screen.includes('The gremlin flees from the painful light of Sunsword.')));
            // C monmove.c:499 owns the light-message random gate. This proves
            // the reference traversed monflee, rather than merely moving away.
            assert.ok(reference.segments[0].steps.flatMap(step => step.rng)
                .some(call => /rn2\(10\)=\d+ @ monflee\(monmove.c:499\)/u.test(call)));
        },
    });
}

runMatrixCli(import.meta.url, runMonsterFlightMatrix, 'monster flight');
