#!/usr/bin/env node
// Independent dokick.c kick_nondoor terrain witnesses and cheap variations.
import assert from 'node:assert/strict';
import { SCORR, FOUNTAIN, GRAVE, TREE, SINK, SDOOR, TREE_LOOTED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { readFileSync } from 'node:fs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const KICK_TERRAIN_CASES = ['secret-corridor', 'fountain', 'headstone',
    'tree', 'sink', 'secret-door'];
export async function runKickTerrainMatrix() {
    return runFreshMatrix({
        entries: KICK_TERRAIN_CASES.map(name => ({ label: name,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
                `../recipes/dokick.c/kick-${name}-independent.session.json`,
                import.meta.url), 'utf8')), name) })),
        verifySegment: async segment => {
            // Verify the source terrain left by each independently chosen
            // setup; matching startup alone cannot establish a terrain entry.
            await runSegment(segment);
            const grave = segment.moves.includes('disturbed grave');
            const location = game.level.at(game.u.ux + (grave ? -1 : 0),
                game.u.uy + (grave ? 0 : 1));
            const type = segment.moves.includes('secret corridor') ? SCORR
                : segment.moves.includes('fountain') ? FOUNTAIN
                : grave ? GRAVE : segment.moves.includes('tree') ? TREE
                : segment.moves.includes('sink') ? SINK : SDOOR;
            assert.equal(location.typ, type, 'independent terrain setup/result');
            if (type === GRAVE) assert.equal(location.horizontal, true);
            if (type === TREE) assert.ok(location.flags & TREE_LOOTED);
        },
        summaryLabel: 'DOKICK.C TERRAIN',
        chunkLimit: 1, // Each debug recording keeps its own game lock.
    });
}
runMatrixCli(import.meta.url, runKickTerrainMatrix, 'dokick.c terrain');
