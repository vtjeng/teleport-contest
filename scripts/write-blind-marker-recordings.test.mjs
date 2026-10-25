import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, formatReport } from './diff-fresh.mjs';

for (const name of [
    'blind-unnamed-marker-spellbook-control',
    'blind-named-marker-spellbook',
    'blind-named-marker-spellbook-variation',
]) {
    test(`${name} matches the C blind-spellbook refusal`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/write.c/${name}.session.json`, import.meta.url,
        ), 'utf8'));
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/write.c/${name}.session.json`, import.meta.url,
        ), 'utf8'));
        assert.equal(recipe.segments[0].moves, recording.segments[0].moves);
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.includes("Your magic marker can't create braille text.")));
        const output = await runSegment(recording.segments[0]);
        const result = compareSessionOutputs(recording, {
            rng: output.getRngLog(), screens: output.getScreens(),
            cursors: output.getCursors(),
            animFrames: output.getAnimationFramesByStep(),
        });
        assert.equal(result.passed, true, formatReport(result));
    });
}
