#!/usr/bin/env node

// Independent C-first ordinary true-giant creation variations. The seeds,
// clock and roles were chosen before comparison; frost/fire vary source
// monster level and resistance. The admitted v28 range separately covers
// random-coordinate creation, whose obsolete species guard this fix removes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FIRE_GIANT, PM_FROST_GIANT } from '../js/monsters.js';
import { OBJ_MINVENT } from '../js/const.js';
import { weight } from '../js/obj.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['frost', PM_FROST_GIANT],
    ['fire', PM_FIRE_GIANT],
];

export function loadOrdinaryGiantRecipe(name) {
    const path = new URL(
        `../recipes/makemon.c/ordinary-${name}-giant-genesis.session.json`,
        import.meta.url,
    );
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

export async function verifyOrdinaryGiantSegment(segment) {
    const [name, mndx] = CASES.find(([name]) =>
        segment.moves.includes(`${name} giant`));
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/makemon.c/ordinary-${name}-giant-genesis.session.json`,
        import.meta.url,
    ), 'utf8'));
    const comparison = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const giants = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        if (monster.mnum === mndx) giants.push(monster);
    // Explicit genesis selects one monster and sets no random-group request.
    assert.equal(giants.length, 1);
    const giant = giants[0];
    assert.equal(giant.data, game.mons[mndx]);
    assert.equal(giant.mgenmklev, false);
    assert.equal(game.level.monsters[giant.mx][giant.my], giant);
    for (let obj = giant.minvent; obj; obj = obj.nobj) {
        assert.equal(obj.where, OBJ_MINVENT);
        assert.equal(obj.ocarry, giant);
        assert.equal(obj.owt, weight(obj, { state: game }));
    }
    // Every independent case reaches both source S_GIANT weapon gates and
    // the gem-count arm, including the fire case's zero-gem result.
    const cRng = recording.segments[0].steps.flatMap(step => step.rng);
    assert.ok(cRng.some(line => /rn2\(2\).*m_initweap/u.test(line)));
    assert.ok(cRng.some(line => /rn2\(5\).*m_initweap/u.test(line)));
    assert.ok(cRng.some(line => /rn2\(4\).*m_initinv/u.test(line)));
}

export function runOrdinaryGiantsMatrix() {
    return runFreshMatrix({
        entries: CASES.map(([name]) => ({
            label: `ordinary ${name} giant`, recipe: loadOrdinaryGiantRecipe(name),
        })),
        summaryLabel: 'ORDINARY GIANTS', chunkLimit: 1,
        verifySegment: verifyOrdinaryGiantSegment,
    });
}

runMatrixCli(import.meta.url, runOrdinaryGiantsMatrix, 'ordinary giants');
