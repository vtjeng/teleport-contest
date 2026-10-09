#!/usr/bin/env node
// Independently chosen C-first inputs vary role and monster creation.
// Map replacement retains prior vision during generation, then reaches
// ordinary newsym redraw after in_mklev is cleared.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['wizard', 'ranger'];

export function runNewsymSuppressionMatrix() {
    return runFreshMatrix({
        entries: names.map(name => {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/display.c/newsym-replacement-${name}.session.json`, import.meta.url),
            'utf8'));
            const recipe = JSON.parse(readFileSync(new URL(
                `../recipes/display.c/newsym-replacement-${name}.session.json`, import.meta.url),
            'utf8'));
            // Startup plus each input replacement reaches getbones. Source
            // call annotations pin these entries in C; JS has no such tags.
            const replacements = [...recipe.segments[0].moves.matchAll(/#wizmakemap\n/gu)].length;
            assert.equal(recording.segments[0].steps.flatMap(step => step.rng)
                .filter(call => call.includes('@ getbones(bones.c:')).length, replacements + 1);
            return {
                label: `newsym replacement ${name}`,
                recipe,
            };
        }),
        summaryLabel: 'NEWSYM MAP OUTPUT SUPPRESSION',
        chunkLimit: 1,
        verifySegment: async input => {
            let boundary;
            const replay = await runSegment(input, {
                onBoundary: error => { boundary = error; },
            });
            assert.equal(boundary, undefined);
            assert.equal(Boolean(game.in_mklev), false);
            assert.equal(game.level.at(game.u.ux, game.u.uy).disp_ch, '@');
            assert.ok(replay.getScreens().at(-1).includes('@'));
        },
    });
}

runMatrixCli(import.meta.url, runNewsymSuppressionMatrix, 'newsym map output suppression');
