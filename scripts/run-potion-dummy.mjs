#!/usr/bin/env node
// potion.c potion_dip2774-2780 creates a zeroed stack object for the former
// potion's call-name, then holds the transformed real potion. Independent
// C-first amethyst/horn recipes cover both catalysts and the live #dip route.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AMETHYST, UNICORN_HORN, POT_BOOZE, POT_SICKNESS, POT_FRUIT_JUICE } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const POTION_DUMMY_CASES = [
    { name: 'amethyst-booze', catalyst: AMETHYST, former: POT_BOOZE },
    { name: 'horn-sickness', catalyst: UNICORN_HORN, former: POT_SICKNESS },
];
export function loadPotionDummyRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/potion.c/dip-dummy-${name}-independent.session.json`,
        import.meta.url,
    )));
}
export async function verifyPotionDummySegment(segment, entry) {
    let boundary;
    await runSegment({ ...segment, recorderIsDst: true }, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    // The source dummy carries the former type, while the real inventory
    // potion has already become fruit juice before docall reads the name.
    assert.equal(game.objects[entry.former].oc_uname, 'oldbrew');
    assert.notEqual(game.objects[POT_FRUIT_JUICE].oc_uname, 'oldbrew');
    const carried = [];
    for (let obj = game.invent; obj; obj = obj.nobj) carried.push(obj);
    assert.ok(carried.some(obj => obj.otyp === entry.catalyst));
    assert.ok(carried.some(obj => obj.otyp === POT_FRUIT_JUICE && obj.quan === 1));
    assert.equal(carried.some(obj => obj.otyp === entry.former), false);
    assert.equal(carried.some(obj => obj.o_id === 0), false);
}
export async function runPotionDummyMatrix() {
    return runFreshMatrix({
        entries: POTION_DUMMY_CASES.map(entry => ({
            label: entry.name,
            recipe: loadPotionDummyRecipe(entry.name),
        })),
        summaryLabel: 'POTION NAMING DUMMY',
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runPotionDummyMatrix, 'potion naming dummy');
