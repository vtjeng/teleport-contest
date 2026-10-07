#!/usr/bin/env node
// do.c dropx -> dropz preserves the dropped light/timer object. These two
// seeds were chosen directly before comparing JS, with a candle/lamp variation;
// neither seed nor its room was searched for. C confirms drop plus movement.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BURN_OBJECT, LS_OBJECT, OBJ_FLOOR, TEMP_LIT } from '../js/const.js';
import { rhack } from '../js/cmd.js';
import { _dropInternals } from '../js/do.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { OIL_LAMP, TALLOW_CANDLE } from '../js/objects.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { vision_recalc } from '../js/vision.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const LIT_DROP_RECIPES = [
    'recipes/do.c/drop-lit-candle-independent.session.json',
    'recipes/do.c/drop-lit-oil-lamp-independent.session.json',
];
export function loadLitDropRecipe(path) {
    return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
}
function findNode(head, predicate) {
    for (let node = head; node; node = node.next) {
        if (predicate(node)) return node;
    }
    return null;
}
export async function verifyLitDropSegment(segment) {
    // Capture live nodes after apply but before dropping. The complete
    // differential below separately establishes the production d dispatcher.
    const beforeDrop = segment.moves.indexOf('de', segment.moves.indexOf('\n'));
    assert.ok(beforeDrop > 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, beforeDrop) }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    let obj = game.invent;
    while (obj && obj.otyp !== TALLOW_CANDLE && obj.otyp !== OIL_LAMP)
        obj = obj.nobj;
    assert.ok(obj?.lamplit);
    const timer = findNode(game.gt.timer_base,
        (node) => node.func_index === BURN_OBJECT && node.arg === obj);
    const light = findNode(game.gl.light_base,
        (node) => node.type === LS_OBJECT && node.id === obj);
    assert.ok(timer);
    assert.ok(light);
    const timeout = timer.timeout;
    const radius = light.range;
    const { ux: x, uy: y } = game.u;
    clearTtyMessageWindow(game);
    await _dropInternals.drop(obj, game);
    assert.equal(game.level.objects[x][y], obj);
    assert.equal(obj.where, OBJ_FLOOR);
    assert.equal(obj.ox, x);
    assert.equal(obj.oy, y);
    assert.equal(obj.timed, 1);
    assert.equal(obj.lamplit, true);
    assert.equal(findNode(game.gt.timer_base, (node) => node.arg === obj), timer);
    assert.equal(findNode(game.gl.light_base, (node) => node.id === obj), light);
    assert.equal(timer.timeout, timeout);
    assert.equal(light.range, radius);
    // cmd.c movement uses the live game, so the light must stay on the
    // floor object when the hero moves. vision.c recomputes illumination.
    clearTtyMessageWindow(game);
    for (const key of ['h', 'j', 'l']) {
        await rhack(key.charCodeAt(0), game);
        vision_recalc(0, { state: game });
    }
    assert.notDeepEqual([game.u.ux, game.u.uy], [x, y]);
    assert.deepEqual([light.x, light.y], [x, y]);
    assert.ok(game.viz_array[y][x] & TEMP_LIT);
    assert.equal(light.id, obj);
    assert.equal(timer.arg, obj);
    assert.equal(timer.timeout, timeout);
}
export async function runLitDropMatrix() {
    return runFreshMatrix({
        entries: LIT_DROP_RECIPES.map((path) => ({
            label: path, recipe: loadLitDropRecipe(path),
        })),
        summaryLabel: 'LIT OBJECT DROP',
        verifySegment: verifyLitDropSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runLitDropMatrix, 'lit object drop');
