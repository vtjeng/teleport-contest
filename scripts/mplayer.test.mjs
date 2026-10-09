import assert from 'node:assert/strict';
import test from 'node:test';

import { RLOC_ERR, RLOC_NOMSG } from '../js/const.js';
import { dev_name, mk_mplayer } from '../js/mplayer.js';
import { PM_KNIGHT } from '../js/monsters.js';
import * as O from '../js/objects.js';
import { monmightthrowwep } from '../js/weapon.js';

test('dev_name preserves the source table empty-string entry', () => {
    const state = { level: { monlist: null }, fmon: null };
    assert.equal(dev_name(state, { rn2: (size) => size - 1 }), '');
});

test('mk_mplayer relocates a monster from its requested square first', async () => {
    const blocker = { mx: 5, my: 6 };
    const monsters = Array.from({ length: 80 }, () => []);
    monsters[5][6] = blocker;
    const state = { level: { monsters } };
    const stop = new Error('stop after relocation');

    await assert.rejects(
        mk_mplayer({ pmidx: PM_KNIGHT }, 5, 6, false, {
            state,
            async relocateMonster(monster, flags, env) {
                assert.equal(monster, blocker);
                assert.equal(flags, RLOC_ERR | RLOC_NOMSG);
                assert.equal(env.state, state);
                throw stop;
            },
        }),
        (error) => error === stop,
    );
});

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
