#!/usr/bin/env node

// Run the independent trap.c trapeffect_rust_trap() recipe through a fresh
// C recording and the contestant API. The route ends on a generated rust
// trap, so the verifier proves production dotrap() reachability rather than
// only exercising the selector in a direct fixture.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RUST_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/trap.c/rust-trap-hero-seed9400060.session.json',
    import.meta.url,
);

export function loadTrapRustTrapRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyTrapRustTrapSegment(segment) {
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.deepEqual([game.u.ux, game.u.uy], [14, 10],
        'the route ends on the generated rust trap');
    const rustTrap = game.level.traps.find((trap) =>
        trap.ttyp === RUST_TRAP
        && trap.tx === game.u.ux
        && trap.ty === game.u.uy);
    assert.equal(rustTrap?.tseen, true,
        'dotrap marks the rust trap seen before its effect');
    assert.equal(game.nhDisplay?.toplines,
        'A gush of water hits your right arm!',
        'trapeffect_rust_trap reaches the right-arm case');
    return replay;
}

export function runTrapRustTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'trap rust trap',
            recipe: loadTrapRustTrapRecipe(),
        }],
        summaryLabel: 'TRAP RUST TRAP',
        verifySegment: verifyTrapRustTrapSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runTrapRustTrapMatrix, 'trap rust trap');
