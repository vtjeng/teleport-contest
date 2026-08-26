import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CON,
    A_STR,
    DART_TRAP,
    KILLED_BY_AN,
    POISON_RES,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { thitu } from '../js/mthrowu.js';
import { DART, WEAPON_CLASS } from '../js/objects.js';
import { rn2, rnd } from '../js/rng.js';
import { t_at } from '../js/trap.js';
import {
    preflight_dotrap,
} from '../js/trap_effects.js';

// Seed 4 with the same datetime as the witness session seed0004-feeding-pony.
// The hero walks onto an unseen dart trap at step 234-235. The segment
// runs the hero to level 1 with a Knight.
const SEED = 4;
const DATETIME = '20260414173108';
const RC = 'OPTIONS=!legacy,!tutorial,time';

// ── preflight tests ──

test('preflight_dotrap admits an unseen DART_TRAP', async () => {
    // A fresh DART_TRAP: once=false, tseen=false, no steed.
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '' });
    const trap = { ttyp: DART_TRAP, once: false, tseen: false };
    assert.doesNotThrow(() => preflight_dotrap(trap, game));
});

test('preflight_dotrap refuses a seen DART_TRAP', async () => {
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '' });
    // A seen trap triggers dotrap()'s escape branch, which needs trapname().
    const trap = { ttyp: DART_TRAP, once: false, tseen: true };
    assert.throws(
        () => preflight_dotrap(trap, game),
        (error) => error.reason === 'a trap the hero has already seen',
    );
});

test('preflight_dotrap refuses a DART_TRAP when the hero rides a steed',
    async () => {
        await runSegment(
            { seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '' },
        );
        game.u.usteed = { mx: game.u.ux, my: game.u.uy };
        const trap = { ttyp: DART_TRAP, once: false, tseen: false };
        assert.throws(
            () => preflight_dotrap(trap, game),
            (error) => error.reason === 'a steed in a trap',
        );
        game.u.usteed = null;
    });

// ── thitu tests ──

// A minimal game state for thitu. Uses the hero from the seed-4 segment.
// The empty segment does not run find_ac(), so uac is unset; callers that
// need it set state.u.uac explicitly.
async function heroState() {
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

// Collects messages and exercises.
function thituEnv(rolls) {
    const messages = [];
    const exercises = [];
    const hpLosses = [];
    const queue = [...rolls];
    const rndArgs = [];
    return {
        random: {
            rnd: (n) => { rndArgs.push(n); return queue.shift() ?? 1; },
        },
        rndArgs,
        message: async (text) => messages.push(text),
        losehp: async (n, knam, k_format) => {
            hpLosses.push({ n, knam, k_format });
            // Actually reduce HP so the caller can observe it.
            game.u.uhp -= n;
        },
        exercise: async (index, increase) => exercises.push({ index, increase }),
        messages,
        exercises,
        hpLosses,
    };
}

test('thitu miss: AC + tlev <= dieroll produces "almost hit" message',
    async () => {
        const state = await heroState();
        // AC = 3 (a Knight's starting AC with ring mail). tlev = 7.
        // AC + tlev = 10. dieroll = rnd(20) = 11 (from queue). 10 <= 11
        // means MISS. 10 <= 11 - 2 = 9 is FALSE, so "almost hit".
        state.u.uac = 3;
        const obj = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env = thituEnv([11]); // rnd(20)=11
        const result = await thitu(7, 3, obj, 'little dart', state, env);
        assert.equal(result, 0, 'thitu returns 0 for a miss');
        assert.deepStrictEqual(env.rndArgs, [20], 'thitu calls rnd(20)');
        assert.equal(env.messages.length, 1);
        assert.equal(
            env.messages[0],
            'You are almost hit by a little dart.',
        );
        // No losehp or exercise on a miss.
        assert.equal(env.hpLosses.length, 0);
        assert.equal(env.exercises.length, 0);
    });

test('thitu miss: AC + tlev <= dieroll - 2 produces "[Name] misses you"',
    async () => {
        const state = await heroState();
        state.u.uac = 3; // Knight starting AC (ring mail).
        // AC + tlev = 10. dieroll = 20. 10 <= 20 is TRUE (miss).
        // 10 <= 20 - 2 = 18 is TRUE, so "A little dart misses you."
        const obj = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env = thituEnv([20]); // rnd(20)=20
        const result = await thitu(7, 3, obj, 'little dart', state, env);
        assert.equal(result, 0);
        assert.equal(env.messages.length, 1);
        assert.equal(env.messages[0], 'A little dart misses you.');
    });

test('thitu hit: AC + tlev > dieroll produces hit message and deals damage',
    async () => {
        const state = await heroState();
        state.u.uac = 3; // Knight starting AC (ring mail).
        // AC + tlev = 10. dieroll = 5. 10 <= 5 is FALSE (hit!).
        const obj = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env = thituEnv([5]); // rnd(20)=5
        const result = await thitu(7, 3, obj, 'little dart', state, env);
        assert.equal(result, 1, 'thitu returns 1 for a hit');
        // "You are hit by a little dart." (dam=3, exclam(3)=".")
        assert.equal(env.messages[0], 'You are hit by a little dart.');
        // losehp is called with damage and killer.
        assert.equal(env.hpLosses.length, 1);
        assert.equal(env.hpLosses[0].n, 3);
        assert.equal(env.hpLosses[0].knam, 'little dart');
        assert.equal(env.hpLosses[0].k_format, KILLED_BY_AN);
        // exercise(A_STR, FALSE) is called on hit.
        assert.equal(env.exercises.length, 1);
        assert.equal(env.exercises[0].index, A_STR);
        assert.equal(env.exercises[0].increase, false);
    });

test('thitu hit with high damage uses "!" and low damage uses "."',
    async () => {
        const state = await heroState();
        state.u.uac = 3; // Knight starting AC (ring mail).
        // AC + tlev = 10. dieroll = 1. 10 <= 1 is FALSE (hit!).
        // dam = 20: exclam(20) produces "!" (C: force > 4 => "!").
        const obj = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env = thituEnv([1]); // rnd(20)=1
        const result = await thitu(7, 20, obj, 'little dart', state, env);
        assert.equal(result, 1);
        assert.ok(
            env.messages[0].endsWith('!'),
            'high damage (>4) ends with "!"',
        );

        // dam = 2: exclam(2) produces "." (C: force <= 4 => ".").
        const state2 = await heroState();
        state2.u.uac = 3;
        const obj2 = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env2 = thituEnv([1]); // rnd(20)=1
        const result2 = await thitu(7, 2, obj2, 'little dart', state2, env2);
        assert.equal(result2, 1);
        assert.ok(
            env2.messages[0].endsWith('.'),
            'low damage (<=4) ends with "."',
        );
    });

// ── poisoned() tests ──

import { poisoned, poisontell, adjuhploss } from '../js/attrib.js';

test('poisoned() with poison resistance prints immunity message and returns',
    async () => {
        const state = await heroState();
        // Grant Poison_resistance. uprops is not initialized by the short
        // segment, so create it.
        state.u.uprops ??= {};
        state.u.uprops[POISON_RES] ??= {};
        state.u.uprops[POISON_RES].intrinsic = 1;
        const messages = [];
        const env = {
            random: { rn2, d: () => 1, rnd },
            message: async (text) => messages.push(text),
            losehp: async () => { throw new Error('should not call losehp'); },
            done: async () => { throw new Error('should not call done'); },
            encumberMessage: async () => {},
        };
        const hpBefore = state.u.uhp;
        await poisoned('dart', A_CON, 'little dart', 10, true, state, env);
        // No damage dealt.
        assert.equal(state.u.uhp, hpBefore);
        assert.ok(messages.some(
            (m) => m === 'The poison doesn\'t seem to affect you.',
        ));
        // Clean up. Restore to pre-test state.
        delete state.u.uprops[POISON_RES];
    });

test('poisoned() with thrown_weapon=true and i>5 deals rnd(6) HP damage',
    async () => {
        const state = await heroState();
        // Ensure no poison resistance. uprops may not exist after the short
        // segment; the optional chaining in poisoned() handles that.
        if (state.u.uprops?.[POISON_RES])
            state.u.uprops[POISON_RES].intrinsic = 0;
        const messages = [];
        const hpLosses = [];
        // fatal=10, thrown_weapon=true: i = rn2(10 + 20) = rn2(30).
        // With rn2(30)=15 (>5), the HP damage branch runs. rnd(6)=3.
        const rn2Args = [];
        const env = {
            random: { rn2: (n) => { rn2Args.push(n); return 15; }, d: () => 1, rnd: () => 3 },
            message: async (text) => messages.push(text),
            losehp: async (n, knam, k_format) => hpLosses.push({ n }),
            done: async () => {},
            encumberMessage: async () => {},
        };
        await poisoned('dart', A_CON, 'little dart', 10, true, state, env);
        // The reason "dart" does not contain "poison", so "The dart was
        // poisoned!" is printed first.
        assert.ok(messages.some((m) => m === 'The dart was poisoned!'));
        // thrown_weapon=true, fatal=10: i = rn2(fatal + 20) = rn2(30).
        assert.deepStrictEqual(rn2Args, [30], 'rn2 called with fatal+20=30');
        // HP damage is rnd(6) = 3.
        assert.equal(hpLosses.length, 1);
        assert.equal(hpLosses[0].n, 3);
    });

// ── poisontell tests ──

test('poisontell A_CON produces "You feel very sick!"', async () => {
    const state = await heroState();
    const messages = [];
    const env = { message: async (text) => messages.push(text) };
    await poisontell(A_CON, true, state, env);
    assert.equal(messages[0], 'You feel very sick!');
});

test('poisontell A_STR produces "You feel weaker!"', async () => {
    const state = await heroState();
    const messages = [];
    const env = { message: async (text) => messages.push(text) };
    await poisontell(A_STR, true, state, env);
    assert.equal(messages[0], 'You feel weaker!');
});

// ── adjuhploss tests ──

test('adjuhploss reduces loss when setuhpmax lowered uhp', async () => {
    // If olduhp was 20 and uhp is now 15 (because uhpmax was lowered),
    // pending loss of 10 is reduced by 5 => 5.
    const state = await heroState();
    state.u.uhp = 15;
    const result = adjuhploss(10, 20, state);
    assert.equal(result, 5);
});

test('adjuhploss never returns less than 1', async () => {
    const state = await heroState();
    state.u.uhp = 5;
    // olduhp was 20, uhp dropped to 5: difference=15, loss=10.
    // 10 - 15 = -5, clamped to 1.
    const result = adjuhploss(10, 20, state);
    assert.equal(result, 1);
});

// ── end-to-end: witness case ──

test('seed0004 dart trap step 235 matches C reference counts and game state',
    async () => {
        // Replays seed0004-feeding-pony through step 235 (the hero walks
        // northwest onto an unseen dart trap). diff-fresh.mjs has confirmed
        // PRNG and screen match through all 236 screens; this test pins the
        // counts and the resulting game state to prevent regressions.
        const fs = await import('node:fs');
        const session = JSON.parse(fs.readFileSync(
            'sessions/seed0004-feeding-pony.session.json', 'utf8',
        ));
        const seg = session.segments[0];
        // Run through step 235 (moves 0..234 = 235 characters).
        const replay = await runSegment({
            seed: seg.seed,
            datetime: seg.datetime,
            nethackrc: seg.nethackrc,
            moves: seg.moves.slice(0, 235),
        });
        // 236 screens: one initial + 235 input steps. C reference has 236.
        assert.equal(replay.getScreens().length, 236,
            'screen count matches the C reference');
        // C reference has 9671 cumulative PRNG calls through step 235
        // (steps 0-235 of the session recording).
        assert.equal(replay.getRngLog().length, 9671,
            'PRNG call count matches the C reference');
        // After the dart misses, the trap is now seen: tseen=true, once=true.
        const trap = t_at(game.u.ux, game.u.uy, game);
        assert.ok(trap, 'a trap exists under the hero');
        assert.equal(trap.ttyp, DART_TRAP);
        assert.equal(trap.tseen, true, 'trap is now seen after firing');
        assert.equal(trap.once, true, 'trap has been triggered');
    });
