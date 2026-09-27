import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { avoid_ceiling } from '../js/dungeon.js';

const dungeonSource = readFileSync(
    new URL('../nethack-c/upstream/src/dungeon.c', import.meta.url),
    'utf8',
);

test('avoid_ceiling follows dungeon.c quest and ceiling predicates', () => {
    const sourceFunction = dungeonSource.match(
        /avoid_ceiling\(d_level \*lev\)[^{]*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(sourceFunction, 'dungeon.c avoid_ceiling source is present');
    assert.match(sourceFunction,
        /if\s*\(In_quest\(lev\)\s*\|\|\s*!has_ceiling\(lev\)\)/u);

    const state = {
        quest_dnum: 2,
        astral_level: { dnum: 9, dlevel: 1 },
        earth_level: { dnum: 9, dlevel: 5 },
    };
    assert.equal(avoid_ceiling({ dnum: 1, dlevel: 3 }, state), false);
    assert.equal(avoid_ceiling({ dnum: 2, dlevel: 3 }, state), true);
    assert.equal(avoid_ceiling({ dnum: 9, dlevel: 2 }, state), true);
    assert.equal(avoid_ceiling({ dnum: 9, dlevel: 5 }, state), false);
});
