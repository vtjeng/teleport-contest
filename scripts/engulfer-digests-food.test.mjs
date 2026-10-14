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
const DO_C = readFileSync(
    new URL('../nethack-c/upstream/src/do.c', import.meta.url),
    'utf8',
);
const DO_JS = readFileSync(
    new URL('../js/do.js', import.meta.url),
    'utf8',
);

test('swallowed corpse digestion keeps C deletion timer ownership', () => {
    const cDropz = DO_C.match(
        /dropz\(struct obj \*obj, boolean with_impact\)[\s\S]*?\n\}/u,
    )?.[0];
    const cDigest = DO_C.match(
        /engulfer_digests_food\(struct obj \*obj\)[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(cDropz);
    assert.ok(cDigest);
    assert.match(cDropz, /engulfer_digests_food\(obj\)/u);
    assert.match(cDigest, /minstapetrify\(u\.ustuck, TRUE\)/u);
    assert.match(cDigest, /delobj\(obj\)/u);

    assert.match(
        DO_JS,
        /engulfer_digests_food\(obj, state, digestionEnv\)/u,
    );
    assert.match(
        DO_JS,
        /stopObjectTimers: normalized\.hooks\.stopObjectTimers\s*\?\?\s*\(\(item, hookEnv\) => obj_stop_timers\(/u,
    );
    assert.match(DO_JS, /await minstapetrify\(swallower, true, state, env\)/u);
    assert.match(
        DO_JS,
        /healmon\(swallower, swallower\.mhpmax, 0\);\s*await mcureblindness\(swallower, false, state\);/u,
    );
    assert.doesNotMatch(DO_JS, /note_unported\(['"]mon\.c mcureblindness/u);
    assert.match(DO_JS, /delobj\(obj, \{ \.\.\.env, state \}\)/u);
});

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
