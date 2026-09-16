#!/usr/bin/env node

// Fresh production witness for the hero arm of trap.c landmine(). The D:8
// setup places a natural mine one square east of the hero; walking onto it
// reaches blow_up_landmine(), then dotrap(RECURSIVETRAP) and trapeffect_pit().

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LANDMINE, PIT, TT_PIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/trap.c/landmine-hero-fresh.session.json',
    import.meta.url,
);

export function loadTrapLandmineHeroRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyTrapLandmineHeroSegment(segment) {
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.uz.dlevel, 8,
        'fresh hero landmine recipe did not reach D:8');
    assert.deepEqual([game.u.ux, game.u.uy], [35, 12],
        'fresh hero did not step onto the natural mine');
    const pit = game.level.traps.find((trap) =>
        trap.ttyp === PIT && trap.tx === 35 && trap.ty === 12);
    assert.ok(pit,
        `fresh hero mine did not become a pit: ${JSON.stringify(game.level.traps.filter(({ ttyp }) => [LANDMINE, PIT].includes(ttyp)))}`);
    assert.equal(pit.tseen, true,
        'fresh hero recursive pit was not revealed');
    assert.equal(game.u.utraptype, TT_PIT,
        'fresh hero recursive pit did not set TT_PIT');
    assert.ok(replay.getScreens().length > 0,
        'fresh hero landmine setup did not reach a screen boundary');
    return replay;
}

export async function runTrapLandmineHeroMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'trap landmine hero',
            recipe: loadTrapLandmineHeroRecipe(),
        }],
        summaryLabel: 'TRAP LANDMINE HERO',
        verifySegment: verifyTrapLandmineHeroSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runTrapLandmineHeroMatrix, 'trap landmine hero');
