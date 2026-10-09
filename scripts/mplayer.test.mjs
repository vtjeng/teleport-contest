import assert from 'node:assert/strict';
import test from 'node:test';

import * as O from '../js/objects.js';
import { monmightthrowwep } from '../js/weapon.js';

test('monmightthrowwep matches weapon.c rwep in source order', () => {
    const sourceRwep = [
        O.DWARVISH_SPEAR, O.SILVER_SPEAR, O.ELVEN_SPEAR, O.SPEAR,
        O.ORCISH_SPEAR, O.JAVELIN, O.SHURIKEN, O.YA, O.SILVER_ARROW,
        O.ELVEN_ARROW, O.ARROW, O.ORCISH_ARROW, O.CROSSBOW_BOLT,
        O.SILVER_DAGGER, O.ELVEN_DAGGER, O.DAGGER, O.ORCISH_DAGGER,
        O.KNIFE, O.FLINT, O.ROCK, O.LOADSTONE, O.LUCKSTONE, O.DART,
        O.CREAM_PIE,
    ];
    for (const otyp of sourceRwep)
        assert.equal(monmightthrowwep({ otyp }), true, `otyp=${otyp}`);
    assert.equal(monmightthrowwep({ otyp: O.LONG_SWORD }), false);
});
