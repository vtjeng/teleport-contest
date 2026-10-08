#!/usr/bin/env node

// Independent C-first witnesses for mhitu.c:explmu -> mon_explodes. The
// unsearched Barbarian seed14528043/clock20640610142300 reaches level20 to
// survive the sphere, and do.c:donull's m. prefix permits resting beside it.
// Changing the sphere varies fire/cold/electric item and resistance paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    { name: 'fire-recovery', species: 'flaming sphere', recovery: true },
    { name: 'fire', species: 'flaming sphere' },
    { name: 'cold', species: 'freezing sphere' },
    { name: 'electric', species: 'shocking sphere' },
];
function recipe(entry) {
    const path = new URL(`../recipes/mhitu.c/elemental-explosion-${entry.name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const recovery = segment.moves.split('flaming sphere\n').length === 3;
    const entry = CASES.find(candidate => Boolean(candidate.recovery) === recovery
        && segment.moves.includes(`${candidate.species}\n`));
    assert.ok(entry, 'the recipe creates its elemental sphere through wiz_genesis');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const c = JSON.parse(readFileSync(new URL(
        `../recordings/mhitu.c/elemental-explosion-${entry.name}.session.json`, import.meta.url)));
    const comparison = compareSessionOutputs(c, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    for (const outputs of [c.segments[0].steps.map(step => step.screen), replay.getScreens()]) {
        assert.ok(outputs.some(screen => screen.includes(`The ${entry.species} explodes!`)));
        assert.ok(outputs.some(screen => screen.includes(`You are caught in the ${entry.species}'s explosion!`)));
    }
    if (entry.recovery) {
        assert.ok(c.segments[0].steps.some(step => step.screen.includes('Die?')));
        assert.ok(replay.getScreens().some(screen => screen.includes('You survived that attempt on your life.')));
        assert.equal(game.u.uhp, game.u.uhpmax, 'end.c:savelife restores ordinary HP');
    } else {
        assert.ok(game.u.uhp > 0 && game.u.uhp < game.u.uhpmax,
            'the ordinary hero survives canonical elemental damage');
    }
    assert.equal(game.killer.name, '', 'mon_explodes resets its temporary killer');
    assert.equal(game.unported.has('explode.c mon_explodes'), false);
}
export function runMonsterExplosionMatrix() {
    return runFreshMatrix({ entries: CASES.map(entry => ({
        label: `elemental sphere ${entry.name}`, recipe: recipe(entry),
    })), summaryLabel: 'MONSTER EXPLOSION', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runMonsterExplosionMatrix, 'monster explosion');
