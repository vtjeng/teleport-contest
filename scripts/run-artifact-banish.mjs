#!/usr/bin/env node

// Independent C-first artifact.c:invoke_banish evidence. The fixed seed,
// lawful Priest, clock and short wizard setup were chosen before recording.
// Two imp-class species cover saved-next migration; a numeric level teleport
// and its three C arrival pages reach the existing Hell relocation owner.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { is_demon } from '../js/mondata.js';
import { S_IMP } from '../js/monsters.js';
import { In_hell } from '../js/dungeon.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['imp', 'pair', 'hell'];
function recipe(name) {
    const path = new URL(`../recipes/artifact.c/invoke-banish-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].moves === segment.moves);
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/artifact.c/invoke-banish-${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    const banishable = monster => is_demon(monster.data) || monster.data.mlet === S_IMP;
    const migrated = [];
    for (let monster = game.gm.migrating_mons; monster; monster = monster.nmon)
        if (banishable(monster)) migrated.push(monster);
    const steps = recording.segments[0].steps;
    assert.equal(In_hell(game.u.uz, game), name === 'hell');
    if (name === 'hell') {
        assert.equal(migrated.length, 0, 'Hell uses relocation rather than migration');
        assert.ok(steps.some(step => step.rng?.some(call => call.includes('rloc(teleport.c:1850)'))));
        assert.equal(steps.some(step => step.screen.includes('cloud of brimstone')), false,
            'C increments nvanished only for the outside-Hell path');
        const targets = [];
        for (let monster = game.level.monlist; monster; monster = monster.nmon)
            if (banishable(monster)) targets.push(monster);
        assert.ok(targets.some(monster => !monster.mtame && !monster.mpeaceful && !monster.msleeping));
    } else {
        const count = name === 'pair' ? 2 : 1;
        assert.equal(migrated.length, count);
        const subject = count === 1 ? 'demon disappears' : 'demons disappear';
        assert.ok(steps.some(step => step.screen.includes(`The ${subject} in a cloud of brimstone!`)));
        const draws = steps.flatMap(step => step.rng ?? [])
            .filter(call => call.includes('invoke_banish(artifact.c:1996)'));
        assert.equal(draws.length, count, 'each visited target gets its own destination draw');
        for (const monster of migrated) {
            assert.equal(monster.mx, 0);
            assert.equal(monster.my, 0);
            assert.equal(monster.mtame, 0);
            assert.equal(monster.mpeaceful, 0);
            assert.equal(monster.msleeping, 0);
        }
    }
    assert.equal(game.unported.has('dungeon.c find_hell'), false);
    assert.equal(game.unported.has('teleport.c u_teleport_mon'), false);
    assert.equal(game.unported.has('dog.c migrate_to_level leashed monster migration'), false);
}
export function runArtifactBanishMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `artifact banish ${name}`, recipe: recipe(name) })),
        summaryLabel: 'ARTIFACT BANISH', chunkLimit: 1, verifySegment,
    });
}
runMatrixCli(import.meta.url, runArtifactBanishMatrix, 'artifact banish');
