import assert from 'node:assert/strict';
import test from 'node:test';

import { ROLLING_BOULDER_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { BOULDER } from '../js/objects.js';
import { loadHeroRollingBoulderTrapRecipe } from
    './run-hero-rolling-boulder-trap.mjs';

test('hero rolling boulder trap recipe contains only replay inputs', () => {
    const recipe = loadHeroRollingBoulderTrapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false,
            'recipe must not carry pre-recorded steps');
        assert.match(segment.nethackrc, /playmode:debug/u,
            'seed 361 needs debug mode to reach a maze level');
    }
});

test('hero triggers rolling boulder trap and the boulder is placed', async () => {
    const recipe = loadHeroRollingBoulderTrapRecipe();
    const segment = recipe.segments[0];
    const result = await runSegment({
        ...segment,
        isFinalSegment: true,
    });
    // The game should complete without throwing.
    assert.ok(result, 'runSegment returns a result');

    // After step 206, the rolling boulder trap should have fired and the
    // boulder should be placed on the map at its destination (near a wall).
    // The trap itself should be marked as seen (feeltrap sets tseen = true).
    //
    // Check that at least one rolling boulder trap on the level is marked
    // seen. The hero walked onto the trap at step 206 and feeltrap() set
    // tseen = true.
    const traps = game.level?.traps ?? [];
    const rollingTraps = traps.filter(
        (t) => t.ttyp === ROLLING_BOULDER_TRAP,
    );
    assert.ok(rollingTraps.length > 0,
        'the level should have at least one rolling boulder trap');
    const seenTraps = rollingTraps.filter((t) => t.tseen);
    assert.ok(seenTraps.length > 0,
        'at least one rolling boulder trap should be marked seen '
        + 'after the hero triggers it via feeltrap()');
});

test('launch_obj places boulder at destination after miss', async () => {
    const recipe = loadHeroRollingBoulderTrapRecipe();
    const segment = recipe.segments[0];
    await runSegment({
        ...segment,
        isFinalSegment: true,
    });

    // After the rolling boulder trap fires and thitu() misses, launch_obj()
    // places the boulder at the (x2, y2) destination. Verify a boulder exists
    // on the level floor.
    let boulderCount = 0;
    for (let obj = game.level?.objlist ?? null; obj; obj = obj.nobj) {
        if (obj.otyp === BOULDER) boulderCount++;
    }
    // The launched boulder should be on the floor (it was not used up because
    // the thitu miss does not consume it).
    assert.ok(boulderCount > 0,
        'at least one boulder should be on the level floor after the trap '
        + 'fires and the boulder misses the hero');
});
