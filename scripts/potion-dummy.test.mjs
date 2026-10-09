import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OBJ_FREE } from '../js/const.js';
import { newObject } from '../js/obj.js';
import { POT_BOOZE, POTION_CLASS } from '../js/objects.js';
import {
    POTION_DUMMY_CASES, loadPotionDummyRecipe, verifyPotionDummySegment,
} from './run-potion-dummy.mjs';

test('potion_dip zeroes the old-appearance naming dummy before docall', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/potion.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    // potion.c2776-2780 writes only these three fields after the zero copy.
    assert.match(c, /fakeobj = cg\.zeroobj;\s*fakeobj\.dknown = 1;[^\n]*\n\s*fakeobj\.otyp = old_otyp;\s*fakeobj\.oclass = POTION_CLASS;\s*docall\(&fakeobj\);/u);
    assert.match(js, /const fakeobj = newObject\(\{ dknown: 1,\s*otyp: oldType, oclass: POTION_CLASS \}\);\s*await docall\(fakeobj, state\);/u);
    assert.doesNotMatch(js, /state\.cg\.zeroobj/u);
    // decl.c cg.zeroobj starts every remaining scalar/link at zero. The
    // named source fields may not inherit quantity or identity from a potion.
    const dummy = newObject({ dknown: 1, otyp: POT_BOOZE, oclass: POTION_CLASS });
    assert.equal(dummy.quan, 0);
    assert.equal(dummy.o_id, 0);
    assert.equal(dummy.where, OBJ_FREE);
    assert.equal(dummy.v, null);
    assert.equal(dummy.cobj, null);
    assert.equal(dummy.nobj, null);
    assert.equal(dummy.blessed, false);
    assert.equal(dummy.cursed, false);
    assert.equal(dummy.dknown, 1);
    assert.equal(dummy.otyp, POT_BOOZE);
});

for (const entry of POTION_DUMMY_CASES) {
    test(`${entry.name} names only the old appearance through the production dip command`, async () => {
        // Inputs were fixed before JS comparison; C independently confirms
        // catalyst survival, fruit-juice conversion and the oldbrew response.
        await verifyPotionDummySegment(loadPotionDummyRecipe(entry.name).segments[0], entry);
    });
}
