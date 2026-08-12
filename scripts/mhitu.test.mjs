import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTECTION, W_AMUL, W_ARM, W_ARMC, W_ARMU } from '../js/const.js';
import { magic_negation } from '../js/mhitu.js';
import {
    monst_globals_init,
    PM_ALIGNED_CLERIC,
    PM_HUMAN,
    PM_KI_RIN,
} from '../js/monsters.js';
import {
    AMULET_OF_GUARDING,
    CLOAK_OF_PROTECTION,
    ELVEN_MITHRIL_COAT,
    HAWAIIAN_SHIRT,
    LEATHER_ARMOR,
    objects_globals_init,
} from '../js/objects.js';

// mhitu.c magic_negation() reads the invent chain, the objects[] catalog,
// u.uprops[PROTECTION], u.ublessed, u.uspellprot and youmonst.data. Nothing
// else, so the hero can be built by hand rather than started. Both catalogs
// are the real ones: a stand-in mons[] would leave the aligned-cleric
// comparison reading undefined on both sides.
function heroState({
    worn = [],
    intrinsic = 0,
    extrinsic = 0,
    ublessed = 0,
    uspellprot = 0,
    mnum = PM_HUMAN,
} = {}) {
    const state = { u: { uprops: [], ublessed, uspellprot } };
    objects_globals_init(state);
    monst_globals_init(state);
    state.youmonst = { data: state.mons[mnum] };
    state.u.uprops[PROTECTION] = { intrinsic, extrinsic, blocked: 0 };
    state.invent = null;
    for (const [otyp, owornmask] of [...worn].reverse())
        state.invent = { otyp, owornmask, nobj: state.invent };
    return state;
}

test('magic_negation takes the highest a_can of the worn armor', () => {
    // objects.c a_can, read from js/objects.js: a Hawaiian shirt is 0, leather
    // armor is 1, an elven mithril coat is 2. The suit and the shirt are worn
    // together so the answer has to be the maximum rather than the last seen.
    const bare = heroState();
    assert.equal(magic_negation(bare.youmonst, bare), 0);
    let state = heroState({ worn: [[HAWAIIAN_SHIRT, W_ARMU]] });
    assert.equal(magic_negation(state.youmonst, state), 0);
    state = heroState({
        worn: [[ELVEN_MITHRIL_COAT, W_ARM], [HAWAIIAN_SHIRT, W_ARMU]],
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
    state = heroState({
        worn: [[HAWAIIAN_SHIRT, W_ARMU], [LEATHER_ARMOR, W_ARM]],
    });
    assert.equal(magic_negation(state.youmonst, state), 1);
});

test('magic_negation ignores armor that is only carried', () => {
    // The a_can field applies to worn armor alone, which is why C tests
    // owornmask rather than the object class. An owornmask of 0 is what an
    // item in the pack carries.
    const state = heroState({ worn: [[ELVEN_MITHRIL_COAT, 0]] });
    assert.equal(magic_negation(state.youmonst, state), 0);
});

test('extrinsic Protection adds one, or two through a worn amulet', () => {
    // mhitu.c:1122-1126. The leather armor supplies mc 1 in both rows, so the
    // difference between them is the amulet alone.
    let state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM]], extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM], [AMULET_OF_GUARDING, W_AMUL]],
        extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 3);
    // A worn amulet that is not the amulet of guarding leaves via_amul FALSE.
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM], [AMULET_OF_GUARDING + 1, W_AMUL]],
        extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 2);
});

test('magic_negation clamps the extrinsic bonus at three', () => {
    // A cloak of protection has a_can 3 and confers extrinsic Protection, so
    // C's `mc += 1` would reach 4 without the cap at mhitu.c:1125-1126.
    const state = heroState({
        worn: [[CLOAK_OF_PROTECTION, W_ARMC]], extrinsic: W_ARMC,
    });
    assert.equal(magic_negation(state.youmonst, state), 3);
});

test('intrinsic Protection lifts a bare hero to one, not above', () => {
    // mhitu.c:1127-1135. The arm needs mc below 1, so leather armor's 1 keeps
    // it out; and intrinsic Protection alone is not enough without u.ublessed.
    let state = heroState({ intrinsic: 1 });
    assert.equal(magic_negation(state.youmonst, state), 0);
    state = heroState({ intrinsic: 1, ublessed: 1 });
    assert.equal(magic_negation(state.youmonst, state), 1);
    // u.uspellprot reaches the same arm on its own.
    state = heroState({ uspellprot: 1 });
    assert.equal(magic_negation(state.youmonst, state), 1);
    // With mc already 1 the arm is skipped, so nothing doubles up.
    state = heroState({
        worn: [[LEATHER_ARMOR, W_ARM]], intrinsic: 1, ublessed: 1,
    });
    assert.equal(magic_negation(state.youmonst, state), 1);
});

test('an aligned cleric or a minion form lifts the hero to one', () => {
    // The second half of mhitu.c:1131-1133 reads mon->data, which for the hero
    // is the polymorph form. Both terms are separate from the u.uspellprot
    // test above, so each needs its own row, and PM_HUMAN answering 0 above is
    // what makes the form the reason rather than the state.
    const cleric = heroState({ mnum: PM_ALIGNED_CLERIC });
    assert.equal(magic_negation(cleric.youmonst, cleric), 1);

    // mondata.h is_minion() reads M2_MINION, which a ki-rin carries.
    const minion = heroState({ mnum: PM_KI_RIN });
    assert.equal(magic_negation(minion.youmonst, minion), 1);
});

test('magic_negation refuses a monster', () => {
    // uhitm.c:86 passes a monster; that half needs worn.c protects(), so the
    // port throws rather than answering a factor it did not compute.
    const state = heroState();
    assert.throws(
        () => magic_negation({ data: state.mons[PM_HUMAN] }, state),
        (error) => error instanceof TypeError
            && /covers only the hero/u.test(error.message),
    );
});
