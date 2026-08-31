import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFLICT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { PM_NEWT } from '../js/monsters.js';
import {
    CONFLICT_RESISTANCE_DATETIME,
    CONFLICT_RESISTANCE_MOVES,
    CONFLICT_RESISTANCE_RC,
    CONFLICT_RESISTANCE_SEED,
    loadConflictResistanceRecipe,
    verifyConflictResistanceSegment,
} from './run-conflict-resistance.mjs';

test('Conflict resistance recipe contains replay inputs only', () => {
    const recipe = loadConflictResistanceRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.deepEqual(segment, {
        seed: CONFLICT_RESISTANCE_SEED,
        datetime: CONFLICT_RESISTANCE_DATETIME,
        nethackrc: CONFLICT_RESISTANCE_RC,
        moves: CONFLICT_RESISTANCE_MOVES,
    });
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /role:Knight/u);
    assert.match(segment.nethackrc, /playmode:debug/u);
    assert.equal(segment.moves.startsWith(' \x17ring of conflict\n'), true);
    assert.equal(segment.moves.endsWith('m.m.m.'), true);
});

test('the fresh Conflict case reaches ordinary movement after resistance',
    async () => {
        const [segment] = loadConflictResistanceRecipe().segments;
        await verifyConflictResistanceSegment(segment);
        assert.notEqual(game.u.uprops[CONFLICT]?.extrinsic ?? 0, 0);
        assert.equal(game.level.monsters[game.u.ux - 1][game.u.uy]
            .data.pmidx, PM_NEWT);
    });
