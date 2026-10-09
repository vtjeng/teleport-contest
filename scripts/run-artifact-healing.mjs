#!/usr/bin/env node
// artifact.c:invoke_healing: directly chosen Healer seeds, C-first inventory
// selection, and cheap no-effect/permanent/temporary blindness variations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLINDED, FROMOUTSIDE, TIMEOUT } from '../js/const.js';
import { ART_STAFF_OF_AESCULAPIUS } from '../js/artifacts.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['no-effect', 'permanent-blind', 'temporary-blind'];
export function loadArtifactHealingCases() {
    return names.map(name => {
        const path = new URL(`../recipes/artifact.c/healing-${name}.session.json`, import.meta.url);
        return { name, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
export async function verifyArtifactHealingSegment(segment) {
    const entry = loadArtifactHealingCases().find(({ recipe }) => recipe.segments[0].seed === segment.seed);
    assert.ok(entry);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    let staff;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oartifact === ART_STAFF_OF_AESCULAPIUS) staff = obj;
    assert.ok(staff, 'independently wished Staff remains carried');
    assert.ok(staff.age > game.moves, 'accepted invocation charges the canonical cooldown');
    const screens = replay.getScreens().join('\n');
    if (entry.name === 'temporary-blind') {
        assert.match(screens, /You feel better\.  You feel better\./u);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    } else if (entry.name === 'permanent-blind') {
        assert.match(screens, /You feel better\.--More--/u);
        assert.match(screens, /You feel a surge of power, but nothing seems to happen\./u);
        assert.ok(game.u.uprops[BLINDED].intrinsic & FROMOUTSIDE);
    } else {
        assert.match(screens, /You feel a surge of power, but nothing seems to happen\./u);
        assert.doesNotMatch(screens, /You feel better\./u);
    }
}
export function runArtifactHealingMatrix() {
    return runFreshMatrix({
        entries: loadArtifactHealingCases().map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'ARTIFACT HEALING', chunkLimit: 1,
        verifySegment: verifyArtifactHealingSegment,
    });
}
runMatrixCli(import.meta.url, runArtifactHealingMatrix, 'artifact healing');
