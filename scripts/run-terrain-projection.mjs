#!/usr/bin/env node
// C-first witnesses cover known objects (two gem colors), known traps, the
// complete map, and the impairment guard. Seeds and setup were selected before
// JS comparison; the pit setup moves off the stairs because C rejects it there.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['terrain-objects-emerald', 'Showing known terrain, traps, and objects only...'],
    ['terrain-objects-ruby', 'Showing known terrain, traps, and objects only...'],
    ['terrain-known-traps', 'Showing known terrain and traps only...'],
    ['terrain-full-map', 'Showing underlying terrain only...'],
    ['terrain-known-map', 'Showing known terrain only...'],
    ['terrain-disoriented', 'You are too disoriented for this.'],
    ['terrain-full-map-stunned', 'Showing underlying terrain only...'],
];
const WITNESSES = CASES.map(([name, message]) => ({
    label: name,
    recipe: JSON.parse(readFileSync(new URL(
        `../recipes/detect.c/${name}.session.json`, import.meta.url))),
    message,
}));
export async function runTerrainProjectionMatrix() {
    return runFreshMatrix({
        entries: WITNESSES,
        verifySegment: async (segment) => {
            let boundary;
            const replay = await runSegment(segment, {
                onBoundary: (error) => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            const { message } = WITNESSES.find(({ recipe }) =>
                recipe.segments.some((input) => input.seed === segment.seed
                    && input.moves === segment.moves));
            assert.ok(replay.getScreens().some((screen) => screen.includes(message)),
                'the production terrain choice must reach its C message');
            // The impairment arm returns before initializing browse state.
            assert.equal(game.iflags.terrainmode ?? 0, 0,
                'browse_map must restore the ordinary map selection mode');
            assert.equal(game.iflags.save_uswallow ?? 0, 0);
            assert.equal(game.iflags.save_uinwater ?? 0, 0);
            assert.equal(game.iflags.save_uburied ?? 0, 0);
        },
        summaryLabel: 'TERRAIN PROJECTION',
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runTerrainProjectionMatrix, 'terrain projection');
