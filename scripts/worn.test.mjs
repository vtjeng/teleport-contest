import assert from 'node:assert/strict';
import test from 'node:test';

import { W_AMUL, W_ARMH } from '../js/const.js';
import { newMonster } from '../js/monst.js';
import { PM_KITTEN, monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    AMULET_OF_GUARDING,
    ORCISH_HELM,
    objects_globals_init,
} from '../js/objects.js';
import { find_mac } from '../js/worn.js';

// A kitten is monsters.h:381-388, `LVL(2, 18, 6, 0, 0)`, so its base armor
// class is 6. An orcish helm is objects.h:448, whose HELM `ac` argument is 9
// and whose a_ac is therefore `10 - 9`, that is 1.
const KITTEN_AC = 6;
const ORCISH_HELM_AC = 1;

function catalogState() {
    const state = {};
    objects_globals_init(state);
    // A zero random leaves the description shuffle in source order. find_mac()
    // reads a_ac, which the shuffle never moves, so the choice only keeps the
    // setup deterministic.
    init_objects(state, () => 0);
    monst_globals_init(state);
    return state;
}

function kitten(state, overrides = {}) {
    return newMonster({
        data: state.mons[PM_KITTEN],
        mnum: PM_KITTEN,
        ...overrides,
    });
}

function wornObject(state, otyp, mask, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: mask,
        ...overrides,
    });
}

test('find_mac answers the species armor class for a bare monster', () => {
    const state = catalogState();
    assert.equal(find_mac(kitten(state), state), KITTEN_AC);
});

test('find_mac subtracts ARM_BONUS for each slot misc_worn_check names', () => {
    const state = catalogState();
    // Plain helm: a_ac + spe - min(greatest_erosion, a_ac) is 1 + 0 - 0.
    const plain = kitten(state, {
        minvent: wornObject(state, ORCISH_HELM, W_ARMH),
        misc_worn_check: W_ARMH,
    });
    assert.equal(find_mac(plain, state), KITTEN_AC - ORCISH_HELM_AC);

    // Enchanted and eroded: 1 + 2 - min(3, 1) is 2. greatest_erosion takes the
    // larger of oeroded and oeroded2, and min() caps the loss at a_ac.
    const enchanted = kitten(state, {
        minvent: wornObject(state, ORCISH_HELM, W_ARMH, {
            spe: 2,
            oeroded: 1,
            oeroded2: 3,
        }),
        misc_worn_check: W_ARMH,
    });
    assert.equal(find_mac(enchanted, state), KITTEN_AC - 2);
});

// worn.c:724. The loop tests each object's owornmask against the monster's
// misc_worn_check, so gear the monster carries but does not use in one of
// those slots changes nothing.
test('find_mac ignores inventory outside misc_worn_check', () => {
    const state = catalogState();
    const carrying = kitten(state, {
        minvent: wornObject(state, ORCISH_HELM, W_ARMH),
        misc_worn_check: 0,
    });
    assert.equal(find_mac(carrying, state), KITTEN_AC);
});

// worn.c:725-726. An amulet of guarding is worth a flat 2 whatever its
// enchantment or erosion, which is why C spells it out beside ARM_BONUS().
test('find_mac gives an amulet of guarding a fixed two points', () => {
    const state = catalogState();
    const guarded = kitten(state, {
        minvent: wornObject(state, AMULET_OF_GUARDING, W_AMUL, {
            spe: 5,
            oeroded: 2,
        }),
        misc_worn_check: W_AMUL,
    });
    assert.equal(find_mac(guarded, state), KITTEN_AC - 2);
});

// worn.c:724. Every other case here carries a single object, so the loop runs
// once and its two control statements do nothing observable: replacing the
// `continue` with a `break`, or `obj = obj.nobj` with `obj = null`, leaves them
// all green. This case chains three objects with an unworn one in the middle,
// so a `break` stops before the amulet and the advance has somewhere to go.
test('find_mac sums every worn slot across a chained inventory', () => {
    const state = catalogState();
    const amulet = wornObject(state, AMULET_OF_GUARDING, W_AMUL);
    // Between the two worn objects, and named by neither slot, so reaching the
    // amulet requires the loop to continue rather than stop.
    const carried = wornObject(state, ORCISH_HELM, 0, { spe: 50 });
    carried.nobj = amulet;
    const helm = wornObject(state, ORCISH_HELM, W_ARMH);
    helm.nobj = carried;
    const layered = kitten(state, {
        minvent: helm,
        misc_worn_check: W_ARMH | W_AMUL,
    });
    // Helm 1 + 0 - 0 is 1; the amulet is a flat 2; the carried helm's 51 is
    // not counted. 6 - 1 - 2.
    assert.equal(find_mac(layered, state), KITTEN_AC - 3);
});

// worn.c:733-734, the same cap do_wear.c find_ac() applies to the hero.
test('find_mac caps the result at AC_MAX', () => {
    const state = catalogState();
    // 1 + 200 - 0 is 201, so the uncapped answer would be 6 - 201.
    const overloaded = kitten(state, {
        minvent: wornObject(state, ORCISH_HELM, W_ARMH, { spe: 200 }),
        misc_worn_check: W_ARMH,
    });
    assert.equal(find_mac(overloaded, state), -99);

    // The negative side alone leaves Math.sign() untested: replacing
    // `Math.sign(base) * AC_MAX` with the constant `-AC_MAX` passes. A
    // strongly negative enchantment drives base positive instead. ARM_BONUS is
    // 1 - 200 - min(0, 1), so 6 - (-199) is 205 before the cap.
    const cursed = kitten(state, {
        minvent: wornObject(state, ORCISH_HELM, W_ARMH, { spe: -200 }),
        misc_worn_check: W_ARMH,
    });
    assert.equal(find_mac(cursed, state), 99);
});
