import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { VIBRATING_SQUARE } from '../js/const.js';
import { preflight_dotrap } from '../js/trap_effects.js';

const TRAP_C = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const TRAP_H = readFileSync('nethack-c/upstream/include/trap.h', 'utf8');

test('preflight_dotrap admits the source-backed vibrating-square hero effect', () => {
    assert.match(TRAP_C,
        /case VIBRATING_SQUARE:\s*return trapeffect_vibrating_square\(mtmp, trap, trflags\);/u);
    assert.match(TRAP_H,
        /undestroyable_trap\(ttyp\)[\s\S]*?\(ttyp\) == VIBRATING_SQUARE/u);

    const state = { u: { usteed: null } };
    const trap = { ttyp: VIBRATING_SQUARE, tseen: false };
    assert.doesNotThrow(() => preflight_dotrap(trap, state));

    // C dotrap() still invokes the hero's effect after the steed learns this
    // undestroyable trap; the effect itself has no mounted-only refusal.
    state.u.usteed = {};
    assert.doesNotThrow(() => preflight_dotrap(trap, state));

    // The C seen-trap escape check is skipped for undestroyable_trap types.
    trap.tseen = true;
    state.u.usteed = null;
    assert.doesNotThrow(() => preflight_dotrap(trap, state));
});
