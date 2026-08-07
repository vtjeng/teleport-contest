import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadTwoWeaponCommandRecipe,
    verifyTwoWeaponCommandSegment,
} from './run-twoweapon-command.mjs';

test('the #twoweapon matrix covers both sides of the time-cost draw', () => {
    const recipe = loadTwoWeaponCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Two seeds whose recorded rnd(20) beats Dexterity and two that do not,
    // one of which draws exactly Dexterity. wield.c:861 compares with `>`.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7710001, 7710002, 7710003, 7710004],
    );
    // Every segment issues the command through the extended-command prompt
    // and waits afterwards, so a wrongly spent move shifts a compared screen.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n..',
    ));
});

test('every #twoweapon case turns two-weapon combat on for its own cost',
    async () => {
        for (const segment of loadTwoWeaponCommandRecipe().segments)
            await verifyTwoWeaponCommandSegment(segment);
    });
