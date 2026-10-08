#!/usr/bin/env node

// These seeds/clocks were chosen before C or JS comparison. C-only probes
// determined the south/northwest directions and the wished saddle slot f.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { W_SADDLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SADDLE } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function findSaddle(inventory) {
    for (let obj = inventory; obj; obj = obj.nobj)
        if (obj.otyp === SADDLE) return obj;
    return null;
}
function monsterSaddle() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        const saddle = findSaddle(monster.minvent);
        if (saddle) return { saddle, monster };
    }
    return null;
}
export function loadSaddleVisibilityRecipes() {
    return ['saddle-startup-visibility', 'saddle-visible-pickup-control'].map(name => ({
        label: name,
        recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/steed.c/${name}.session.json`, import.meta.url), 'utf8')), name),
    }));
}
export async function verifySaddleVisibilitySegment(segment) {
    const applied = segment.nethackrc.includes('pettype:none');
    if (applied) {
        const applyIndex = segment.moves.indexOf('afy');
        assert.ok(applyIndex > 0);
        await runSegment({ ...segment, moves: segment.moves.slice(0, applyIndex) });
        const before = findSaddle(game.invent);
        assert.ok(before);
        const identity = [before.known, before.dknown, before.bknown, before.rknown];
        await runSegment({ ...segment, moves: segment.moves.slice(0, applyIndex + 3) });
        const carried = monsterSaddle();
        assert.ok(carried);
        assert.ok(carried.monster.mtame, 'independent C created a tame control pony');
        assert.deepEqual([carried.saddle.known, carried.saddle.dknown,
            carried.saddle.bknown, carried.saddle.rknown], identity,
        'mpickobj preserves the tame carrier identification');
    } else {
        await runSegment({ ...segment, moves: '.' });
        const carried = monsterSaddle();
        assert.ok(carried);
        assert.equal(Boolean(carried.saddle.bknown), false,
            'startup transfer cleared BUC knowledge before initedog and redraw');
        assert.equal(Boolean(carried.saddle.rknown), false);
    }
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const held = findSaddle(game.invent);
    assert.ok(held, 'production #loot transferred the worn saddle to the hero');
    assert.equal(held.owornmask & W_SADDLE, 0);
    assert.equal(monsterSaddle(), null);
    assert.ok(replay.getScreens().some(screen => screen.includes('You take the saddle off of the pony.')));
    if (!applied) {
        assert.equal(Boolean(held.bknown), false);
        assert.ok(replay.getScreens().some(screen => screen.includes('i - a saddle.--More--')));
        assert.ok(!replay.getScreens().some(screen => screen.includes('uncursed saddle')));
    }
}
export async function runSaddleVisibilityMatrix() {
    return runFreshMatrix({ entries: loadSaddleVisibilityRecipes(),
        summaryLabel: 'SADDLE VISIBILITY', chunkLimit: 1,
        verifySegment: verifySaddleVisibilitySegment });
}
runMatrixCli(import.meta.url, runSaddleVisibilityMatrix, 'saddle visibility');
