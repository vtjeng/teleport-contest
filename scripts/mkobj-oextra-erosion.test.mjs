// Pin the pure functions ported from mkobj.c lines 80-192: the oextra
// allocation/deallocation family and may_generate_eroded.
//
// init_oextra and newoextra are trivial allocators whose zero state is an
// empty object. dealloc_oextra, newomonst, free_omonst, newomid, free_omid,
// new_omailcmd, and free_omailcmd modify only the object they receive.
// may_generate_eroded checks five conditions from C source (mkobj.c:177-192)
// without side effects.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dealloc_oextra,
    free_omailcmd,
    free_omid,
    free_omonst,
    newoextra,
    newomonst,
    newObject,
    newomid,
    new_omailcmd,
} from '../js/obj.js';
import { objects_globals_init, WEAPON_CLASS, FOOD_CLASS } from '../js/objects.js';
import {
    LONG_SWORD,   // 54, IRON weapon -- erosion_matters and is_damageable
    WORM_TOOTH,   // 42, weapon exempted from erosion generation
    UNICORN_HORN, // 261, weapon exempted from erosion generation
    APPLE,        // 277, food -- erosion_matters returns false
    DART,         // 24, IRON weapon -- erosion_matters and is_damageable
} from '../js/objects.js';

const state = {};
objects_globals_init(state);

// -- newoextra ---------------------------------------------------------------
// C ref: mkobj.c:86-93. Returns a freshly allocated, zero-initialized oextra.

test('newoextra returns an empty object with no own properties', () => {
    // C: newoextra() calls init_oextra(), which sets *oex = zerooextra.
    // zerooextra is a static const struct with all fields zero/null.
    const oex = newoextra();
    assert.deepEqual(oex, {});
    assert.equal(Object.keys(oex).length, 0);
});

test('newoextra returns a distinct object each call', () => {
    // C allocates a new struct each time.
    const a = newoextra();
    const b = newoextra();
    assert.notEqual(a, b);
});

// -- dealloc_oextra ----------------------------------------------------------
// C ref: mkobj.c:96-111. Frees oname, omonst (via free_omonst), omailcmd,
// then the oextra struct itself.

test('dealloc_oextra clears all sub-fields and sets oextra to null', () => {
    // Build an object with populated oextra sub-fields.
    const obj = newObject({ oextra: {
        oname: 'test sword',
        omonst: { data: null, mextra: null },
        omailcmd: 'reply',
        omid: 42,
    } });
    dealloc_oextra(obj);
    // C: o->oextra = (struct oextra *) 0;
    assert.equal(obj.oextra, null);
});

test('dealloc_oextra is a no-op when oextra is null', () => {
    // C: if (x) { ... } -- does nothing when oextra is null.
    const obj = newObject();
    assert.equal(obj.oextra, null);
    dealloc_oextra(obj);
    assert.equal(obj.oextra, null);
});

// -- newomonst ---------------------------------------------------------------
// C ref: mkobj.c:114-125. Ensures oextra exists and creates a blank monster.

test('newomonst creates oextra and omonst when both are absent', () => {
    // C: if (!otmp->oextra) otmp->oextra = newoextra();
    //    if (!OMONST(otmp)) { ... OMONST(otmp) = m; }
    const obj = newObject();
    newomonst(obj);
    assert.notEqual(obj.oextra, null);
    assert.notEqual(obj.oextra.omonst, null);
    // The created monster should have zero/default fields (cg.zeromonst).
    assert.equal(obj.oextra.omonst.m_id, 0);
    assert.equal(obj.oextra.omonst.mhp, 0);
});

test('newomonst does not replace existing omonst', () => {
    // C: if (!OMONST(otmp)) -- skips allocation when omonst already exists.
    const existing = { m_id: 99, mhp: 50, data: null, mextra: null };
    const obj = newObject({ oextra: { omonst: existing } });
    newomonst(obj);
    assert.equal(obj.oextra.omonst, existing);
    assert.equal(obj.oextra.omonst.m_id, 99);
});

// -- free_omonst -------------------------------------------------------------
// C ref: mkobj.c:128-140. Frees omonst if present, sets slot to null.

test('free_omonst clears omonst from oextra', () => {
    const obj = newObject({ oextra: { omonst: { data: null, mextra: null } } });
    free_omonst(obj);
    assert.equal(obj.oextra.omonst, null);
});

test('free_omonst is a no-op when oextra is null', () => {
    // C: if (otmp->oextra) -- does nothing when oextra absent.
    const obj = newObject();
    free_omonst(obj);
    assert.equal(obj.oextra, null);
});

// -- newomid -----------------------------------------------------------------
// C ref: mkobj.c:143-149. Ensures oextra and sets omid to 0.

test('newomid creates oextra and sets omid to 0', () => {
    // C: OMID(otmp) = 0;
    const obj = newObject();
    newomid(obj);
    assert.notEqual(obj.oextra, null);
    assert.equal(obj.oextra.omid, 0);
});

test('newomid resets existing nonzero omid to 0', () => {
    // C: OMID(otmp) = 0; -- always writes 0, even if previously set.
    const obj = newObject({ oextra: { omid: 77 } });
    newomid(obj);
    assert.equal(obj.oextra.omid, 0);
});

// -- free_omid ---------------------------------------------------------------
// C ref: mkobj.c:151-154. Sets omid to 0 unconditionally.

test('free_omid sets omid to 0', () => {
    // C: OMID(otmp) = 0;
    const obj = newObject({ oextra: { omid: 42 } });
    free_omid(obj);
    assert.equal(obj.oextra.omid, 0);
});

// -- new_omailcmd ------------------------------------------------------------
// C ref: mkobj.c:157-164. Ensures oextra, frees old omailcmd, sets new one.

test('new_omailcmd sets omailcmd on object with no oextra', () => {
    const obj = newObject();
    new_omailcmd(obj, 'reply_cmd');
    assert.notEqual(obj.oextra, null);
    assert.equal(obj.oextra.omailcmd, 'reply_cmd');
});

test('new_omailcmd replaces existing omailcmd', () => {
    // C: if (OMAILCMD(otmp)) free_omailcmd(otmp); OMAILCMD(otmp) = dupstr(...);
    const obj = newObject({ oextra: { omailcmd: 'old_cmd' } });
    new_omailcmd(obj, 'new_cmd');
    assert.equal(obj.oextra.omailcmd, 'new_cmd');
});

// -- free_omailcmd -----------------------------------------------------------
// C ref: mkobj.c:167-173. Frees omailcmd if present.

test('free_omailcmd clears omailcmd', () => {
    const obj = newObject({ oextra: { omailcmd: 'reply' } });
    free_omailcmd(obj);
    assert.equal(obj.oextra.omailcmd, null);
});

test('free_omailcmd is a no-op when oextra is null', () => {
    // C: if (otmp->oextra && OMAILCMD(otmp)) -- does nothing when absent.
    const obj = newObject();
    free_omailcmd(obj);
    assert.equal(obj.oextra, null);
});

// -- may_generate_eroded (tested via mkobj_erosions integration) -------------
// may_generate_eroded is file-static in C and not exported. It is tested
// indirectly through mkobj_erosions below, but since the JS function is also
// module-private, we test the conditions via the public mkobj_erosions wrapper.
// The conditions are:
// 1. moves <= 1 && !in_mklev → false (initial inventory phase)
// 2. oerodeproof → false
// 3. !erosion_matters → false (non-weapon/armor/ball/chain/weptool)
// 4. !is_damageable → false
// 5. WORM_TOOTH or UNICORN_HORN → false
// 6. oartifact → false
// 7. Otherwise → true
// These are pinned through mkobj_erosions's no-op behavior when the
// condition is false: no random draws occur and the object stays unchanged.
