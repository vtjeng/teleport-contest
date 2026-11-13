import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CHA,
    A_CON,
    A_STR,
    ARROW_TRAP,
    DART_TRAP,
    FLYING,
    KILLED_BY_AN,
    LEVITATION,
    POISON_RES,
    ROOM,
    Trap_Is_Gone,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { thitu } from '../js/mthrowu.js';
import { DART, WEAPON_CLASS } from '../js/objects.js';
import { rn2, rnd } from '../js/rng.js';
import { maketrap, t_at } from '../js/trap.js';
import { expectTerminated, prepareQuietDeath } from './expect-terminated.mjs';
import {
    dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';
import { loadHeroBearTrapRecipe } from './run-hero-bear-trap.mjs';

// Seed 4 with the same datetime as the witness session seed0004-feeding-pony.
// The hero walks onto an unseen dart trap at step 234-235. The segment
// runs the hero to level 1 with a Knight.
const SEED = 4;
const DATETIME = '20260414173108';
const RC = 'OPTIONS=!legacy,!tutorial,time';

// ── dotrap() escape tests ──

test('dotrap uses "an" for the escape message from an unowned arrow trap',
    async () => {
        const state = await heroState();
        // The empty seed-4 fixture stops before the level property array exists;
        // dotrap() needs it for the source airborne and Fumbling checks.
        state.u.uprops ??= [];
        // trap.c Levitation() and Flying() read these initialized properties.
        state.u.uprops[LEVITATION] ??= {};
        state.u.uprops[FLYING] ??= {};
        const messages = [];
        const draws = [];
        // C trap.c:3039 uses "an" for an unowned arrow trap; a zero on this
        // rn2(5) draw forces the source escape branch before trap effects.
        const trap = {
            tx: state.u.ux,
            ty: state.u.uy,
            ttyp: ARROW_TRAP,
            madeby_u: false,
            tseen: true,
            once: true,
        };
        await dotrap(trap, 0, state, {
            random: { rn2: (bound) => { draws.push(bound); return 0; } },
            message: async (line) => messages.push(line),
            redraw: () => {},
        });
        assert.deepEqual(draws, [5]);
        assert.deepEqual(messages, ['You escape an arrow trap.']);
    });

// ── thitu tests ──

// A minimal game state for thitu. Uses the hero from the seed-4 segment.
// The empty segment does not run find_ac(), so uac is unset; callers that
// need it set state.u.uac explicitly.
async function heroState() {
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

// A hero who has entered the dungeon, for the tests whose real hack.c
// losehp(), end.c done() or pickup.c encumber_msg() needs the whole game.
// The recipe's Healer resists poison, so a Valkyrie takes the part.
async function startedHeroState() {
    const segment = loadHeroBearTrapRecipe().segments[1];
    await runSegment({
        ...segment,
        nethackrc: segment.nethackrc.replace('role:Healer', 'role:Valkyrie'),
        moves: '',
    });
    return game;
}

async function wornOutMissileTrap(ttyp, expectedMessage) {
    // The empty seed-4 test fixture above has hero role data but has not
    // entered the dungeon. Use a real generated level for deltrap/newsym.
    const segment = loadHeroBearTrapRecipe().segments[1];
    await runSegment({ ...segment, moves: '' });
    const state = game;
    state.flags.acoustics = true;
    let x = -1;
    let y = -1;
    for (let row = 0; row < 21 && x < 0; row++) {
        for (let column = 0; column < 80; column++) {
            if (state.level.at(column, row)?.typ === ROOM
                && !state.level.traps.some(
                    (placed) => placed.tx === column && placed.ty === row,
                )) {
                x = column;
                y = row;
                break;
            }
        }
    }
    assert.notEqual(x, -1, 'the generated level has an open room square');
    const trap = maketrap(x, y, ttyp, { state });
    assert.ok(trap, 'the test places a trap on an open room square');
    trap.tseen = true;
    trap.once = true;

    const draws = [];
    const observed = [];
    const result = await trapeffect_selector(
        state.youmonst,
        trap,
        0,
        {
            state,
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    return 0;
                },
            },
            message: async (line) => observed.push({
                line,
                trapStillPresent: t_at(trap.tx, trap.ty, state) === trap,
            }),
            redraw: () => {},
        },
    );

    assert.equal(result, Trap_Is_Gone);
    assert.deepEqual(draws, [15], 'C rolls rn2(15) before the message');
    assert.deepEqual(observed, [{
        line: expectedMessage,
        trapStillPresent: true,
    }], 'You_hear prints before deltrap/newsym');
    assert.equal(t_at(trap.tx, trap.ty, state), null,
        'the source branch removes the worn trap after the message');
}

test('arrow trap wear-out routes its loud click through You_hear', async () => {
    await wornOutMissileTrap(ARROW_TRAP, 'You hear a loud click!');
});

test('dart trap wear-out routes its soft click through You_hear', async () => {
    await wornOutMissileTrap(DART_TRAP, 'You hear a soft click.');
});

// Collects messages and draws. thitu() calls hack.c losehp() and attrib.c
// exercise() itself; rn2(2) = 1 makes exercise(A_STR, FALSE) lower AEXE.
function thituEnv(rolls) {
    const messages = [];
    const queue = [...rolls];
    const rndArgs = [];
    const rn2Args = [];
    return {
        random: {
            rnd: (n) => { rndArgs.push(n); return queue.shift() ?? 1; },
            rn2: (n) => { rn2Args.push(n); return n === 2 ? 1 : 0; },
        },
        rndArgs,
        rn2Args,
        message: async (text) => messages.push(text),
        messages,
    };
}

test('thitu miss: AC + tlev <= dieroll produces "almost hit" message',
    async () => {
        const state = await heroState();
        // AC = 3 (a Knight's starting AC with ring mail). tlev = 7.
        // AC + tlev = 10. dieroll = rnd(20) = 11 (from queue). 10 <= 11
        // means MISS. 10 <= 11 - 2 = 9 is FALSE, so "almost hit".
        state.u.uac = 3;
        const hpBefore = state.u.uhp;
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
        assert.equal(state.u.uhp, hpBefore);
        assert.deepEqual(env.rn2Args, []);
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
        const hpBefore = state.u.uhp;
        const strengthExercise = state.u.aexe?.[A_STR] ?? 0;
        const env = thituEnv([5]); // rnd(20)=5
        const result = await thitu(7, 3, obj, 'little dart', state, env);
        assert.equal(result, 1, 'thitu returns 1 for a hit');
        // "You are hit by a little dart." (dam=3, exclam(3)=".")
        assert.equal(env.messages[0], 'You are hit by a little dart.');
        // losehp() takes the damage.
        assert.equal(state.u.uhp, hpBefore - 3);
        // exercise(A_STR, FALSE) draws rn2(2) and lowers AEXE(A_STR).
        assert.deepEqual(env.rn2Args, [2]);
        assert.equal(state.u.aexe[A_STR], strengthExercise - 1);
    });

test('thitu live lethal hit stops after losehp gameover',
    async () => {
        const state = await startedHeroState();
        state.u.uac = 3;
        state.u.uhp = 2;
        state.u.uhpmax = 2;
        const obj = { otyp: DART, oclass: WEAPON_CLASS, opoisoned: false };
        const env = thituEnv([1]);
        prepareQuietDeath(state);

        // C losehp() does not return from thitu() after really_done().
        await expectTerminated(() => thitu(7, 3, obj, 'little dart', state, env));
        // mthrowu.c calls losehp() even when dam is lethal, but its NORETURN
        // death path prevents the following exercise() call.
        assert.equal(Boolean(state.program_state.gameover), true);
        assert.equal(state.killer.name, 'little dart');
        assert.equal(state.killer.format, KILLED_BY_AN);
        assert.deepEqual(env.rn2Args, []);
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
        const state = await startedHeroState();
        // Ensure no poison resistance. uprops may not exist after the short
        // segment; the optional chaining in poisoned() handles that.
        if (state.u.uprops?.[POISON_RES])
            state.u.uprops[POISON_RES].intrinsic = 0;
        const messages = [];
        const hpBefore = state.u.uhp;
        // fatal=10, thrown_weapon=true: i = rn2(10 + 20) = rn2(30).
        // With rn2(30)=15 (>5), the HP damage branch runs. rnd(6)=3.
        const rn2Args = [];
        const env = {
            random: { rn2: (n) => { rn2Args.push(n); return 15; }, d: () => 1, rnd: () => 3 },
            message: async (text) => messages.push(text),
        };
        await poisoned('dart', A_CON, 'little dart', 10, true, state, env);
        // The reason "dart" does not contain "poison", so "The dart was
        // poisoned!" is printed first.
        assert.ok(messages.some((m) => m === 'The dart was poisoned!'));
        // thrown_weapon=true, fatal=10: i = rn2(fatal + 20) = rn2(30).
        assert.deepStrictEqual(rn2Args, [30], 'rn2 called with fatal+20=30');
        // HP damage is rnd(6) = 3.
        assert.equal(state.u.uhp, hpBefore - 3);
    });

test('poisoned() stops its tail after its HP damage finalizes death',
    async () => {
        const state = await startedHeroState();
        prepareQuietDeath(state);
        // Three hit points die to the HP-damage arm's rnd(6) = 3.
        state.u.uhp = 3;
        const messages = [];
        const env = {
            // fatal=10 and thrown_weapon=true make rn2(30)=15 select the
            // ordinary HP-damage arm; rnd(6)=3 supplies that arm's loss.
            random: { rn2: () => 15, d: () => 1, rnd: () => 3 },
            message: async (text) => messages.push(text),
        };

        // hack.c losehp() enters done() and never returns to poisoned(), so
        // its own done(POISONING) and encumber_msg() tail do not run.
        await expectTerminated(
            () => poisoned('dart', A_CON, 'little dart', 10, true, state, env));
        assert.equal(state.killer.name, 'little dart');
        assert.deepEqual(messages, ['The dart was poisoned!']);
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

test('poisontell A_STR uses You_feel()\'s dream prefix while Unaware', async () => {
    // attrib.c poiseff[A_STR] delivers through You_feel(), which pline.c
    // words as a dream while youprop.h Unaware holds: multi < 0 and asleep.
    const state = await heroState();
    state.multi = -5; // Any negative count; trap.c unconscious() needs it.
    state.u.usleep = 1; // The turn sleep began; any nonzero turn means asleep.
    const messages = [];
    const env = { message: async (text) => messages.push(text) };
    await poisontell(A_STR, true, state, env);
    // A_CHA's You() entry has no dream form in C.
    await poisontell(A_CHA, false, state, env);
    assert.deepEqual(messages, [
        'You dream that you feel weaker!',
        'You break out in hives.',
    ]);
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

test('seed0002 dart trap hit forwards encumber_msg through thitu exercise',
    async () => {
        // The open holdout reaches trap.c trapeffect_dart_trap() at input
        // step 47. Its nonlethal hit enters mthrowu.c thitu(), whose
        // exercise(A_STR, FALSE) at mthrowu.c:151 calls attrib.c
        // encumber_msg() after the rn2(2) draw at attrib.c:509.
        const fs = await import('node:fs');
        const segment = JSON.parse(fs.readFileSync(
            'sessions/holdout/seed0002-healer-reflection-drummer.session.json',
            'utf8',
        )).segments[0];
        const movesThroughHit = segment.moves.slice(0, 47);
        const replay = await runSegment({
            ...segment,
            moves: movesThroughHit,
        });
        const cStepsThroughHit = segment.steps.slice(0, 48);
        const sourceRng = cStepsThroughHit.flatMap(
            (step) => step.rng ?? [],
        ).map((entry) => entry.replace(/\s+@.*$/u, ''));
        const actualRng = replay.getRngLog();

        // 47 input keys produce the initial frame plus one frame at each
        // input boundary; the expected count comes from the C recording.
        assert.equal(
            replay.getScreens().length,
            cStepsThroughHit.length,
            'C and JS capture the same boundaries through the hit',
        );
        assert.deepEqual(
            actualRng,
            sourceRng,
            'C and JS consume the same draws, including exercise(A_STR)',
        );
        assert.ok(
            cStepsThroughHit[47].rng.some(
                (entry) => entry.includes('@ exercise(attrib.c:509)'),
            ),
            'the selected C boundary contains attrib.c exercise()',
        );
    });
