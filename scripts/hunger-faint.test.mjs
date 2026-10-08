import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { A_STR, DEAF, FAINTED, FAINTING, WEAK, TIMEOUT, LAST_PROP, NOT_HUNGRY } from '../js/const.js';
import { newuhs } from '../js/eat.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8');
function hero(nutrition, status = WEAK) {
    return {
        u: { uhunger: nutrition, uhs: status, uhp: 10,
            atemp: [0, 0, 0, 0, 0, 0], uprops: Array.from({ length: LAST_PROP + 1 }, () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 })) },
        context: {}, go: {}, multi: 0, unported: new Set(),
    };
}
function operations(draws, messages, result = 0) {
    return { random: { rn2: (bound) => { draws.push(bound); return result; } },
        message: async (text) => messages.push(text),
        statusRefresh: async () => {}, endRunning: () => {} };
}

test('newuhs first faint short circuits RNG and rounds negative nutrition as C', async () => {
    assert.match(source, /sgn\(u\.uhunger\) \* \(\(abs\(u\.uhunger\) \+ 5\) \/ 10\)/u);
    // Half a ten-unit band rounds away from zero: -4 gives 10 turns,
    // -5 gives 11, -14 stays at 11, and -15 gives 12.
    for (const [nutrition, duration] of [[0, 10], [-4, 10], [-5, 11], [-14, 11], [-15, 12]]) {
        const state = hero(nutrition);
        const draws = [], messages = [];
        await newuhs(true, state, operations(draws, messages));
        assert.deepEqual(draws, [], 'prior WEAK short circuits rn2');
        assert.deepEqual(messages, ['You faint from lack of food.']);
        assert.equal(state.multi, -duration);
        assert.equal(state.u.uprops[DEAF].intrinsic & TIMEOUT, duration);
        assert.equal(state.u.uhs, FAINTED);
        assert.equal(state.u.atemp[A_STR], 0, 'already weak retains strength loss');
        assert.equal(state.afternmv.name, 'unfaint');
        assert.equal(state.nomovemsg, 'You regain consciousness.');
    }
});

test('already fainted retains FAINTED and consumes only the source gate', async () => {
    const state = hero(-5, FAINTED); // Rounded quotient -1 makes the gate d21.
    state.multi = -3; // Still immobilized; no new faint can start.
    const draws = [], messages = [];
    await newuhs(true, state, operations(draws, messages, 19));
    assert.deepEqual(draws, [21]);
    assert.deepEqual(messages, []);
    assert.equal(state.u.uhs, FAINTED);
    assert.equal(state.multi, -3);
});

test('unfaint clears deafness on its coin flip, preserves nutrition, and resets status', async () => {
    const state = hero(0);
    const draws = [], messages = [];
    const env = operations(draws, messages);
    await newuhs(true, state, env);
    state.multi = 0; // hack.c unmul reaches the callback after counting the wait.
    assert.equal(await state.afternmv(state, env), 0);
    assert.deepEqual(draws, [2]);
    assert.equal(state.u.uprops[DEAF].intrinsic & TIMEOUT, 0);
    assert.equal(state.u.uhs, FAINTING);
    assert.equal(state.u.uhunger, 0);
    assert.equal(state.disp.botl, true);
});

test('unfaint losing coin flip keeps timed deafness and never worsens recovered hunger', async () => {
    const state = hero(0);
    const draws = [], messages = [];
    const env = operations(draws, messages, 1); // Hear_again clears only on zero.
    await newuhs(true, state, env);
    state.u.uhs = WEAK; // Nutrition recovery already changed the source status.
    state.multi = 0;
    await state.afternmv(state, env);
    assert.deepEqual(draws, [2]);
    assert.equal(state.u.uprops[DEAF].intrinsic & TIMEOUT, 10);
    assert.equal(state.u.uhs, WEAK);
});

test('starvation gate preserves rounded RNG bound, constitution threshold and fatal source order', async () => {
    const { runSegment } = await import('../js/jsmain.js');
    const gstate = await import('../js/gstate.js');
    const { planningState } = await import('../js/unported_monster_actions.js');
    const { acurr } = await import('../js/attrib.js');
    const { A_CON, KILLED_BY, STARVED, STARVING } = await import('../js/const.js');
    const { HeroDeathPlanningError } = await import('../js/hack.js');
    // Independent startup makes the canonical ACURR property/attribute state.
    await runSegment({ seed: 15840107, datetime: '20520418094500',
        nethackrc: 'OPTIONS=name:FaintThreshold,role:Healer,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics', moves: ' ' });
    const { game } = gstate;
    const limit = -(100 + 10 * acurr(game, A_CON));
    for (const nutrition of [limit, limit - 1]) {
        const state = planningState(game);
        state.u.uhunger = nutrition;
        state.u.uhs = FAINTING;
        const calls = [];
        const env = { planning: true,
            random: { rn2: (bound) => { calls.push(['rn2', bound]); return 0; } },
            statusRefresh: async () => calls.push(['bot', state.u.uhs]),
            message: async (text) => calls.push(['message', text]),
        };
        if (nutrition === limit) {
            await newuhs(true, state, env);
            assert.equal(state.u.uhs, FAINTING, 'strict less-than excludes the threshold');
        } else {
            await assert.rejects(newuhs(true, state, env), (error) =>
                error instanceof HeroDeathPlanningError && error.how === STARVING);
            assert.deepEqual(calls.slice(1), [['bot', STARVED], ['message', 'You die from starvation.']]);
            assert.deepEqual(state.killer, { ...state.killer, format: KILLED_BY, name: 'starvation' });
        }
        assert.deepEqual(calls[0], ['rn2', 20 - Math.sign(nutrition) * Math.trunc((Math.abs(nutrition) + 5) / 10)]);
        assert.equal(game.u.uhs, NOT_HUNGRY, 'planning never changes live startup status');
    }
});

test('exhaustion uses the active HP pool and stops non-food occupations after hunger feedback', async () => {
    const { HeroDeathPlanningError } = await import('../js/hack.js');
    const { HUNGRY, NOT_HUNGRY } = await import('../js/const.js');
    const state = hero(100, NOT_HUNGRY); // HUNGRY begins below 150 nutrition.
    state.u.umonnum = 1; state.u.umonster = 0; // Polymorph uses mh, not human HP.
    state.u.mh = 0; state.u.uhp = 10;
    state.go.occupation = async () => 0;
    state.go.occtxt = 'searching';
    const messages = [];
    await assert.rejects(newuhs(true, state, { ...operations([], messages), planning: true }), HeroDeathPlanningError);
    assert.deepEqual(messages, ['You feel hungry.', 'You stop searching.', 'You die from hunger and exhaustion.']);
    assert.equal(state.go.occupation, null);
    assert.equal(state.u.uhs, HUNGRY);
    const living = hero(100, NOT_HUNGRY);
    living.u.umonnum = 1; living.u.umonster = 0;
    living.u.mh = 1; living.u.uhp = 0; // One monster HP remains alive in C.
    await newuhs(false, living, operations([], []));
    assert.equal(living.u.uhs, HUNGRY);
});

test('successful faint gate postpones starvation even below the fatal nutrition threshold', async () => {
    // -401 is below -(100 + 10*25), even at C's maximum Constitution.
    // Rounded quotient -40 gives d60; a result of 19 takes the faint arm.
    for (const status of [FAINTED, FAINTING]) {
        const state = hero(-401, status);
        state.multi = -2; // An existing immobility prevents a fresh faint.
        const draws = [], messages = [];
        await newuhs(true, state, operations(draws, messages, 19));
        assert.deepEqual(draws, [60]);
        assert.deepEqual(messages, []);
        assert.equal(state.u.uhs, status);
        assert.equal(state.multi, -2);
    }
});

test('morehungry fills planning hunger operations without changing supplied RNG or callbacks', async () => {
    const { morehungry } = await import('../js/eat.js');
    const { HUNGRY } = await import('../js/const.js');
    const state = hero(151, NOT_HUNGRY); // One point crosses the source <=150 boundary.
    state.context.run = 1;
    const random = { rn2: () => assert.fail('HUNGRY uses no gate draw') };
    await morehungry(1, state, { planning: true, random });
    assert.equal(state.u.uhs, HUNGRY);
    assert.equal(state.context.run, 0);
    const second = hero(151, NOT_HUNGRY), events = [];
    const env = { planning: true, random,
        message: async text => events.push(['message', text]),
        endRunning: s => events.push(['run', s === second]),
        statusRefresh: s => events.push(['bot', s === second]),
    };
    await morehungry(1, second, env);
    assert.deepEqual(events, [['message', 'You are beginning to feel hungry.'], ['run', true], ['bot', true]]);
    assert.equal(env.random, random);
});
