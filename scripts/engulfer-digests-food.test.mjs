import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { _dropInternals } from '../js/do.js';
import {
    AD_DGST,
    AT_ENGL,
    NON_PM,
    PM_CHAMELEON,
    PM_GENETIC_ENGINEER,
    PM_TROLL,
    monst_globals_init,
} from '../js/monsters.js';
import { CORPSE, FOOD_RATION, MEATBALL } from '../js/objects.js';

const OBJ_H = readFileSync(
    new URL('../nethack-c/upstream/include/obj.h', import.meta.url),
    'utf8',
);

test('engulfer corpse polymorph matches the source polyfood predicate', () => {
    // do.c:867 calls polyfood() only in its CORPSE arm. The macro itself
    // admits corpse, egg, and tin; for this caller, the tested branch is the
    // corpsenm >= LOW_PM and (pm_to_cham || AD_POLY) predicate.
    assert.match(
        OBJ_H,
        /#define ofood\(o\)\s+\(\(o\)->otyp == CORPSE \|\| \(o\)->otyp == EGG \|\| \(o\)->otyp == TIN\)/u,
    );
    assert.match(
        OBJ_H,
        /#define polyfood\(obj\)[\s\S]*pm_to_cham\(\(obj\)->corpsenm\) != NON_PM[\s\S]*dmgtype\(&mons\[\(obj\)->corpsenm\], AD_POLY\)/u,
    );

    const state = {};
    monst_globals_init(state);
    const polyfood = (corpsenm) => _dropInternals.engulfer_polyfood(
        { otyp: CORPSE, corpsenm },
        state,
    );
    const before = state.mons;

    assert.equal(polyfood(PM_CHAMELEON), true);
    assert.equal(polyfood(PM_GENETIC_ENGINEER), true);
    assert.equal(polyfood(PM_TROLL), false);
    assert.equal(polyfood(NON_PM), false);
    assert.equal(state.mons, before);
});

test('engulfer digestion ignores ordinary food and nondigesting holders', async () => {
    const state = {
        u: {
            ustuck: {
                data: { mattk: [{ aatyp: AT_ENGL, adtyp: AD_DGST }] },
            },
        },
    };
    const food = { otyp: FOOD_RATION, globby: false };
    assert.equal(
        await _dropInternals.engulfer_digests_food(food, state),
        false,
    );

    state.u.ustuck.data.mattk[0].adtyp = 0;
    const meat = { otyp: MEATBALL, globby: false };
    assert.equal(
        await _dropInternals.engulfer_digests_food(meat, state),
        false,
    );
});
