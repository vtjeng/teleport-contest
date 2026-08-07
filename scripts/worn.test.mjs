import assert from 'node:assert/strict';
import test from 'node:test';

import {
    I_SPECIAL,
    LAST_PROP,
    OBJ_FREE,
    OBJ_MINVENT,
    W_AMUL,
    W_ARM,
    W_ARMH,
    W_WEP,
} from '../js/const.js';
import { newMonster } from '../js/monst.js';
import { PM_KITTEN, monst_globals_init } from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    AMULET_OF_GUARDING,
    ARROW,
    BOW,
    DART,
    GOLD_DRAGON_SCALE_MAIL,
    KATANA,
    ORCISH_HELM,
    objects_globals_init,
} from '../js/objects.js';
import {
    extract_from_minvent,
    find_mac,
    setuwep,
    which_armor,
} from '../js/worn.js';

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

// worn.c:1031-1034, the monster branch. The loop answers the first minvent
// object whose owornmask carries a queried bit, and falls out to null when no
// object does. Every case below chains three objects so that the walk has
// somewhere to go past its first link.
test('which_armor answers the first minvent object worn in a queried slot',
    () => {
        const state = catalogState();
        const mail = wornObject(state, GOLD_DRAGON_SCALE_MAIL, W_ARM);
        const amulet = wornObject(state, AMULET_OF_GUARDING, W_AMUL);
        amulet.nobj = mail;
        const helm = wornObject(state, ORCISH_HELM, W_ARMH);
        helm.nobj = amulet;
        const dressed = kitten(state, {
            minvent: helm,
            misc_worn_check: W_ARMH | W_AMUL | W_ARM,
        });

        // Two links in: the mask test must reject the helm and the amulet,
        // whose owornmask shares no bit with W_ARM.
        assert.equal(which_armor(dressed, W_ARM), mail);
        // The first link answers, which is the case the walk must not skip.
        assert.equal(which_armor(dressed, W_ARMH), helm);
        // Nothing is wielded, so the walk runs off the end and returns null.
        // C's `obj->owornmask & flag` rejects each object; an inclusive test
        // would accept the helm and answer it instead.
        assert.equal(which_armor(dressed, W_WEP), null);
        // A monster carrying nothing never enters the loop at all.
        assert.equal(which_armor(kitten(state, { minvent: null }), W_ARM),
            null);
    });

// ── worn.c extract_from_minvent() ──

// A hit point count that DEADMONSTER() rejects and one it accepts. C's macro
// is `mhp < 1`, so 1 is the lowest living value and 0 the highest dead one.
const ALIVE_HP = 1;
const DEAD_HP = 0;

// Build a monster carrying `held` in minvent, plus a recorder for each hook
// extract_from_minvent() can reach.
function carrier(state, held, overrides = {}) {
    const mon = kitten(state, { mhp: ALIVE_HP, minvent: held, ...overrides });
    held.where = OBJ_MINVENT;
    held.ocarry = mon;
    const calls = { updateMonExtrinsics: [], mwepgone: [], endArtifactLight: [] };
    const env = {
        state,
        hooks: {
            updateMonExtrinsics: (...args) => {
                calls.updateMonExtrinsics.push(args.slice(0, 4));
            },
            mwepgone: (subject) => { calls.mwepgone.push(subject); },
            endArtifactLight: (obj) => { calls.endArtifactLight.push(obj); },
        },
    };
    return { mon, env, calls };
}

test('extract_from_minvent frees an unequipped object and leaves gear alone',
    () => {
        const state = catalogState();
        // owornmask 0 is the only case steal.c mdrop_obj() reaches: it refuses
        // an equipped object before calling this.
        const held = wornObject(state, ORCISH_HELM, 0);
        const { mon, env, calls } = carrier(state, held, {
            misc_worn_check: W_AMUL,
        });

        extract_from_minvent(mon, held, false, true, env);

        assert.equal(mon.minvent, null);
        assert.equal(held.where, OBJ_FREE);
        assert.equal(held.ocarry, null);
        assert.equal(held.owornmask, 0);
        // worn.c:1404-1412 sits behind `if (unwornmask)`, so an unequipped
        // object neither clears a slot nor schedules the gear recheck.
        assert.equal(mon.misc_worn_check, W_AMUL);
        assert.deepEqual(calls.updateMonExtrinsics, []);
        assert.deepEqual(calls.mwepgone, []);
        assert.deepEqual(calls.endArtifactLight, []);
    });

test('extract_from_minvent clears an equipped slot and reschedules gear',
    () => {
        const state = catalogState();
        const held = wornObject(state, ORCISH_HELM, W_ARMH);
        const { mon, env, calls } = carrier(state, held, {
            misc_worn_check: W_ARMH | W_AMUL,
        });

        // worn.c:1408 clears only the bits the object itself wore; the amulet
        // slot survives. worn.c:1411 then sets I_SPECIAL.
        extract_from_minvent(mon, held, true, true, env);

        assert.equal(held.owornmask, 0);
        assert.equal(mon.misc_worn_check, W_AMUL | I_SPECIAL);
        // worn.c:1406 passes on=FALSE and the caller's own `silently`.
        assert.deepEqual(
            calls.updateMonExtrinsics,
            [[mon, held, false, true]],
        );
        assert.deepEqual(calls.mwepgone, []);

        // The same slot with the caller's other `silently` value. worn.c:1406
        // forwards the parameter rather than choosing the flag itself, and
        // steal.c mdrop_obj()'s hardcoded TRUE is unreachable through that
        // function, so this call is the port's only cover for the FALSE side.
        const loud = catalogState();
        const spoken = wornObject(loud, ORCISH_HELM, W_ARMH);
        const noisy = carrier(loud, spoken, {
            misc_worn_check: W_ARMH | W_AMUL,
        });
        extract_from_minvent(noisy.mon, spoken, true, false, noisy.env);
        assert.deepEqual(
            noisy.calls.updateMonExtrinsics,
            [[noisy.mon, spoken, false, false]],
        );
    });

test('extract_from_minvent skips update_mon_extrinsics on two conditions',
    () => {
        const state = catalogState();
        // steal.c mdrop_obj() passes do_extrinsics=FALSE precisely so that
        // removing a steed's saddle cannot throw its rider before the drop.
        const deferred = catalogState();
        const saddleLike = wornObject(deferred, ORCISH_HELM, W_ARMH);
        const withoutExtrinsics = carrier(deferred, saddleLike, {
            misc_worn_check: W_ARMH,
        });
        extract_from_minvent(
            withoutExtrinsics.mon, saddleLike, false, true, withoutExtrinsics.env,
        );
        assert.deepEqual(withoutExtrinsics.calls.updateMonExtrinsics, []);
        // The rest of the equipped arm still runs.
        assert.equal(withoutExtrinsics.mon.misc_worn_check, I_SPECIAL);

        // worn.c:1405's other term is !DEADMONSTER(mon), which is `mhp < 1`.
        const held = wornObject(state, ORCISH_HELM, W_ARMH);
        const dead = carrier(state, held, {
            mhp: DEAD_HP,
            misc_worn_check: W_ARMH,
        });
        extract_from_minvent(dead.mon, held, true, true, dead.env);
        assert.deepEqual(dead.calls.updateMonExtrinsics, []);
        assert.equal(dead.mon.misc_worn_check, I_SPECIAL);
    });

test('extract_from_minvent unwields a weapon and ends an armor artifact light',
    () => {
        const state = catalogState();
        // worn.c:1414 is a bit test on W_WEP alone, so a monster wielding and
        // wearing the same mask value still gets exactly one mwepgone().
        const wielded = wornObject(state, ORCISH_HELM, W_WEP);
        const weapon = carrier(state, wielded, { misc_worn_check: W_WEP });
        extract_from_minvent(weapon.mon, wielded, false, true, weapon.env);
        assert.deepEqual(weapon.calls.mwepgone, [weapon.mon]);

        // worn.c:1399-1400 runs before owornmask is cleared, because
        // artifact_light() expects W_ARM to still be set. Gold dragon scale
        // mail is artifact_light()'s non-artifact case.
        const lit = catalogState();
        const scales = wornObject(lit, GOLD_DRAGON_SCALE_MAIL, W_ARM, {
            lamplit: true,
        });
        const burning = carrier(lit, scales, { misc_worn_check: W_ARM });
        extract_from_minvent(burning.mon, scales, false, true, burning.env);
        assert.deepEqual(burning.calls.endArtifactLight, [scales]);
        assert.deepEqual(burning.calls.mwepgone, []);

        // The same armor unlit takes no end_burn().
        const dark = catalogState();
        const cold = wornObject(dark, GOLD_DRAGON_SCALE_MAIL, W_ARM);
        const quiet = carrier(dark, cold, { misc_worn_check: W_ARM });
        extract_from_minvent(quiet.mon, cold, false, true, quiet.env);
        assert.deepEqual(quiet.calls.endArtifactLight, []);
    });

test('extract_from_minvent rejects an object outside a monster inventory',
    () => {
        const state = catalogState();
        const held = wornObject(state, ORCISH_HELM, 0);
        const { mon, env } = carrier(state, held);
        // C reports impossible() and returns; the port has no caller that can
        // arrive this way, so it stops.
        held.where = OBJ_FREE;
        assert.throws(
            () => extract_from_minvent(mon, held, false, true, env),
            /not in minvent/u,
        );
    });

// wield.c:128-134 computes gu.unweapon: a wielded weapon that is a launcher,
// ammunition, a missile, or a polearm on foot leaves the hero "not really
// wielding a weapon", and everything else does not. js/worn.js setuwep()
// owns the same expression, so each of its terms needs its own case.
function heroWieldState() {
    const state = catalogState();
    state.invent = null;
    state.uwep = null;
    state.u = {
        uroleplay: {},
        // setworn() reads every property slot it clears, so the hero needs a
        // full uprops table rather than the sparse ones the monster cases use.
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
    };
    return state;
}

test('setuwep marks a launcher, ammunition and a missile as no weapon', () => {
    // objects.c gives the bow oc_skill P_BOW, the arrow -P_BOW and the dart
    // -P_DART, which is_launcher(), is_ammo() and is_missile() read in turn.
    for (const otyp of [BOW, ARROW, DART]) {
        const state = heroWieldState();
        setuwep(wornObject(state, otyp, 0), { state });
        assert.equal(state.unweapon, true);
    }
    // A katana matches none of the three, so it is a real melee weapon.
    const melee = heroWieldState();
    setuwep(wornObject(melee, KATANA, 0), { state: melee });
    assert.equal(melee.unweapon, false);
});
