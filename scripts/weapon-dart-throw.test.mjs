import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadWeaponDartThrowRecipe,
    verifyWeaponDartThrowSegment,
} from './run-weapon-dart-throw.mjs';

test('weapon dart throw matrix contains replay inputs only', () => {
    const recipe = loadWeaponDartThrowRecipe();
    assert.equal(recipe.version, 5);
    // One segment is enough: the selected seed creates the dart-bearing
    // Kobold and the ten eastward moves reach its throw.
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /OPTIONS=playmode:debug/u);
    // The extcmd creates the Kobold; ten eastward moves are the shortest
    // route tested that reaches its dart throw.
    assert.equal(segment.moves, ` #wizgenesis\nkobold\n${'l'.repeat(10)}`);
});

test('weapon dart throw matrix reaches an actual dart throw', async () => {
    const [segment] = loadWeaponDartThrowRecipe().segments;
    await verifyWeaponDartThrowSegment(segment);
});
