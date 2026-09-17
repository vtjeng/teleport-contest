// Source-pinned checks for polyself.c polyself() and were_beastie().  The
// recorded raven recipe covers the impure production caller; these checks pin
// the selector's pure conversion table and the order-sensitive source arms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    PM_COYOTE,
    PM_FOX,
    PM_GIANT_RAT,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WEREWOLF,
    PM_JACKAL,
    PM_RABID_RAT,
    PM_SEWER_RAT,
    PM_WARG,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    PM_WINTER_WOLF,
    PM_WINTER_WOLF_CUB,
    PM_WOLF,
    NON_PM,
} from '../js/monsters.js';
import { were_beastie } from '../js/mon.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/polyself.c', 'utf8');
const JS_SOURCE = readFileSync('js/polyself.js', 'utf8');
const C_START = C_SOURCE.indexOf('polyself(int psflags)');
const C_END = C_SOURCE.indexOf('\n}\n\n/* (try to) make a mntmp', C_START) + 2;
const JS_START = JS_SOURCE.indexOf('export async function polyself(');
const JS_END = JS_SOURCE.indexOf('\n}\n\nconst HUMANOID_PARTS', JS_START) + 2;
const C_FUNCTION = C_SOURCE.slice(C_START, C_END);
const JS_FUNCTION = JS_SOURCE.slice(JS_START, JS_END);

test('were_beastie maps every C were.c family member and rejects others', () => {
    const ratForms = [PM_WERERAT, PM_SEWER_RAT, PM_GIANT_RAT, PM_RABID_RAT];
    const jackalForms = [
        PM_WEREJACKAL, PM_JACKAL, PM_FOX, PM_COYOTE,
    ];
    const wolfForms = [
        PM_WEREWOLF, PM_WOLF, PM_WARG, PM_WINTER_WOLF,
        PM_WINTER_WOLF_CUB,
    ];
    for (const pm of ratForms) assert.equal(were_beastie(pm), PM_WERERAT);
    for (const pm of jackalForms) {
        assert.equal(were_beastie(pm), PM_WEREJACKAL);
    }
    for (const pm of wolfForms) assert.equal(were_beastie(pm), PM_WEREWOLF);
    assert.equal(were_beastie(PM_HUMAN_WEREWOLF), NON_PM);
    assert.equal(were_beastie(PM_HUMAN_WEREJACKAL), NON_PM);
});
test('polyself keeps the C early guards, selector, and final gate in order', () => {
    assert.ok(C_START >= 0 && C_END > C_START);
    assert.ok(JS_START >= 0 && JS_END > JS_START);
    assert.ok(C_FUNCTION.length > 7000, 'the selected C function is whole');
    assert.match(C_FUNCTION, /if \(Unchanging\)[\s\S]*rn2\(20\)/u);
    assert.match(C_FUNCTION, /name_to_mon\(buf, &gvariant\)[\s\S]*name_to_monclass/u);
    assert.match(C_FUNCTION, /do \{[\s\S]*rn1\(SPECIAL_PM - LOW_PM, LOW_PM\)/u);
    assert.match(JS_FUNCTION, /if \(Unchanging\(state\)\)[\s\S]*rn2\(20\)/u);
    assert.match(JS_FUNCTION, /name_to_monplus\(buf[\s\S]*name_to_monclass/u);
    assert.match(JS_FUNCTION, /rn1\(M\.SPECIAL_PM - M\.LOW_PM, M\.LOW_PM\)/u);
    assert.match(JS_FUNCTION, /were_beastie\(mntmp\)[\s\S]*counter_were/u);
    assert.match(JS_FUNCTION, /await newman\(state\)[\s\S]*await polymon/u);
    assert.doesNotMatch(JS_FUNCTION, /throw new UnsupportedPolyselfError/u);
});
