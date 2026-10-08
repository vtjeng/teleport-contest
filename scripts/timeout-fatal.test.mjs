import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    FROMOUTSIDE, G_GENOD, I_SPECIAL, KILLED_BY, NO_KILLER_PREFIX,
    POISONING, SICK, SLIMED, STONED, STRANGLED,
} from '../js/const.js';
import { delayed_killer } from '../js/end.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GREEN_SLIME } from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { AMULET_OF_LIFE_SAVING } from '../js/objects.js';
import { _doWearInternals } from '../js/do_wear.js';
import * as timeout from '../js/timeout.js';

const source = readFileSync('nethack-c/upstream/src/timeout.c', 'utf8');
const jsSource = readFileSync('js/timeout.js', 'utf8');
async function hero() {
    await runSegment({ seed: 1540811, datetime: '20420815110900', moves: '',
        nethackrc: 'OPTIONS=name:FatalClock,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    return game;
}
function more() {
    for (let i = 0; i < 100; ++i) game.nhDisplay.pushKey(32);
}
async function lifeSave(state) {
    const amulet = mksobj(AMULET_OF_LIFE_SAVING, false, false, { state });
    addinv(amulet, { state });
    more();
    await _doWearInternals.Amulet_on(amulet, state);
    more();
}

test('fatal timeout helpers retain source order and all four production callers', () => {
    assert.match(source, /\*intrinsic_p \|= I_SPECIAL;[\s\S]*?done\(how\);[\s\S]*?\*intrinsic_p &= ~I_SPECIAL;\s*disp.botl = TRUE;/u);
    assert.equal(typeof timeout.done_timeout, 'function');
    assert.equal(typeof timeout.slimed_to_death, 'function');
    for (const [how, which] of [['STONING', 'STONED'], ['POISONING', 'SICK'], ['DIED', 'STRANGLED']]) {
        assert.ok(source.includes(`done_timeout(${how}, ${which});`));
        assert.ok(jsSource.includes(`await done_timeout(${how}, ${which}, state, env);`));
    }
    assert.match(source, /save_mvflags & ~G_GENOD;[\s\S]*?polymon\(PM_GREEN_SLIME\);[\s\S]*?mvflags = save_mvflags;\s*done_timeout\(TURNED_SLIME, SLIMED\);/u);
    assert.match(jsSource, /await polymon\(PM_GREEN_SLIME, state, env\);[\s\S]*?mvflags = saveMvflags;[\s\S]*?await done_timeout\(TURNED_SLIME, SLIMED, state, env\);/u);
});

test('done_timeout exposes the source property during life saving and clears only its special bit afterward', async () => {
    const state = await hero();
    await lifeSave(state);
    const property = state.u.uprops[SICK];
    property.intrinsic = FROMOUTSIDE;
    state.killer = { name: 'illness', format: KILLED_BY };
    const observed = [];
    const display = state.nhDisplay, original = display.setCell.bind(display);
    display.setCell = (...args) => {
        observed.push(property.intrinsic);
        return original(...args);
    };
    try { await timeout.done_timeout(POISONING, SICK, state); }
    finally { display.setCell = original; }
    assert.ok(observed.length > 0);
    assert.ok(observed.every(value => (value & I_SPECIAL) !== 0), 'I_SPECIAL survives all awaited death output');
    assert.equal(property.intrinsic, FROMOUTSIDE, 'life-saved source epilogue preserves other intrinsic bits');
    assert.equal(state.disp.botl, true);
    assert.equal(state.u.umortality, 1);
    assert.equal(state.uamul, null);
});

test('done_timeout retains I_SPECIAL on the actual final-death boundary', async () => {
    const state = await hero();
    state.flags.end_disclose = 'none';
    state.flags.bones = false;
    state.killer = { name: 'fatal clock', format: KILLED_BY };
    more();
    await timeout.done_timeout(POISONING, SICK, state);
    assert.equal(state.program_state.gameover, true);
    assert.equal(state.u.uprops[SICK].intrinsic & I_SPECIAL, I_SPECIAL,
        'C never reaches the life-saved epilogue after actual death');
});

test('slime expiry awaits polymon with its delayed killer consumed before death', async () => {
    const state = await hero();
    await lifeSave(state);
    delayed_killer(SLIMED, KILLED_BY, 'slimy infection', state);
    const killer = state.killer.next;
    let release, entered;
    let first = true;
    const reached = new Promise(resolve => { entered = resolve; });
    const pending = timeout.slimed_to_death(killer, state, { message: async () => {
        if (!first) return;
        first = false;
        entered();
        await new Promise(resolve => { release = resolve; });
    } });
    await reached;
    assert.equal(state.killer.next, null);
    assert.equal(state.killer.name, 'slimy infection');
    assert.equal(state.killer.format, KILLED_BY);
    assert.equal(state.u.umortality, 0, 'fatal owner follows the awaited polymorph');
    release();
    await pending;
    assert.ok(state.gamelog.some(entry => entry.text === 'averted death (turned to slime by slimy infection)'));
});

test('already-green-slime expiry only removes its delayed killer', async () => {
    const state = await hero();
    state.u.umonnum = PM_GREEN_SLIME;
    state.youmonst.data = state.mons[PM_GREEN_SLIME];
    delayed_killer(SLIMED, KILLED_BY, 'old infection', state);
    const killer = state.killer.next;
    state.killer.name = 'unchanged';
    const flags = state.svm.mvitals[PM_GREEN_SLIME].mvflags | G_GENOD;
    state.svm.mvitals[PM_GREEN_SLIME].mvflags = flags;
    await timeout.slimed_to_death(killer, state);
    assert.equal(state.killer.next, null);
    assert.equal(state.killer.name, 'unchanged');
    assert.equal(state.svm.mvitals[PM_GREEN_SLIME].mvflags, flags);
    assert.equal(state.u.umortality, 0);
});

test('slime expiry changes form before fatal disclosure and retains its default killer path', async () => {
    const state = await hero();
    await lifeSave(state);
    const messages = [];
    const flags = state.svm.mvitals[PM_GREEN_SLIME].mvflags;
    await timeout.slimed_to_death(null, state, { message: async text => messages.push(text) });
    assert.equal(state.u.umonnum, PM_GREEN_SLIME);
    assert.equal(state.youmonst.data, state.mons[PM_GREEN_SLIME]);
    assert.equal(state.svm.mvitals[PM_GREEN_SLIME].mvflags, flags);
    assert.equal(state.u.umortality, 1);
    assert.equal(state.u.uprops[SLIMED].intrinsic & I_SPECIAL, 0);
    assert.ok(state.gamelog.some(entry => entry.text.includes('averted death (turned into green slime)')));
    assert.ok(messages.some(text => text.includes('green slime')));
    assert.match(jsSource, /state.killer.format = NO_KILLER_PREFIX;\s*state.killer.name = 'turned into green slime';/u);
    assert.equal(NO_KILLER_PREFIX, 2);
});

test('fatal slime expiry requires live state before decrement while later ticks remain plannable', async () => {
    const state = await hero();
    for (const which of [SICK, STONED, STRANGLED, SLIMED]) {
        state.u.uprops[which].intrinsic = 1;
        assert.equal(timeout.nh_timeout_requires_live_state(state), true);
        state.u.uinvulnerable = true;
        assert.equal(timeout.nh_timeout_requires_live_state(state), false);
        state.u.uinvulnerable = false;
        state.u.uprops[which].intrinsic = 0;
    }
    state.u.uprops[SLIMED].intrinsic = 2;
    assert.equal(timeout.nh_timeout_requires_live_state(state), false);
});
