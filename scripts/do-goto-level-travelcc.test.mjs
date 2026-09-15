import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadDoGotoLevelTravelccRecipe,
} from './run-do-goto-level-travelcc.mjs';

const C_SOURCE = readFileSync('nethack-c/upstream/src/do.c', 'utf8');
const JS_SOURCE = readFileSync('js/do.js', 'utf8');

function sourceBody(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} is present`);
    return source.slice(start);
}

test('goto_level resets travelcc in source order', () => {
    const cBody = sourceBody(C_SOURCE, '\ngoto_level(\n');
    const cTrapset = cBody.indexOf('reset_trapset();');
    const cTravel = cBody.indexOf(
        'iflags.travelcc.x = iflags.travelcc.y = 0;',
    );
    const cPolearm = cBody.indexOf('svc.context.polearm.hitmon');
    assert.ok(cTrapset >= 0 && cTrapset < cTravel);
    assert.ok(cTravel < cPolearm);

    const jsBody = sourceBody(JS_SOURCE, 'export async function goto_level');
    const jsResetTrapset = jsBody.indexOf('reset_trapset(state);');
    const jsTravel = jsBody.indexOf('state.iflags.travelcc.x = 0;');
    const jsPolearm = jsBody.indexOf(
        'state.context.polearm.hitmon = null;',
    );
    assert.ok(jsResetTrapset >= 0 && jsResetTrapset < jsTravel);
    assert.ok(jsTravel < jsPolearm);
});

test('the seed0014 recipe reaches the deferred goto_level reset', async () => {
    const recipe = loadDoGotoLevelTravelccRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, 14);
    assert.equal(recipe.segments[0].moves, '   _lll.\x162\n');
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);

    let boundary;
    await runSegment(recipe.segments[0], {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.uz.dlevel, 2);
    assert.deepEqual(game.iflags.travelcc, { x: 0, y: 0 });
});
