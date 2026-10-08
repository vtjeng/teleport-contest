#!/usr/bin/env node

// Independent seeds/dates were chosen before JS comparison. C verified the
// fresh Wizard diagnostic and Monk cookie slot i before repeated checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadRumorCheckRecipes() {
    return [
        ['fresh Wizard check', 'wizcmds.c/rumor-check-fresh'],
        ['Monk cookie and repeated check', 'rumors.c/rumor-check-cookie-repeat'],
        ['ordinary-mode exclusion', 'wizcmds.c/rumor-check-nonwizard'],
    ].map(([label, name]) => ({ label, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/${name}.session.json`, import.meta.url))), label,
    ) }));
}

export async function verifyRumorCheckSegment(segment) {
    const cookie = segment.moves.includes('.ei');
    if (cookie) {
        await runSegment({ ...segment, moves: '.' });
        assert.equal(game.gt?.true_rumor_size ?? 0, 0,
            'independent C-first seed leaves the source cache uninitialized before cookie');
    }
    const firstCommand = segment.moves.indexOf('#wizrumorcheck');
    assert.ok(firstCommand >= 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, firstCommand) },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const beforeMoves = game.moves;
    const priorOffsets = structuredClone({ gt: {
        true_rumor_size: game.gt?.true_rumor_size,
        true_rumor_start: game.gt?.true_rumor_start,
        true_rumor_end: game.gt?.true_rumor_end,
    }, gf: {
        false_rumor_size: game.gf?.false_rumor_size,
        false_rumor_start: game.gf?.false_rumor_start,
        false_rumor_end: game.gf?.false_rumor_end,
    } });
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.moves, beforeMoves, 'rumor diagnostic is ECMD_OK, with no turn use');
    if (!game.wizard) {
        assert.ok(replay.getScreens().some(screen => screen.includes('#wizrumorcheck: unknown extended command.')));
        assert.ok(!replay.getScreens().some(screen => screen.includes('T start=')));
        assert.equal(game.gt?.true_rumor_size, priorOffsets.gt.true_rumor_size);
        return;
    }
    if (!cookie) assert.equal(priorOffsets.gt.true_rumor_size ?? 0, 0,
        'fresh wizard diagnostic reaches its own init_rumors caller');
    // Source makedefs' byte bounds, retained by init_rumors without unpadding.
    const expected = { gt: { true_rumor_size: 24924, true_rumor_start: 109, true_rumor_end: 25033 },
        gf: { false_rumor_size: 25762, false_rumor_start: 25033, false_rumor_end: 50795 } };
    for (const [group, fields] of Object.entries(expected))
        for (const [name, value] of Object.entries(fields)) assert.equal(game[group][name], value);
    if (cookie) {
        assert.deepEqual(priorOffsets, expected, 'cookie getrumor initialized the same offsets');
        assert.ok(replay.getScreens().some(screen => screen.includes('Balrogs do not appear above level 20.')),
            'the C-first cookie variation reaches getrumor before diagnostics');
    }
    const screens = replay.getScreens();
    const checks = segment.moves.split('#wizrumorcheck').length - 1;
    assert.equal(screens.filter(screen => screen.includes('T start=000109')).length, checks);
    assert.equal(screens.filter(screen => screen.startsWith('yellow wight_______')).length, checks);
}

export async function runRumorCheckMatrix() {
    return runFreshMatrix({ entries: loadRumorCheckRecipes(),
        summaryLabel: 'RUMOR CHECK', chunkLimit: 1, verifySegment: verifyRumorCheckSegment });
}
runMatrixCli(import.meta.url, runRumorCheckMatrix, 'rumor check');
