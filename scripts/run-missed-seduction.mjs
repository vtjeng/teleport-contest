#!/usr/bin/env node
// Independent uhitm.c:missum entries. Seeds chosen directly before C recording;
// C-only maps and prompts established directions and confirmation inputs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { Upolyd } from '../js/const.js';
import { PM_WOOD_NYMPH, PM_WATER_NYMPH, PM_SASQUATCH } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = [
    { name: 'wood-nymph', form: PM_WOOD_NYMPH, friendlyStep: 99 },
    { name: 'water-nymph', form: PM_WATER_NYMPH, friendlyStep: 93 },
    { name: 'sasquatch-kick', form: PM_SASQUATCH, missStep: 92 },
];
export function loadMissedSeductionCases() {
    return cases.map(entry => {
        const path = new URL(`../recipes/uhitm.c/missum-${entry.name}.session.json`, import.meta.url);
        return { ...entry, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
export async function verifyMissedSeductionSegment(segment) {
    const entry = loadMissedSeductionCases().find(({ recipe }) => recipe.segments[0].seed === segment.seed);
    assert.ok(entry);
    // These zero-based C boundaries are live misses, after all setup prompts.
    // A recording has an initial screen, so step N corresponds to N inputs.
    const through = entry.friendlyStep ?? entry.missStep;
    let boundary;
    const prefix = await runSegment({ ...segment, moves: segment.moves.slice(0, through) },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.u.umonnum, entry.form);
    assert.equal(game.youmonst.data, game.mons[entry.form]);
    assert.equal(Upolyd(game.u), true);
    const screens = prefix.getScreens().join('\n');
    if (entry.friendlyStep !== undefined)
        assert.match(screens, /You pretend to be friendly to the stone golem\./u);
    else
        assert.match(screens, /You miss the stone golem\./u);
    if (entry.name === 'wood-nymph') {
        // C step108 rehumanizes; step113 is ordinary known_hitum’s miss route,
        // which shares the helper but has no seduction compatibility.
        const ordinary = await runSegment(segment, { onBoundary: error => { boundary = error; } });
        assert.equal(boundary, undefined);
        assert.equal(Upolyd(game.u), false);
        assert.match(ordinary.getScreens().join('\n'), /You miss the stone golem\./u);
    }
}
export function runMissedSeductionMatrix() {
    return runFreshMatrix({ entries: loadMissedSeductionCases().map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'MISSED SEDUCTION', chunkLimit: 1, verifySegment: verifyMissedSeductionSegment });
}
runMatrixCli(import.meta.url, runMissedSeductionMatrix, 'missed seduction');
