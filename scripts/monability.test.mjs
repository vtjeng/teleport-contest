import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    ECMD_OK, ECMD_TIME, FOUNTAIN, F_WARNED, POOL, ROOM,
} from '../js/const.js';
import { domonability } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_GREMLIN, PM_WIZARD, PM_RED_DRAGON, PM_SHRIEKER,
    PM_WHITE_UNICORN, PM_GNOME,
} from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    MONABILITY_CASES, loadMonabilityRecipe, verifyMonabilitySegment,
} from './run-monability.mjs';

const C = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
const JS_SOURCE = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
async function started(form = PM_GREMLIN) {
    const segment = loadMonabilityRecipe('gremlin-dry-floor').segments[0];
    await runSegment({ ...segment, moves: ' ' });
    game.u.umonnum = form;
    game.youmonst.data = game.mons[form];
    clearTtyMessageWindow(game);
    return game;
}

test('domonability retains the complete C ability predicate order', () => {
    const cStart = C.indexOf('domonability(void)');
    const c = C.slice(cStart, C.indexOf('enter_explore_mode(void)', cStart));
    const js = JS_SOURCE.slice(JS_SOURCE.indexOf('export async function domonability('), JS_SOURCE.indexOf('async function runMonsterCommand('));
    for (const body of [c, js]) {
        let previous = -1;
        for (const name of [
            'can_breathe', 'AT_SPIT', 'S_NYMPH', 'AT_GAZE', 'is_were',
            'dohide', 'dospinweb', 'is_mind_flayer', 'PM_GREMLIN',
            'is_unicorn', 'MS_SHRIEK', 'is_vampire', 'usteed', 'Upolyd',
        ]) {
            const index = body.indexOf(name, previous + 1);
            assert.ok(index > previous, `${name} follows the preceding branch`);
            previous = index;
        }
    }
    assert.match(c, /if \(split_mon\([^;]+\)\)\s+dryup\(u\.ux, u\.uy, TRUE\)/u);
    assert.match(js, /if \(await split_mon\([^;]+\)\)\s+await dryup\(ux, uy, true, state\)/u);
    assert.match(c, /use_unicorn_horn\(\(struct obj \*\*\) 0\);\s+return ECMD_TIME;/u);
    assert.match(js, /await use_unicorn_horn\(null, state\);\s+return ECMD_TIME;/u);
});

test('the context-menu monster-ability producer is excluded by C #if 0', () => {
    const start = C.lastIndexOf('#if 0', C.indexOf('mcmd_addmenu(win, MCMD_MONABILITY'));
    const end = C.indexOf('#endif', start);
    assert.match(C.slice(start, end), /mcmd_addmenu\(win, MCMD_MONABILITY/u);
    assert.match(C, /case MCMD_MONABILITY:\s+cmdq_add_ec\(CQ_CANNED, domonability\)/u);
});

test('a one-HP gremlin fountain attempt skips clone creation and dryup draws', async () => {
    const state = await started();
    // split_mon's source clamp reduces this over-max pool to one before the
    // >1 clone guard; a warned fountain would dry up if called at all.
    state.u.mh = 2;
    state.u.mhmax = 1;
    const location = state.level.at(state.u.ux, state.u.uy);
    location.typ = FOUNTAIN;
    location.flags = F_WARNED;
    const head = state.level.monlist;
    const previousMessage = state._ttyToplines;
    const draws = getRngLog().length;
    assert.equal(await domonability(state), ECMD_OK);
    assert.equal(state.u.mh, 1);
    assert.equal(state.u.mhmax, 1);
    assert.equal(state.level.monlist, head);
    assert.equal(location.typ, FOUNTAIN);
    assert.equal(getRngLog().length, draws);
    assert.equal(state._ttyToplines, previousMessage);
});

test('a one-HP pool attempt stays silent while dry ground gives no-fountain feedback', async () => {
    for (const typ of [POOL, ROOM]) {
        const state = await started();
        state.u.mh = state.u.mhmax = 1; // clone guard, no runtime creation
        state.level.at(state.u.ux, state.u.uy).typ = typ;
        const previousMessage = state._ttyToplines;
        const draws = getRngLog().length;
        assert.equal(await domonability(state), ECMD_OK);
        assert.equal(getRngLog().length, draws);
        assert.equal(state._ttyToplines,
            typ === POOL ? previousMessage : 'There is no fountain here.');
    }
});

test('intrinsic unicorn horn consumes command time without a carried horn', async () => {
    const state = await started(PM_WHITE_UNICORN);
    const draws = getRngLog().length;
    assert.equal(await domonability(state), ECMD_TIME);
    assert.equal(state._ttyToplines, 'Nothing happens.');
    assert.equal(getRngLog().length, draws);
});

test('normal and reflexive forms use source feedback and spend no time', async () => {
    for (const [form, text] of [
        [PM_WIZARD, "You don't have a special ability in your normal form!"],
        [PM_GNOME, 'Any special ability you may have is purely reflexive.'],
    ]) {
        const state = await started(form);
        assert.equal(await domonability(state), ECMD_OK);
        assert.equal(state._ttyToplines, text);
    }
});

test('a buried shrieker reports the rock without aggravating monsters', async () => {
    const state = await started(PM_SHRIEKER);
    state.u.uburied = true;
    const draws = getRngLog().length;
    assert.equal(await domonability(state), ECMD_OK);
    assert.match(state._ttyToplines, /sound does not carry well through rock/u);
    assert.equal(getRngLog().length, draws);
});

test('forced steed breath records the discarded callee and retains ECMD_TIME', async () => {
    const state = await started(PM_WIZARD);
    state.u.usteed = { data: state.mons[PM_RED_DRAGON] };
    state.unported = new Set();
    const previousMessage = state._ttyToplines;
    const draws = getRngLog().length;
    assert.equal(await domonability(state), ECMD_TIME);
    assert.ok(state.unported.has('dogmove.c pet_ranged_attk'));
    assert.equal(getRngLog().length, draws);
    assert.equal(state._ttyToplines, previousMessage);
});

test('independent C-first monster-ability recipes reach their planned forms and effects', async () => {
    for (const { name } of MONABILITY_CASES)
        await verifyMonabilitySegment(loadMonabilityRecipe(name).segments[0]);
});
