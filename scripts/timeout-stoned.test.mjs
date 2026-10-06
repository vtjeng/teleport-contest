import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    A_DEX, BOTH_SIDES, DEAF, FAST, FROMOUTSIDE, OBJ_INVENT,
    SLIMED, SLT_ENCUMBER, STONED, VOMITING, WOUNDED_LEGS,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { You_can_move_again } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { PM_FOG_CLOUD, PM_LIZARD, PM_NEWT } from '../js/monsters.js';
import { TIN } from '../js/objects.js';
import { nh_timeout, nh_timeout_requires_live_state, stoned_dialogue } from '../js/timeout.js';

async function hero(timeout) {
    // Independent initialized Wizard supplies command, occupation and attribute state.
    await runSegment({ seed: 1170624, datetime: '20971006221500', moves: '',
        nethackrc: 'OPTIONS=name:StoneTest,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.u.uprops[STONED].intrinsic = timeout;
    game.u.aexe[A_DEX] = 0;
    return game;
}
function operations(events) {
    return { message: async text => { events.push(['ordinary', text]); },
        urgentMessage: async text => { events.push(['urgent', text]); },
        random: { rn2(bound) { assert.equal(bound, 2, 'DEX exercise uses rn2(2)');
            events.push(['rn2', bound]); return 1; } } };
}

test('stoned dialogue prints every source warning before unconditional Dexterity exercise', async () => {
    // Source array indexes by 5-timeout; count 6 and zero still exercise without a warning.
    const texts = new Map([[5, 'You are slowing down.'], [4, 'Your limbs are stiffening.'],
        [3, 'Your limbs have turned to stone.'], [2, 'You have turned to stone.'],
        [1, 'You are a statue.']]);
    for (const timeout of [0, 1, 2, 3, 4, 5, 6]) {
        const state = await hero(timeout);
        const events = [];
        await stoned_dialogue(state, operations(events));
        assert.deepEqual(events, [...(texts.has(timeout) ? [['urgent', texts.get(timeout)]] : []),
            ['rn2', 2]]);
        assert.equal(state.u.aexe[A_DEX], -1);
        assert.equal(state.u.uprops[STONED].intrinsic, timeout);
        assert.equal(nh_timeout_requires_live_state(state), timeout !== 0,
            'every nonzero source Stoned value requires live dialogue effects');
    }
});

test('five-turn warning awaits output before clearing intrinsic speed, positive multi and exercise', async () => {
    const state = await hero(5); // Initial source stage.
    state.u.uprops[FAST] = { intrinsic: FROMOUTSIDE | 9, extrinsic: FROMOUTSIDE, blocked: 0 };
    state.multi = 8; // Only positive multi is cancelled in this stage.
    let release;
    let entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const events = [];
    const env = operations(events);
    env.urgentMessage = async text => {
        events.push(['urgent', text]); entered();
        await new Promise(resolve => { release = resolve; });
    };
    const pending = nh_timeout(state, env);
    await reached;
    assert.equal(state.u.uprops[FAST].intrinsic, FROMOUTSIDE | 9);
    assert.equal(state.multi, 8);
    assert.equal(state.u.aexe[A_DEX], 0);
    assert.equal(state.u.uprops[STONED].intrinsic, 5);
    release(); await pending;
    assert.equal(state.u.uprops[FAST].intrinsic, 0);
    assert.equal(state.u.uprops[FAST].extrinsic, FROMOUTSIDE);
    assert.equal(state.multi, 0);
    assert.equal(state.u.aexe[A_DEX], -1);
    assert.equal(state.u.uprops[STONED].intrinsic, 4);
    state.u.uprops[STONED].intrinsic = FROMOUTSIDE; // C calls on raw Stoned, even masked zero.
    assert.equal(nh_timeout_requires_live_state(state), true);
    state.u.uinvulnerable = true;
    assert.equal(nh_timeout_requires_live_state(state), false);
});

test('stage four retains curing tin occupation but cancels other occupations', async () => {
    for (const species of [PM_LIZARD, PM_NEWT]) {
        const state = await hero(4); // Only this stage uses the consumed Popeye result.
        const occupation = Object.assign(() => true, { cSourceFunction: 'eat.c:opentin' });
        state.go.occupation = occupation;
        state.go.occtxt = 'opening the tin';
        state.context.tin = { tin: {
            otyp: TIN, where: OBJ_INVENT, known: true, corpsenm: species,
        } };
        state.multi = 8; // Positive pending actions cancel even when the tin occupation survives.
        const events = [];
        await stoned_dialogue(state, operations(events));
        assert.equal(state.go.occupation, species === PM_LIZARD ? occupation : null);
        assert.equal(state.multi, 0);
        assert.deepEqual(events, [['urgent', 'Your limbs are stiffening.'],
            ...(species === PM_LIZARD ? [] : [['ordinary', 'You stop opening the tin.']]),
            ['rn2', 2]]);
    }
});

test('stage three immobilizes and clears unmounted wounds silently before exercise', async () => {
    for (const mounted of [false, true]) {
        const state = await hero(3); // Source limbs-to-stone stage.
        state.go.occupation = () => true;
        state.go.occtxt = 'searching';
        state.u.uprops[WOUNDED_LEGS] = { intrinsic: 17, extrinsic: BOTH_SIDES, blocked: 0 };
        state.u.atemp[A_DEX] = -1; // One wound penalty is returned when healed.
        state.go.oldcap = SLT_ENCUMBER; // Silent healing must leave feedback bookkeeping untouched.
        state.u.usteed = mounted ? {} : null;
        const events = [];
        await stoned_dialogue(state, operations(events));
        assert.deepEqual(events, [['urgent', 'Your limbs have turned to stone.'],
            ['ordinary', 'You stop searching.'], ['rn2', 2]]);
        assert.equal(state.go.occupation, null);
        assert.equal(state.multi, -3);
        assert.equal(state.multi_reason, 'getting stoned');
        assert.equal(state.nomovemsg, You_can_move_again);
        assert.equal(state.u.uprops[WOUNDED_LEGS].intrinsic, mounted ? 17 : 0);
        assert.equal(state.u.uprops[WOUNDED_LEGS].extrinsic, mounted ? BOTH_SIDES : 0);
        assert.equal(state.u.atemp[A_DEX], mounted ? -1 : 0);
        assert.equal(state.go.oldcap, SLT_ENCUMBER);
    }
});

test('stage two extends only short deafness and clears vomiting/slime without cure messages', async () => {
    // Source requires 0 < deaf timeout < 5, retaining permanent source bits.
    for (const deaf of [0, 1, 4, 5, 7]) {
        const state = await hero(2);
        state.u.uprops[DEAF].intrinsic = FROMOUTSIDE | deaf;
        state.u.uprops[VOMITING].intrinsic = 6;
        state.u.uprops[SLIMED].intrinsic = 6;
        const events = [];
        await stoned_dialogue(state, operations(events));
        assert.equal(state.u.uprops[DEAF].intrinsic, FROMOUTSIDE | (deaf > 0 && deaf < 5 ? 5 : deaf));
        assert.equal(state.u.uprops[VOMITING].intrinsic, 0);
        assert.equal(state.u.uprops[SLIMED].intrinsic, 0);
        assert.deepEqual(events, [['urgent', 'You have turned to stone.'], ['rn2', 2]]);
    }
});

test('limbless physiology uses extremities and preserves polymorph exercise suppression', async () => {
    const state = await hero(4);
    state.u.umonnum = PM_FOG_CLOUD;
    state.youmonst.data = state.mons[PM_FOG_CLOUD]; // This source form has no limbs.
    const events = [];
    await stoned_dialogue(state, operations(events));
    assert.deepEqual(events, [['urgent', 'Your extremities are stiffening.']]);
    assert.equal(state.u.aexe[A_DEX], 0, 'exercise skips physical attributes while polymorphed');
});

test('stoned source caller runs before decrements and the obsolete gap is removed', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/timeout.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/timeout.js', import.meta.url), 'utf8');
    assert.match(c, /if \(Stoned\)\s+stoned_dialogue\(\);/u);
    assert.match(c, /if \(Wounded_legs && !u\.usteed\)\s+heal_legs\(2\);/u);
    assert.match(c, /exercise\(A_DEX, FALSE\);/u);
    assert.doesNotMatch(js, /note_unported\('timeout.c stoned_dialogue'\)/u);
    assert.match(js, /if \(u\.uprops\?\.\[STONED\]\?\.intrinsic\)\s+await stoned_dialogue/u);
});
