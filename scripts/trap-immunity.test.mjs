import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    BEAR_TRAP,
    FLYING,
    LEVITATION,
    MAGIC_PORTAL,
    PIT,
    STATUE_TRAP,
    TRAP_CLEARLY_IMMUNE,
    TRAP_NOT_IMMUNE,
    VIBRATING_SQUARE,
} from '../js/const.js';
import { M1_FLY, MZ_MEDIUM, MZ_SMALL } from '../js/monsters.js';
import { immune_to_trap } from '../js/trap.js';

function immunityState(species = {}) {
    const hero = {
        data: {
            mflags1: 0,
            msize: MZ_MEDIUM,
            mattk: [],
            ...species,
        },
    };
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        youmonst: hero,
        u: { uz: { dnum: 0, dlevel: 1 }, uprops },
        level: { flags: {} },
        astral_level: { dnum: 5, dlevel: 1 },
        sokoban_dnum: 4,
    };
}

test('immune_to_trap preserves source distinctions for physical traps', () => {
    const ordinary = immunityState();
    assert.equal(
        immune_to_trap(ordinary.youmonst, ARROW_TRAP, ordinary),
        TRAP_NOT_IMMUNE,
    );

    const small = immunityState({ msize: MZ_SMALL });
    assert.equal(
        immune_to_trap(small.youmonst, BEAR_TRAP, small),
        TRAP_CLEARLY_IMMUNE,
    );

    const flying = immunityState({ mflags1: M1_FLY });
    assert.equal(
        immune_to_trap(flying.youmonst, PIT, flying),
        TRAP_CLEARLY_IMMUNE,
    );
    flying.level.flags.sokoban_rules = true;
    assert.equal(
        immune_to_trap(flying.youmonst, PIT, flying),
        TRAP_NOT_IMMUNE,
    );
});

test('immune_to_trap keeps harmless terrain hero-visible', () => {
    const state = immunityState();
    assert.equal(
        immune_to_trap(state.youmonst, STATUE_TRAP, state),
        TRAP_NOT_IMMUNE,
    );
    assert.equal(
        immune_to_trap({ data: {} }, STATUE_TRAP, state),
        TRAP_CLEARLY_IMMUNE,
    );
    assert.equal(
        immune_to_trap(state.youmonst, MAGIC_PORTAL, state),
        TRAP_NOT_IMMUNE,
    );
    assert.equal(
        immune_to_trap(state.youmonst, VIBRATING_SQUARE, state),
        TRAP_CLEARLY_IMMUNE,
    );
});
