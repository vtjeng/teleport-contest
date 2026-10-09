import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_CON, DEAF, SICK, TIMEOUT } from '../js/const.js';
import { use_unicorn_horn } from '../js/apply.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { UNICORN_HORN, TOOL_CLASS } from '../js/objects.js';
import { enableRngLog, getRngLog } from '../js/rng.js';
import { validateCleanRecipe } from './diff-fresh.mjs';

const CursedHornRecipe = validateCleanRecipe(
    JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/unicorn-horn-cursed-independent.session.json',
        import.meta.url,
    ), 'utf8')),
    'cursed unicorn horn application',
);
const InventoryMenuHornRecipe = validateCleanRecipe(
    JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/unicorn-horn-inventory-menu-independent.session.json',
        import.meta.url,
    ), 'utf8')),
    'inventory-menu unicorn horn application',
);
const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const APPLY_JS = readFileSync(
    new URL('../js/apply.js', import.meta.url), 'utf8',
);

test('use_unicorn_horn routes existing Vomiting through eat.c:vomit', () => {
    const cStart = APPLY_C.indexOf('use_unicorn_horn(struct obj **optr)');
    const jsStart = APPLY_JS.indexOf('async function use_unicorn_horn(');
    assert.notEqual(cStart, -1);
    assert.notEqual(jsStart, -1);
    const cCase = APPLY_C.slice(
        APPLY_C.indexOf('case 4:', cStart),
        APPLY_C.indexOf('case 5:', cStart),
    );
    const jsCase = APPLY_JS.slice(
        APPLY_JS.indexOf('case 4:', jsStart),
        APPLY_JS.indexOf('case 5:', jsStart),
    );
    assert.match(cCase, /if \(Vomiting\)\s+vomit\(\);/u);
    assert.match(jsCase,
        /if \(intrinsic\(VOMITING\)\)\s+await vomit\(state, \{ \.\.\.env, message \}\);/u);
});

test('doapply dispatches a cursed unicorn horn through use_unicorn_horn',
    async () => {
        assert.equal(CursedHornRecipe.segments.length, 1);
        await runSegment(CursedHornRecipe.segments[0]);

        // The independent C recording selects case 6 of the cursed switch.
        // make_deaf() applies the timeout, then this command's turn decrements
        // it once before the recorded screen is captured.
        assert.equal(game.u.uprops[DEAF].intrinsic & TIMEOUT, 19);
        assert.equal(game._pending_message, 'You are unable to hear anything.');
    });

test('inventory item actions queue doapply for an uncursed unicorn horn',
    async () => {
        assert.equal(InventoryMenuHornRecipe.segments.length, 1);
        await runSegment(InventoryMenuHornRecipe.segments[0]);

        // The C input selects the horn from `i`, then chooses its IA_APPLY_OBJ
        // action. iactions.c queues doapply and its inventory letter.
        assert.equal(game._pending_message, 'Nothing happens.');
        assert.equal(game.u.uprops[DEAF].intrinsic & TIMEOUT, 0);
    });

test('cursed horn sickness draws from current Constitution before its message', async () => {
    const start = APPLY_C.indexOf('use_unicorn_horn(struct obj **optr)');
    const sickness = APPLY_C.slice(start, APPLY_C.indexOf('case 1:', start));
    assert.match(sickness, /rn1\(90, 10\)/u);
    assert.match(sickness, /rn2\(13\) \/ 2/u);
    assert.match(sickness, /rn1\(ACURR\(A_CON\), 20\)/u);
    await runSegment({ ...CursedHornRecipe.segments[0], moves: '' });
    // C acurr sums all three arrays: 13 + 4 - 1 = 16, an interior value
    // which exposes the accidental default clamp to 3 in the reversed call.
    game.u.acurr.a[A_CON] = 13;
    game.u.abon[A_CON] = 4;
    game.u.atemp[A_CON] = -1;
    game.u.uprops[SICK].intrinsic = 0;
    const horn = { otyp: UNICORN_HORN, oclass: TOOL_CLASS, quan: 1,
        cursed: true, dknown: true, bknown: true };
    // ISAAC draws from the end of r: lcount=19+10, switch=0/2, duration=7+20.
    // Supplying three words isolates the source draw order without a seed search.
    game.coreCtx = { n: 3, r: [7n, 0n, 19n] };
    enableRngLog();
    const messages = [];
    const env = { message: text => {
        messages.push(text);
        assert.deepEqual(getRngLog(), ['rn2(90)=19', 'rn2(13)=0', 'rn2(16)=7']);
    }, random: { rn2: () => 0 }, encumberMessage: async () => 0 };
    await use_unicorn_horn(horn, game, env);
    assert.deepEqual(messages, ['You feel deathly sick.']);
    assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 27);
    assert.equal(game.coreCtx.n, 0);

    // The source's nonzero Sick timeout arm uses 10/3+1 rather than drawing
    // another duration, independently of current Constitution.
    game.u.uprops[SICK].intrinsic = 10;
    game.coreCtx = { n: 2, r: [0n, 19n] };
    enableRngLog();
    await use_unicorn_horn(horn, game, { ...env, message: () => {} });
    assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 4);
    assert.deepEqual(getRngLog(), ['rn2(90)=19', 'rn2(13)=0']);
    assert.equal(game.coreCtx.n, 0);
});
