#!/usr/bin/env node
// Independent typed, counted bound-key, and two-segment UUID witnesses.
// Save/restore uses the documented gzip-configured C recorder via env.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';
import { compareSessionOutputs, runDifferential } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['typed', 'bound', 'restore'];
const pathFor = (kind, name) => new URL(
    `../${kind}/wizcmds.c/wizard-game-uuid-${name}-independent.session.json`, import.meta.url,
);
export function runWizardUuidMatrix() {
    return runFreshMatrix({
        entries: names.map(name => ({
            label: name, recipe: JSON.parse(readFileSync(pathFor('recipes', name))),
        })),
        summaryLabel: 'WIZARD UUID',
        runDifferentialFn: async recipe => {
            const name = names.find(name => JSON.parse(readFileSync(pathFor('recipes', name))).segments[0].seed === recipe.segments[0].seed);
            const gold = JSON.parse(readFileSync(pathFor('recordings', name)));
            const storage = new InMemoryStorage();
            for (const [index, input] of recipe.segments.entries()) {
                let boundary;
                const replay = await runSegment({
                    ...input, storage, recorderIsDst: gold.segments[index].recorderIsDst,
                }, { onBoundary: error => { boundary = error; } });
                assert.equal(boundary, undefined);
                assert.equal(game.svn.nhuuid, ''); // Minimal C build has no NHUUID generation.
                assert.equal(game.nhDisplay.inputQueueLength, 0);
                const comparison = compareSessionOutputs({ version: 5, segments: [gold.segments[index]] }, {
                    rng: replay.getRngLog(), screens: replay.getScreens(),
                    cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
                });
                assert.equal(comparison.passed, true, JSON.stringify(comparison));
                assert.ok(replay.getScreens().some(screen => screen.includes('The NHUUID for this game is {  }.')));
                if (name === 'bound') {
                    // One wait before and after counted V; UUID spends no time
                    // and ECMD_OK cancels the entered count instead of repeating.
                    assert.equal(game.moves, 3);
                    assert.equal(game.multi, 0);
                }
                if (name === 'restore' && index === 0) {
                    assert.equal(JSON.parse(storage.getItem('vfs:nhsave')).nhuuid, '');
                }
            }
            return runDifferential(recipe);
        },
    });
}
runMatrixCli(import.meta.url, runWizardUuidMatrix, 'wizard UUID');
