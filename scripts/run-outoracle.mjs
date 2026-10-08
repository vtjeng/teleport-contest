#!/usr/bin/env node
// Independent C-first paid and special Oracle consultations. Save/restore
// variations remain blocked by the named broader owners in their recipes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';
import { runDifferential } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['oracle-major-wizard', 'oracle-cheapskate-barbarian'];

export function runOutoracleMatrix() {
    return runFreshMatrix({
        entries: names.map(name => ({
            label: name,
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/rumors.c/${name}.session.json`, import.meta.url))),
        })),
        summaryLabel: 'Oracle consultation',
        runDifferentialFn: async recipe => {
            const storage = new InMemoryStorage();
            for (const [index, segment] of recipe.segments.entries()) {
                let boundary;
                await runSegment({ ...segment, storage }, {
                    onBoundary: error => { boundary = error; },
                });
                assert.equal(boundary, undefined, 'the production caller must finish');
                assert.equal(game.go.oracle_flg, 1, 'the Oracle data is initialized');
                // Source supplies twenty normal entries plus the special one.
                // A cheap payment keeps all21; successive paid consultations consume one each.
                const expected = recipe.segments[0].moves.includes('99 gold pieces') ? 21 : 20 - index;
                assert.equal(game.svo.oracle_cnt, expected);
                assert.equal(game.u.uevent.major_oracle, true);
                if (game.program_state.gameover) {
                    const snapshot = JSON.parse(storage.getItem('vfs:nhsave'));
                    assert.equal(snapshot.oracles.oracle_cnt, expected);
                    assert.equal(snapshot.oracles.oracle_loc.length, expected);
                }
            }
            return runDifferential(recipe);
        },
    });
}

runMatrixCli(import.meta.url, runOutoracleMatrix, 'Oracle consultation');
