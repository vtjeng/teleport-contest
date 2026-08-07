import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadTwoWeaponCommandRecipe,
    loadTwoWeaponRefusalRecipe,
    loadTwoWeaponSwitchRecipe,
    verifyTwoWeaponCommandSegment,
} from './run-twoweapon-command.mjs';

function roleOf(segment) {
    return /role:([A-Za-z]+),race:([a-z]+),gender:([a-z]+)/u
        .exec(segment.nethackrc).slice(1).join('/');
}

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

test('the switch-off matrix issues the command twice', () => {
    const recipe = loadTwoWeaponSwitchRecipe();
    assert.equal(recipe.version, 5);
    // wield.c:847 only reaches the toggle-off arm once u.twoweap is TRUE, so
    // every segment has to succeed first and switch back afterwards.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n#twoweapon\n..',
    ));
    // The three starts whose u_init.c loadout can_twoweapon() accepts: a
    // plain weapon pair, a weapon-tool secondary, and a stacked secondary.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Samurai/human/male',
        'Archeologist/human/male',
        'Rogue/human/male',
    ]);
});

test('the refusal matrix reaches one can_twoweapon() arm per role', () => {
    const recipe = loadTwoWeaponRefusalRecipe();
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        ({ moves }) => moves === '.#twoweapon\n..',
    ));
    // wield.c:764 twice (once through the male role name and once through
    // the female one), then :771, :785 and :788.
    assert.deepEqual(recipe.segments.map(roleOf), [
        'Wizard/human/male',
        'Caveman/human/female',
        'Tourist/human/male',
        'Barbarian/human/male',
        'Valkyrie/human/female',
    ]);
});

test('every #twoweapon case reaches the arm it was chosen for',
    async () => {
        for (const recipe of [loadTwoWeaponCommandRecipe(),
                              loadTwoWeaponSwitchRecipe(),
                              loadTwoWeaponRefusalRecipe()]) {
            for (const segment of recipe.segments)
                await verifyTwoWeaponCommandSegment(segment);
        }
    });
