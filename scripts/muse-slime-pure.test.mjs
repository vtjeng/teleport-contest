// Pin the pure functions cures_sliming() and green_mon() from muse.c.
// Every expected value derives from the C source, the species entries in
// monst.c/monattk.h, and the object definitions in objects.c.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as M from '../js/monsters.js';
import * as O from '../js/objects.js';
import { cures_sliming, green_mon } from '../js/muse.js';

// ---------- green_mon() ----------
// C ref: muse.c green_mon() (3249-3258). Returns TRUE when the monster's
// mcolor is CLR_GREEN (2) or CLR_BRIGHT_GREEN (10), and the hero is not
// hallucinating.

test('green_mon: green slime has CLR_GREEN (2), returns true', () => {
    // monst.c entry for green slime: mcolor = CLR_GREEN = 2
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GREEN_SLIME] };
    const state = {};
    assert.equal(green_mon(mon, state), true);
});

test('green_mon: gecko has CLR_GREEN (2), returns true', () => {
    // monst.c entry for gecko: mcolor = CLR_GREEN = 2
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GECKO] };
    assert.equal(green_mon(mon, {}), true);
});

test('green_mon: leprechaun has CLR_GREEN (2), returns true', () => {
    // monst.c entry for leprechaun: mcolor = CLR_GREEN = 2
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_LEPRECHAUN] };
    assert.equal(green_mon(mon, {}), true);
});

test('green_mon: red dragon has CLR_RED (1), returns false', () => {
    // monst.c entry for red dragon: mcolor = CLR_RED = 1
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_RED_DRAGON] };
    assert.equal(green_mon(mon, {}), false);
});

test('green_mon: newt has CLR_YELLOW (11), returns false', () => {
    // monst.c entry for newt: mcolor = CLR_YELLOW = 11
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_NEWT] };
    assert.equal(green_mon(mon, {}), false);
});

test('green_mon: returns false under hallucination regardless of color', () => {
    // C: if (Hallucination) return FALSE; -- hallucinating hero can't tell
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GREEN_SLIME] };
    // muse.js Hallucination() checks uprops[HALLUC].intrinsic is truthy and
    // uprops[HALLUC_RES] has neither intrinsic nor extrinsic set.
    const HALLUC = 23;     // const.js HALLUC = 23
    const HALLUC_RES = 62; // const.js HALLUC_RES = 62
    const state = { u: { uprops: [] } };
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    // No HALLUC_RES entry means no resistance, so Hallucination is true
    assert.equal(green_mon(mon, state), false);
});

// ---------- cures_sliming() ----------
// C ref: muse.c cures_sliming() (3222-3240). Checks whether a specific
// object can cure a monster of green slime, taking into account the
// monster's physiology.

test('cures_sliming: SCR_FIRE works for a sighted monster with hands', () => {
    // C: return (haseyes(mon->data) && mon->mcansee && !nohands(mon->data));
    // A gnome has eyes and hands (monst.c flags), so SCR_FIRE cures.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME], mcansee: true };
    const obj = { otyp: O.SCR_FIRE };
    assert.equal(cures_sliming(mon, obj), true);
});

test('cures_sliming: SCR_FIRE fails for blind monster', () => {
    // C: mon->mcansee check fails when the monster is blinded
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME], mcansee: false };
    const obj = { otyp: O.SCR_FIRE };
    assert.equal(cures_sliming(mon, obj), false);
});

test('cures_sliming: SCR_FIRE fails for eyeless monster (ochre jelly)', () => {
    // monst.c: ochre jelly has M1_NOEYES, so haseyes() returns false
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_OCHRE_JELLY], mcansee: true };
    const obj = { otyp: O.SCR_FIRE };
    assert.equal(cures_sliming(mon, obj), false);
});

test('cures_sliming: SCR_FIRE fails for handless monster (acid blob)', () => {
    // monst.c: acid blob has M1_NOHANDS, so nohands() returns true
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_ACID_BLOB], mcansee: true };
    const obj = { otyp: O.SCR_FIRE };
    assert.equal(cures_sliming(mon, obj), false);
});

test('cures_sliming: POT_OIL works for monster with hands', () => {
    // C: return !nohands(mon->data); -- no mcansee/haseyes requirement
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME] };
    const obj = { otyp: O.POT_OIL };
    assert.equal(cures_sliming(mon, obj), true);
});

test('cures_sliming: POT_OIL fails for handless monster', () => {
    // monst.c: acid blob has M1_NOHANDS
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_ACID_BLOB] };
    const obj = { otyp: O.POT_OIL };
    assert.equal(cures_sliming(mon, obj), false);
});

test('cures_sliming: WAN_FIRE with positive charges works', () => {
    // C: obj->otyp == WAN_FIRE && obj->spe > 0
    // Hero doesn't need hands to zap, so neither does the monster.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_ACID_BLOB] };
    const obj = { otyp: O.WAN_FIRE, spe: 3 };
    assert.equal(cures_sliming(mon, obj), true);
});

test('cures_sliming: WAN_FIRE with zero charges fails', () => {
    // C: obj->spe > 0 check fails
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME] };
    const obj = { otyp: O.WAN_FIRE, spe: 0 };
    assert.equal(cures_sliming(mon, obj), false);
});

test('cures_sliming: FIRE_HORN with positive charges works if can_blow', () => {
    // C: obj->otyp == FIRE_HORN && can_blow(mon) && obj->spe > 0
    // can_blow() checks that the monster has a head, isn't mindless, etc.
    // A gnome can blow a horn.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME] };
    const obj = { otyp: O.FIRE_HORN, spe: 1 };
    assert.equal(cures_sliming(mon, obj), true);
});

test('cures_sliming: unrelated object (WAN_COLD) is not a cure', () => {
    // C: none of the branches match WAN_COLD
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GNOME] };
    const obj = { otyp: O.WAN_COLD, spe: 5 };
    assert.equal(cures_sliming(mon, obj), false);
});
