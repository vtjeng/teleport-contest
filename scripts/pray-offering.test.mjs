import assert from 'node:assert/strict';
import test from 'node:test';

import { sacrifice_value } from '../js/pray.js';
import { CORPSE } from '../js/objects.js';
import { PM_ACID_BLOB, PM_JACKAL } from '../js/monsters.js';

test('sacrifice_value follows the source age, ice, and eaten-corpse rules', () => {
    const state = {
        moves: 100,
        mons: [],
    };
    state.mons[PM_JACKAL] = { difficulty: 1, cnutrit: 30 };
    state.mons[PM_ACID_BLOB] = { difficulty: 2, cnutrit: 20 };

    // pray.c:1844 accepts a corpse exactly when moves <= icedAge + 50.
    assert.equal(sacrifice_value({
        otyp: CORPSE, corpsenm: PM_JACKAL, age: 50,
    }, state), 2);
    assert.equal(sacrifice_value({
        otyp: CORPSE, corpsenm: PM_JACKAL, age: 49,
    }, state), 0);

    // mkobj.c:2422-2438 counts time on ice at half speed before the same
    // corpse-age comparison.
    assert.equal(sacrifice_value({
        otyp: CORPSE, corpsenm: PM_JACKAL, age: 25, on_ice: true,
    }, state), 2);

    // Acid blobs bypass the age test; difficulty + 1 is the base value.
    assert.equal(sacrifice_value({
        otyp: CORPSE, corpsenm: PM_ACID_BLOB, age: 0,
    }, state), 3);

    // eat.c:eaten_stat scales the corpse's value by its remaining nutrition,
    // with the source minimum of one.
    assert.equal(sacrifice_value({
        otyp: CORPSE, corpsenm: PM_JACKAL, age: 50, oeaten: 15,
    }, state), 1);
    assert.equal(state.moves, 100, 'the pure value calculation changes no state');
});
