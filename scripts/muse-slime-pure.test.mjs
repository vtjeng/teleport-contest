// Pin the pure functions cures_sliming() and green_mon() from muse.c.
// Every expected value derives from the C source, species entries in
// monsters.h/monst.c/monattk.h, and object definitions in objects.c.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HALLUC, HALLUC_RES } from '../js/const.js';
import * as M from '../js/monsters.js';
import * as O from '../js/objects.js';
import { cures_sliming, green_mon } from '../js/muse.js';

const MUSE_C = readFileSync(
    new URL('../nethack-c/upstream/src/muse.c', import.meta.url), 'utf8',
);
const YOU_PROP_H = readFileSync(
    new URL('../nethack-c/upstream/include/youprop.h', import.meta.url), 'utf8',
);
const PROP_H = readFileSync(
    new URL('../nethack-c/upstream/include/prop.h', import.meta.url), 'utf8',
);
const COLOR_H = readFileSync(
    new URL('../nethack-c/upstream/include/color.h', import.meta.url), 'utf8',
);
const MONSTERS_H = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url), 'utf8',
);

// ---------- green_mon() ----------
// C ref: muse.c green_mon() (3268-3307). Returns TRUE when the monster's
// mcolor is CLR_GREEN (2) or CLR_BRIGHT_GREEN (10), and the hero is not
// hallucinating.

test('green_mon follows the active C color predicate', () => {
    const body = MUSE_C.match(
        /staticfn boolean\s+green_mon\(struct monst \*mon\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    assert.ok(body, 'muse.c contains the complete green_mon definition');
    assert.match(body, /struct permonst \*ptr\s*=\s*mon->data\s*;/u);
    assert.match(body, /if\s*\(Hallucination\)\s*return FALSE\s*;/u);
    assert.match(body,
        /return\s*\(ptr->mcolor\s*==\s*CLR_GREEN\s*\|\|\s*ptr->mcolor\s*==\s*CLR_BRIGHT_GREEN\s*\)\s*;/u);
    assert.ok(body.indexOf('#if 0') > body.indexOf('return'),
        'the name-based approximation follows the active return in a disabled block');

    assert.match(YOU_PROP_H,
        /^#define HHallucination u\.uprops\[HALLUC\]\.intrinsic$/mu);
    assert.match(YOU_PROP_H,
        /^#define EHalluc_resistance u\.uprops\[HALLUC_RES\]\.extrinsic$/mu);
    assert.match(YOU_PROP_H,
        /^#define Halluc_resistance \(HHalluc_resistance \|\| EHalluc_resistance\)$/mu);
    assert.match(YOU_PROP_H,
        /^#define Hallucination \(HHallucination && !Halluc_resistance\)$/mu);
    assert.match(PROP_H, /HALLUC\s*=\s*23,\s*HALLUC_RES\s*=\s*24,/u);
    assert.equal(HALLUC, 23); // prop.h:42 assigns the hallucination property index.
    assert.equal(HALLUC_RES, 24); // prop.h:43 assigns hallucination resistance.
    assert.match(COLOR_H, /^#define CLR_GREEN 2$/mu);
    assert.match(COLOR_H, /^#define CLR_BRIGHT_GREEN 10$/mu);
    assert.match(COLOR_H, /^#define CLR_RED 1$/mu);
    assert.match(COLOR_H, /^#define CLR_YELLOW 11$/mu);
    assert.match(MONSTERS_H, /8, CLR_GREEN, GREEN_SLIME\)/u);
    assert.match(MONSTERS_H, /1, CLR_BRIGHT_GREEN, LICHEN\)/u);
    assert.match(MONSTERS_H, /20, CLR_RED, RED_DRAGON\)/u);
    assert.match(MONSTERS_H, /1, CLR_YELLOW, NEWT\)/u);
});

test('green_mon: green slime has CLR_GREEN (2), returns true', () => {
    // monsters.h:2112 gives green slime CLR_GREEN = 2.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GREEN_SLIME] };
    const state = {};
    assert.equal(green_mon(mon, state), true);
});

test('green_mon: gecko has CLR_GREEN (2), returns true', () => {
    // monsters.h:3274 gives gecko CLR_GREEN = 2.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GECKO] };
    assert.equal(green_mon(mon, {}), true);
});

test('green_mon: leprechaun has CLR_GREEN (2), returns true', () => {
    // monsters.h:666 gives leprechaun CLR_GREEN = 2.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_LEPRECHAUN] };
    assert.equal(green_mon(mon, {}), true);
});

test('green_mon: lichen has CLR_BRIGHT_GREEN (10), returns true', () => {
    // monsters.h entry for lichen: mcolor = CLR_BRIGHT_GREEN = 10
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_LICHEN] };
    assert.equal(green_mon(mon, {}), true);
});

test('green_mon: red dragon has CLR_RED (1), returns false', () => {
    // monsters.h:1494 gives red dragon CLR_RED = 1.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_RED_DRAGON] };
    assert.equal(green_mon(mon, {}), false);
});

test('green_mon: newt has CLR_YELLOW (11), returns false', () => {
    // monsters.h:3267 gives newt CLR_YELLOW = 11.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_NEWT] };
    assert.equal(green_mon(mon, {}), false);
});

test('green_mon: returns false under hallucination regardless of color', () => {
    // C: if (Hallucination) return FALSE; -- hallucinating hero can't tell
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GREEN_SLIME] };
    // Hallucination is active when uprops[HALLUC].intrinsic is set and neither
    // resistance field in uprops[HALLUC_RES] is set.
    const state = { u: { uprops: [] } };
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    // The absent resistance entry makes Hallucination true.
    assert.equal(green_mon(mon, state), false);
});

test('green_mon respects extrinsic hallucination resistance', () => {
    // The hero has intrinsic hallucination, but extrinsic resistance suppresses it.
    const mon = { data: M.MONSTER_TEMPLATES[M.PM_GREEN_SLIME] };
    const state = { u: { uprops: [] } };
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    state.u.uprops[HALLUC_RES] = { extrinsic: 1 };
    assert.equal(green_mon(mon, state), true);
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
