// rnd.c rn2(x) in a released build (patchlevel.h:33) is RND(x), which under
// USE_ISAAC64 returns `isaac64_next_uint64(...) % x` (rnd.c:60-64). For a
// negative int x, C converts x to uint64 before the division, and RND()'s
// int return keeps the low 32 bits of the remainder. The game reaches it: mkroom.c morguemon()
// (480) calls rn2(level_difficulty()), and level_difficulty() is negative on
// a level of dungeon -1
// (recordings/mkroom.c/mkundead-cursed-bell-dungeon-minus-one.session.json,
// where C logs rn2(-2)=-492057538). The port used to answer 0 without drawing,
// which left every later draw one value behind C's.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { isaac64_next_uint64 } from '../js/isaac64.js';
import { cloneIsaacContext, enableRngLog, getRngLog, initRng, rn2 } from '../js/rng.js';

test('rn2() of a negative range draws once and wraps as C does', () => {
    // 41735 is an arbitrary seed: the check compares rn2() with the raw
    // ISAAC64 value the same context yields, whatever that value is.
    initRng(41735);
    enableRngLog();
    for (const range of [-2, -7]) { // morguemon()'s -2, and one other divisor
        const raw = isaac64_next_uint64(cloneIsaacContext(game.coreCtx));
        // uint64 conversion of the int: 2^64 + range.
        const divisor = (1n << 64n) + BigInt(range);
        const expected = Number(BigInt.asIntN(32, raw % divisor));
        assert.equal(rn2(range), expected);
        assert.equal(getRngLog().at(-1), `rn2(${range})=${expected}`);
    }
    // C divides by zero for rn2(0); the port keeps answering 0 without a
    // draw, and no caller in js/ asks for it.
    const logged = getRngLog().length;
    assert.equal(rn2(0), 0);
    assert.equal(getRngLog().length, logged);
});
