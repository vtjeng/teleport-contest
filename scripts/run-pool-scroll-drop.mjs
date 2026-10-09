#!/usr/bin/env node
// Independent C-first, unsearched seeds17532011/17532012 and clock20531120122534.
// Flying air elemental avoids the admitted aquatic-form immersion path.
// C inventory probes established n/o for the wished ordinary/blank scrolls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBJ_FLOOR, OBJ_INVENT } from '../js/const.js';
import { is_pool } from '../js/dbridge.js';
import { _dropInternals } from '../js/do.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SCR_BLANK_PAPER, SCROLL_CLASS } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const POOL_SCROLL_CASES = [
    { name: 'scroll-flying', letter: 'n' },
    { name: 'blank-paper-variation', letter: 'o' },
];
export function loadPoolScrollRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/do.c/drop-pool-${name}.session.json`, import.meta.url)));
}
export async function verifyPoolScrollSegment(segment) {
    const entry = POOL_SCROLL_CASES.find(candidate =>
        segment.moves.includes(`d${candidate.letter}.`));
    assert.ok(entry, 'C-confirmed inventory letter identifies the variation');
    const dropIndex = segment.moves.lastIndexOf(`d${entry.letter}.`);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, dropIndex) }, {
        onBoundary: error => { boundary = error; },
    });
    if (boundary) throw boundary;
    let obj = game.invent;
    while (obj && obj.invlet !== entry.letter) obj = obj.nobj;
    assert.ok(obj);
    assert.equal(obj.oclass, SCROLL_CLASS);
    assert.equal(obj.where, OBJ_INVENT);
    const { ux: x, uy: y } = game.u;
    assert.ok(is_pool(x, y, game));
    assert.equal(Boolean(game.u.uinwater), false);
    const drawsBefore = getRngLog().length;
    clearTtyMessageWindow(game);
    await _dropInternals.drop(obj, game);
    // dropx frees the original object; water_damage never destroys a scroll,
    // and both chosen C draws cross the Luck + 5 protection threshold.
    assert.equal(getRngLog().length, drawsBefore + 1);
    assert.equal(obj.otyp, SCR_BLANK_PAPER);
    assert.equal(obj.where, OBJ_FLOOR);
    assert.equal(obj.ox, x);
    assert.equal(obj.oy, y);
    assert.strictEqual(game.level.objects[x][y], obj);
    for (let item = game.invent; item; item = item.nobj)
        assert.notStrictEqual(item, obj);
    assert.match(game._ttyToplines, /Plop!/u);
    assert.doesNotMatch(game._ttyToplines, /fade/u); // C carried(obj) is false.
}
export function runPoolScrollMatrix() {
    return runFreshMatrix({
        entries: POOL_SCROLL_CASES.map(entry => ({
            label: entry.name, recipe: loadPoolScrollRecipe(entry.name),
        })),
        summaryLabel: 'POOL SCROLL DROP', chunkLimit: 1,
        verifySegment: verifyPoolScrollSegment,
    });
}
runMatrixCli(import.meta.url, runPoolScrollMatrix, 'pool scroll drop');
