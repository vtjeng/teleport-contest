import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HALLUC,
    HALLUC_RES,
    MAGIC_TRAP,
    SPINE,
    Trap_Effect_Finished,
    In_quest,
} from '../js/const.js';
import { at_dgn_entrance, on_level } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { UnsupportedHeroMoveBoundaryError } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { body_part } from '../js/polyself.js';
import {
    preflight_dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';

// Seed 12 with the same datetime as the witness session
// seed0012-monk-vault-escort. The hero is a Monk; the session exercises the
// magic trap at step 27 with rn2(30)=6 and rnd(20)=13.
const SEED = 12;
const DATETIME = '20260503045501';
const RC = 'OPTIONS=symset:DECgraphics\n';

// The first 16 characters of the session's moves complete character creation
// and land the hero on dungeon level 1 with youmonst.data, u.uz, and
// quest_dnum set. Tests that need these values use CREATION_PREFIX; preflight
// tests that only check trap struct fields use empty moves.
const CREATION_PREFIX = 'Dodeco\rn[l"m/hmy';

// Initialise the game state past character creation so that youmonst.data,
// u.uz, quest_dnum, and the hero's position are set.
async function initState() {
    await runSegment({
        seed: SEED, datetime: DATETIME, nethackrc: RC, moves: CREATION_PREFIX,
    });
    return game;
}

// Build a MAGIC_TRAP object placed at the hero's feet.
function makeTrap(state) {
    return {
        ttyp: MAGIC_TRAP,
        tseen: false,
        once: false,
        tx: state.u.ux,
        ty: state.u.uy,
        tnote: 0,
        madeby_u: false,
    };
}

// Build a controlled env for trapeffect_selector(). The hero arm of
// trapeffect_magic_trap() reads random.rn2 and random.rnd, plus message,
// redraw, and unsupported from the env. This env stubs the PRNG so every
// test controls the rn2(30) explosion gate and the rnd(20) fate roll.
function heroEnv(state, rn2_30, rnd_20) {
    const messages = [];
    let rn2Called = false;
    let rndCalled = false;
    return {
        state,
        random: {
            rn2(n) {
                // rn2(30) is the explosion gate in trapeffect_magic_trap().
                if (n === 30) { rn2Called = true; return rn2_30; }
                return 1; // default nonzero; no other rn2 in the ported path
            },
            rnd(n) {
                // rnd(20) is the fate roll in domagictrap().
                if (n === 20) { rndCalled = true; return rnd_20; }
                return 1;
            },
            rn1: (x, y) => y,
            rne: () => 1,
            d: (n, x) => n,
        },
        message: async (text) => messages.push(text),
        redraw: () => {},
        unsupported: (reason) => {
            throw new UnsupportedHeroMoveBoundaryError(reason);
        },
        messages,
        get rn2Called() { return rn2Called; },
        get rndCalled() { return rndCalled; },
    };
}

// ── preflight tests ──

// Preflight tests need only u.usteed (for the steed check), not the full
// game state, so they use a minimal state with u set.
async function preflightState() {
    await runSegment({
        seed: SEED, datetime: DATETIME, nethackrc: RC, moves: CREATION_PREFIX,
    });
    return game;
}

test('preflight_dotrap admits an unseen MAGIC_TRAP', async () => {
    // A fresh MAGIC_TRAP with tseen=false and no steed passes preflight.
    // Breaking: remove MAGIC_TRAP from the type check in preflight_dotrap().
    const state = await preflightState();
    const trap = { ttyp: MAGIC_TRAP, tseen: false };
    assert.doesNotThrow(() => preflight_dotrap(trap, state));
});

test('preflight_dotrap refuses a seen MAGIC_TRAP', async () => {
    // A seen trap requires trapname() for the escape message.
    const state = await preflightState();
    const trap = { ttyp: MAGIC_TRAP, tseen: true };
    assert.throws(
        () => preflight_dotrap(trap, state),
        (error) => error.reason === 'a trap the hero has already seen',
    );
});

test('preflight_dotrap refuses MAGIC_TRAP with a steed', async () => {
    // steedintrap() at trap.c:2313 is not ported.
    const state = await preflightState();
    state.u.usteed = { mx: state.u.ux, my: state.u.uy };
    const trap = { ttyp: MAGIC_TRAP, tseen: false };
    assert.throws(
        () => preflight_dotrap(trap, state),
        (error) => error.reason === 'a steed in a trap',
    );
    state.u.usteed = null;
});

// ── trapeffect_magic_trap hero arm via trapeffect_selector ──
// Each test calls trapeffect_selector() with MAGIC_TRAP and the hero as the
// monster, controlling the PRNG through the env.

test('trapeffect_magic_trap: rn2(30)=0 refuses (explosion needs deltrap)',
    async () => {
        // rn2(30)=0 means the 1/30 explosion branch fires. It calls deltrap()
        // which is not ported, so the port refuses.
        // Breaking: remove the `!random.rn2(30)` guard.
        const state = await initState();
        const trap = makeTrap(state);
        const env = heroEnv(state, 0, /* fate unused */ 13);
        await assert.rejects(
            () => trapeffect_selector(state.youmonst, trap, 0, env),
            (error) => error.reason === 'magic trap explosion',
        );
        assert.ok(env.rn2Called, 'rn2(30) explosion gate was called');
        assert.ok(!env.rndCalled, 'rnd(20) fate roll not reached on explosion');
    });

test('trapeffect_magic_trap: rn2(30) nonzero, fate 10 no-op', async () => {
    // rn2(30)=6 skips the explosion. rnd(20)=10 is the no-op branch.
    // No message is produced. seetrap() sets tseen.
    // Breaking: remove the `case 10: break;` and let it fall through.
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 6, 10);
    const result = await trapeffect_selector(
        state.youmonst, trap, 0, env,
    );
    assert.equal(result, Trap_Effect_Finished);
    assert.ok(env.rn2Called, 'rn2(30) explosion gate was called');
    assert.ok(env.rndCalled, 'rnd(20) fate roll was called');
    assert.equal(env.messages.length, 0, 'fate 10 produces no message');
    assert.equal(trap.tseen, true, 'seetrap sets tseen');
});

test('trapeffect_magic_trap: fate 13 spine shiver', async () => {
    // rn2(30)=6 (no explosion), rnd(20)=13 -> "A shiver runs up and down
    // your spine!" C ref: trap.c:4386.
    // Breaking: change SPINE to FOOT in the body_part() call.
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 6, 13);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(
        env.messages[0],
        `A shiver runs up and down your ${body_part(SPINE, state.youmonst)}!`,
    );
    // body_part(SPINE) returns "spine" for a normal (non-polymorphed) hero.
    assert.equal(
        env.messages[0],
        'A shiver runs up and down your spine!',
    );
});

test('trapeffect_magic_trap: fate 14 howling (no hallucination)', async () => {
    // rn2(30)=1, rnd(20)=14. Without hallucination:
    // "You hear distant howling." C ref: trap.c:4390.
    // Breaking: swap the Hallucination ternary branches.
    const state = await initState();
    // Ensure no hallucination.
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 0 };
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 14);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You hear distant howling.');
});

test('trapeffect_magic_trap: fate 14 howling (hallucination)', async () => {
    // With hallucination: "You hear the moon howling at you."
    // C ref: trap.c:4389.
    // Breaking: swap the Hallucination ternary branches.
    const state = await initState();
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 14);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You hear the moon howling at you.');
});

test('trapeffect_magic_trap: fate 15 distant homeland', async () => {
    // On dungeon level 1 (not the quest start, not in the quest), without
    // hallucination: "You suddenly yearn for your distant homeland."
    // C ref: trap.c:4400-4405.
    // Breaking: swap 'your distant homeland' with 'Cleveland'.
    const state = await initState();
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 0 };
    // Verify the hero is not on the quest start level and not in the quest.
    assert.equal(
        on_level(state.u.uz, state.qstart_level),
        false,
        'hero is not on the quest start level',
    );
    assert.equal(In_quest(state.u.uz), false, 'hero is not in the quest');
    assert.equal(
        at_dgn_entrance('The Quest', state),
        false,
        'hero is not at the quest entrance',
    );
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 15);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(
        env.messages[0],
        'You suddenly yearn for your distant homeland.',
    );
});

test('trapeffect_magic_trap: fate 15 Cleveland (hallucination)', async () => {
    // With hallucination, on any level not the quest start:
    // "You suddenly yearn for Cleveland." C ref: trap.c:4401.
    // Breaking: remove the Hallucination check.
    const state = await initState();
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 15);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You suddenly yearn for Cleveland.');
});

test('trapeffect_magic_trap: fate 16 pack shakes', async () => {
    // "Your pack shakes violently!" C ref: trap.c:4408.
    // Breaking: change 'violently' to 'gently'.
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 16);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'Your pack shakes violently!');
});

test('trapeffect_magic_trap: fate 17 smell (no hallucination)', async () => {
    // "You smell charred flesh." C ref: trap.c:4411.
    // Breaking: swap the Hallucination branches.
    const state = await initState();
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 0 };
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 17);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You smell charred flesh.');
});

test('trapeffect_magic_trap: fate 17 smell (hallucination)', async () => {
    // "You smell hamburgers." C ref: trap.c:4411.
    const state = await initState();
    state.u.uprops ??= {};
    state.u.uprops[HALLUC] = { intrinsic: 1 };
    state.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 17);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You smell hamburgers.');
});

test('trapeffect_magic_trap: fate 18 tired', async () => {
    // "You feel tired." C ref: trap.c:4414.
    // Breaking: change 'tired' to 'sleepy'.
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 18);
    await trapeffect_selector(state.youmonst, trap, 0, env);
    assert.equal(env.messages.length, 1);
    assert.equal(env.messages[0], 'You feel tired.');
});

// ── refused complex branches ──

test('trapeffect_magic_trap: fate < 10 refuses (monster creation)',
    async () => {
        // fate=5 triggers the blindness/deafness/monster-creation branch.
        // Breaking: remove the `unsupported` call for fate < 10.
        const state = await initState();
        const trap = makeTrap(state);
        const env = heroEnv(state, 1, 5);
        await assert.rejects(
            () => trapeffect_selector(state.youmonst, trap, 0, env),
            (error) => error.reason === 'magic trap monster creation',
        );
    });

test('trapeffect_magic_trap: fate 11 refuses (invisibility toggle)',
    async () => {
        const state = await initState();
        const trap = makeTrap(state);
        const env = heroEnv(state, 1, 11);
        await assert.rejects(
            () => trapeffect_selector(state.youmonst, trap, 0, env),
            (error) => error.reason === 'magic trap invisibility toggle',
        );
    });

test('trapeffect_magic_trap: fate 12 refuses (fire)', async () => {
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 12);
    await assert.rejects(
        () => trapeffect_selector(state.youmonst, trap, 0, env),
        (error) => error.reason === 'magic trap fire',
    );
});

test('trapeffect_magic_trap: fate 19 refuses (tame monsters)', async () => {
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 19);
    await assert.rejects(
        () => trapeffect_selector(state.youmonst, trap, 0, env),
        (error) => error.reason === 'magic trap tame monsters',
    );
});

test('trapeffect_magic_trap: fate 20 refuses (uncurse)', async () => {
    const state = await initState();
    const trap = makeTrap(state);
    const env = heroEnv(state, 1, 20);
    await assert.rejects(
        () => trapeffect_selector(state.youmonst, trap, 0, env),
        (error) => error.reason === 'magic trap uncurse',
    );
});

// ── fate 15 prodigal-son branch (on quest start level) ──

test('trapeffect_magic_trap: fate 15 prodigal son (male, quest start)',
    async () => {
        // On the quest start level, a male hero gets "You feel like the
        // prodigal son." C ref: trap.c:4394-4398.
        // Breaking: swap the on_level branches.
        const state = await initState();
        state.u.uprops ??= {};
        state.u.uprops[HALLUC] = { intrinsic: 0 };
        // Pretend the hero is on the quest start level by making u.uz match
        // qstart_level. The quest start level has a specific dnum and dlevel;
        // we set u.uz to match it.
        if (state.qstart_level) {
            state.u.uz = { ...state.qstart_level };
        } else {
            // If qstart_level is not set, skip the test.
            return;
        }
        state.flags.female = false;
        const trap = makeTrap(state);
        const env = heroEnv(state, 1, 15);
        await trapeffect_selector(state.youmonst, trap, 0, env);
        assert.equal(env.messages.length, 1);
        assert.equal(env.messages[0], 'You feel like the prodigal son.');
    });

test('trapeffect_magic_trap: fate 15 prodigal son (female, quest start)',
    async () => {
        // A female hero gets "You feel oddly like the prodigal son."
        // C ref: trap.c:4396-4397.
        const state = await initState();
        state.u.uprops ??= {};
        state.u.uprops[HALLUC] = { intrinsic: 0 };
        if (state.qstart_level) {
            state.u.uz = { ...state.qstart_level };
        } else {
            return;
        }
        state.flags.female = true;
        const trap = makeTrap(state);
        const env = heroEnv(state, 1, 15);
        await trapeffect_selector(state.youmonst, trap, 0, env);
        assert.equal(env.messages.length, 1);
        assert.equal(env.messages[0], 'You feel oddly like the prodigal son.');
    });
