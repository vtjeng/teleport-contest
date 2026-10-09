import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { A_INT, A_STR, CONFUSION, ECMD_OK, ECMD_TIME, FROMOUTSIDE, STUNNED, TIMEOUT } from '../js/const.js';
import { SPE_FORCE_BOLT } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { spell_backfire, spelleffects, spelleffects_check } from '../js/spell.js';

const C = readFileSync(new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8');
async function started() {
    // Independent Wizard with no inventory: isolate casting from capacity/equipment.
    await runSegment({ seed: 19035011, datetime: '20611116132333',
        nethackrc: 'OPTIONS=name:CastCheck,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen,!acoustics\n', moves: '.' });
    game.invent = null;
    game.uwep = game.uarms = game.uarm = game.uarmc = game.uarmh = game.uarmg = game.uarmf = null;
    game.u.acurr.a[A_STR] = 10; // Above C's <4 rejection threshold.
    game.u.acurr.a[A_INT] = 18; // Wizard hunger exemption.
    game.u.uhunger = 900;
    game.u.uen = 7; game.u.uenmax = game.u.uenpeak = 20;
    game.u.uhave.amulet = true;
    game.svs.spl_book[0] = { sp_id: SPE_FORCE_BOLT, sp_lev: 1, sp_know: 20000 };
    game.u.uprops[CONFUSION].intrinsic = 0;
    game.u.uprops[STUNNED].intrinsic = 0;
    game.disp.botl = false;
    return game;
}
function operations(values = []) {
    const calls = [];
    const draw = (kind, bound) => {
        calls.push([kind, bound]);
        assert.ok(values.length, `unexpected ${kind}(${bound})`);
        return values.shift();
    };
    return { calls, env: { message: async text => calls.push(['message', text]),
        random: { rn1: () => assert.fail('unexpected rn1'),
            rn2: bound => draw('rn2', bound), rnd: bound => draw('rnd', bound) } } };
}

test('C pins drain before insufficiency and backfire before forgotten energy loss', () => {
    const check = C.slice(C.indexOf('spelleffects_check(int spell'), C.indexOf('int\nspelleffects('));
    assert.match(check, /u\.uen -= rnd\(2 \* \*energy\);[\s\S]*\*res = ECMD_TIME;[\s\S]*if \(\*energy > u\.uen\)/u);
    assert.match(check, /spell_backfire\(spell\);\s+u\.uen -= rnd\(\*energy\)/u);
});

test('Amulet drain-induced insufficiency consumes time without casting hunger', async () => {
    const state = await started();
    const { env, calls } = operations([4]); // C level-one base=5, drain rnd(10)=4.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_TIME, energy: 5 });
    assert.equal(state.u.uen, 3);
    assert.equal(state.u.uhunger, 900);
    assert.equal(state.disp.botl, true);
    assert.deepEqual(calls, [
        ['message', 'You feel the amulet draining your energy away.'], ['rnd', 10],
        ['message', "You don't have enough energy to cast that spell."],
    ]);
});

test('already insufficient energy skips Amulet drain and takes no time', async () => {
    const state = await started(); state.u.uen = 4; // Less than base cost five.
    const { env, calls } = operations();
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_OK, energy: 5 });
    assert.equal(state.u.uen, 4);
    assert.deepEqual(calls, [['message', "You don't have enough energy to cast that spell."]]);
});

test('surviving Amulet drain retains base cost and success roll order', async () => {
    const state = await started(); state.u.uen = 20;
    const { env, calls } = operations([2, 1]); // Minimal drain and passing percentile.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: false, res: ECMD_TIME, energy: 5 });
    assert.equal(state.u.uen, 18); // Caller subsequently spends the unchanged base cost.
    assert.deepEqual(calls, [['message', 'You feel the amulet draining your energy away.'], ['rnd', 10], ['rnd', 100]]);
});

for (const [roll, confusion, stun] of [[0, 6, 0], [4, 4, 2], [7, 2, 4], [9, 0, 6]]) {
    test(`backfire roll ${roll} adds exact level-one duration to packed timeouts`, async () => {
        const state = await started();
        state.u.uprops[CONFUSION].intrinsic = FROMOUTSIDE | 11;
        state.u.uprops[STUNNED].intrinsic = FROMOUTSIDE | 13;
        const { env, calls } = operations([roll]);
        await spell_backfire(0, state, env);
        assert.equal(state.u.uprops[CONFUSION].intrinsic, FROMOUTSIDE | (11 + confusion));
        assert.equal(state.u.uprops[STUNNED].intrinsic, FROMOUTSIDE | (13 + stun));
        assert.deepEqual(calls, [['rn2', 10]]); // FALSE suppresses all setter feedback.
    });
}

test('forgotten spell backfires then drains base energy with zero clamp', async () => {
    const state = await started();
    state.svs.spl_book[0].sp_know = 0; state.u.uen = 1;
    const { env, calls } = operations([4, 5]); // Confusion/stun branch, maximum base loss.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_TIME, energy: 5 });
    assert.equal(state.u.uen, 0);
    assert.equal(state.u.uprops[CONFUSION].intrinsic & TIMEOUT, 4);
    assert.equal(state.u.uprops[STUNNED].intrinsic & TIMEOUT, 2);
    assert.deepEqual(calls, [
        ['message', 'Your knowledge of this spell is twisted.'],
        ['message', 'It invokes nightmarish images in your mind...'], ['rn2', 10], ['rnd', 5],
    ]);
});

for (const [knowledge, text] of [
    [100, 'You strain to recall the spell.'],
    [500, 'You have difficulty remembering the spell.'],
    [1000, 'Your knowledge of this spell is growing faint.'],
    [2000, 'Your recall of this spell is gradually fading.'],
]) {
    test(`knowledge threshold ${knowledge} precedes hunger rejection`, async () => {
        const state = await started();
        state.svs.spl_book[0].sp_know = knowledge; // KEEN divided by 200/40/20/10.
        state.u.uhunger = 10; // Inclusive source hunger guard.
        const { env, calls } = operations();
        assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_OK, energy: 5 });
        assert.deepEqual(calls, [['message', text], ['message', 'You are too hungry to cast that spell.']]);
    });
}

test('unknown, stunned and weak guards preserve output and random order', async () => {
    const state = await started();
    const { env, calls } = operations();
    assert.deepEqual(await spelleffects_check(-1, state, env), { abort: true, res: ECMD_OK, energy: 0 }); // UNKNOWN_SPELL.
    assert.deepEqual(calls, []);
    state.u.uprops[STUNNED].intrinsic = 1; // Reject before knowledge/base cost.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_OK, energy: 0 });
    assert.deepEqual(calls.splice(0), [['message', 'You are too impaired to cast a spell.']]);
    state.u.uprops[STUNNED].intrinsic = 0;
    state.u.acurr.a[A_STR] = 3; // Strict <4 guard.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_OK, energy: 5 });
    assert.deepEqual(calls, [['message', 'You lack the strength to cast spells.']]);
});

for (const [intelligence, hungerCost] of [[18, 0], [16, 2], [15, 5], [14, 10]]) {
    test(`Wizard intelligence ${intelligence} reduces base hunger before confused failure`, async () => {
        const state = await started();
        state.u.uhave.amulet = false;
        state.u.acurr.a[A_INT] = intelligence; // C's exemption, quarter, half, full branches.
        state.u.uprops[CONFUSION].intrinsic = 1;
        const { env, calls } = operations(); // Confusion short-circuits rnd(100).
        assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_TIME, energy: 5 });
        assert.equal(state.u.uen, 5); // Integer half of base five is two.
        assert.equal(state.u.uhunger, 900 - hungerCost);
        assert.deepEqual(calls, [['message', 'You fail to cast the spell correctly.']]);
    });
}

// teleport.c dotele passes no environment to the immediate spelleffects
// caller. Its duplicated rejection must still use canonical live messages.
test('direct spelleffects caller without env preserves rejection feedback', async () => {
    const state = await started();
    clearTtyMessageWindow(state);
    state.u.uprops[STUNNED].intrinsic = 1; // Source rejectcasting's first guard.
    assert.equal(await spelleffects(SPE_FORCE_BOLT, true, false, state), ECMD_OK);
    assert.equal(state._ttyToplines, 'You are too impaired to cast a spell.');
    assert.equal(state.u.uen, 7);
});

test('Amulet loss clamps before the insufficient-energy message', async () => {
    const state = await started();
    const { env, calls } = operations([10]); // Maximum rnd(2*5) exceeds energy seven.
    assert.deepEqual(await spelleffects_check(0, state, env), { abort: true, res: ECMD_TIME, energy: 5 });
    assert.equal(state.u.uen, 0);
    assert.deepEqual(calls.map(call => call[0]), ['message', 'rnd', 'message']);
});
