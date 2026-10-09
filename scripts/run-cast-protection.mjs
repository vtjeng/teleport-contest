#!/usr/bin/env node
// Independent C-first seeds16491013/19/27/31 were chosen before comparison.
// Variations cover forced initial/repeated/blind and ordinary learned casting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { heroIsBlind } from '../js/startup_a11y.js';
import { SPE_PROTECTION } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function entries() {
    return ['knight-initial', 'cleric-repeat', 'blind-cleric', 'learned-wizard'].map(label => {
        const path = new URL('../recipes/spell.c/protection-' + label + '.session.json', import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyProtection(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.ok(game.u.uspellprot > 0, 'source protection must have actually been granted');
    assert.equal(game.u.uspmtime, 10); // All four roles remain below Expert.
    assert.ok(game.u.usptime > 0 && game.u.usptime < 10); // Post-cast nh_timeout.
    const blind = segment.moves.includes('blindfold');
    assert.equal(heroIsBlind(game), blind);
    if (segment.moves.includes('#cast\n')) {
        // The ordinary production route must learn, retain and cast the book.
        assert.ok(game.svs.spl_book.some(spell => spell.sp_id === SPE_PROTECTION));
        assert.equal(game.u.uspellprot, 4); // Source log2(level10)+1 first gain.
    }
    if (segment.moves.split('#wizcast\n').length > 2)
        assert.ok(game.u.uspellprot > 1, 'repeated casting must add protection');
}
export function runCastProtectionMatrix() {
    return runFreshMatrix({ entries: entries(), summaryLabel: 'CAST PROTECTION',
        chunkLimit: 1, verifySegment: verifyProtection });
}
runMatrixCli(import.meta.url, runCastProtectionMatrix, 'protection casting');
