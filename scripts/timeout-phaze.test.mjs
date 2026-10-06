import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FROMOUTSIDE, PASSES_WALLS, TIMEOUT, W_RINGL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { nh_timeout, nh_timeout_requires_live_state, phaze_dialogue } from '../js/timeout.js';

async function hero() {
    // Independent Monk setup supplies the source clock, display and occupation state.
    await runSegment({ seed: 1160615, datetime: '20861119133000', moves: '',
        nethackrc: 'OPTIONS=name:PhazeTest,role:Monk,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.u.uprops[PASSES_WALLS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return game;
}

const noRandom = {
    rn2: bound => assert.fail(`phaze_dialogue must not draw rn2(${bound})`),
    rnd: bound => assert.fail(`phaze_dialogue must not draw rnd(${bound})`),
};

test('phaze dialogue selects ordinary messages only at source timeouts five and three', async () => {
    const state = await hero();
    // C truncates timeout/2; odd counts 5 and 3 select the two source text entries.
    for (const timeout of [0, 1, 2, 3, 4, 5, 6, 7]) {
        state.u.uprops[PASSES_WALLS].intrinsic = timeout;
        const messages = [];
        await phaze_dialogue(state, { random: noRandom,
            message: async text => { messages.push(text); },
            urgentMessage: async () => assert.fail('C uses ordinary pline'),
        });
        assert.deepEqual(messages, timeout === 5 ? ['You start to feel bloated.']
            : timeout === 3 ? ['You are feeling rather flabby.'] : []);
        assert.equal(state.u.uprops[PASSES_WALLS].intrinsic, timeout,
            'the helper leaves timeout decrement to its caller');
        assert.equal(nh_timeout_requires_live_state(state), false,
            'this output-only helper does not require levitation-style occupation handoff');
    }
});

test('phaze dialogue suppresses raw extrinsic and permanent intrinsic sources but ignores blocked', async () => {
    const state = await hero();
    const property = state.u.uprops[PASSES_WALLS];
    // Five is the first warning; ring and permanent sources suppress it independently.
    for (const [intrinsic, extrinsic, blocked, expected] of [
        [5, W_RINGL, 0, []],
        [FROMOUTSIDE | 5, 0, 0, []],
        [FROMOUTSIDE | 5, W_RINGL, 0, []],
        [5, 0, W_RINGL, ['You start to feel bloated.']],
    ]) {
        Object.assign(property, { intrinsic, extrinsic, blocked });
        const messages = [];
        await phaze_dialogue(state, { random: noRandom,
            message: async text => { messages.push(text); } });
        assert.deepEqual(messages, expected);
        assert.deepEqual(property, { intrinsic, extrinsic, blocked },
            'suppression and output change no property fields');
    }
});

test('nh_timeout awaits the ordinary warning before decrement without cancelling occupation', async () => {
    const state = await hero();
    state.u.uprops[PASSES_WALLS].intrinsic = 3; // Last source warning, before expiry.
    const occupation = () => true;
    state.go.occupation = occupation;
    state.go.occtxt = 'searching';
    state.multi = 7; // A positive pending count must survive this output-only helper.
    let release;
    let entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const messages = [];
    const pending = nh_timeout(state, { message: async text => {
        messages.push(text);
        entered();
        await new Promise(resolve => { release = resolve; });
    } });
    await reached;
    assert.equal(state.u.uprops[PASSES_WALLS].intrinsic & TIMEOUT, 3);
    assert.equal(state.go.occupation, occupation);
    release();
    await pending;
    assert.deepEqual(messages, ['You are feeling rather flabby.']);
    assert.equal(state.u.uprops[PASSES_WALLS].intrinsic & TIMEOUT, 2);
    assert.equal(state.go.occupation, occupation);
    assert.equal(state.multi, 7);
});

test('phaze planning defaults to silence and uses the supplied ordinary message callback', async () => {
    const state = await hero();
    state.u.uprops[PASSES_WALLS].intrinsic = 5; // Would print the ordinary bloated warning live.
    const before = state.nhDisplay.serialize();
    await phaze_dialogue(state, { planning: true, random: noRandom });
    assert.equal(state.nhDisplay.serialize(), before,
        'the default planning callback leaves the live GameDisplay unchanged');
    const events = [];
    await nh_timeout(state, { planning: true,
        message: async text => { events.push(text); } });
    assert.deepEqual(events, ['You start to feel bloated.'],
        'allmain supplies silentDisplay through this same ordinary callback');
    assert.equal(state.nhDisplay.serialize(), before);
    assert.equal(state.u.uprops[PASSES_WALLS].intrinsic & TIMEOUT, 4);
});

test('phaze source text and timeout caller retain the complete C function contract', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/timeout.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/timeout.js', import.meta.url), 'utf8');
    const source = c.slice(c.indexOf('staticfn void\nphaze_dialogue(void)'),
        c.indexOf('/* Similar to Passes_walls'));
    assert.match(source, /EPasses_walls \|\| \(HPasses_walls & ~TIMEOUT\)/u);
    assert.match(source, /pline\("%s", phaze_texts\[SIZE\(phaze_texts\) - i\]\);/u);
    assert.doesNotMatch(source, /stop_occupation|rn2|rnd|urgent_pline/u);
    assert.match(c, /if \(HPasses_walls & TIMEOUT\)\s+phaze_dialogue\(\);/u);
    assert.doesNotMatch(js, /note_unported\('timeout.c phaze_dialogue'\)/u);
    assert.match(js, /if \(u\.uprops\?\.\[PASSES_WALLS\]\?\.intrinsic & TIMEOUT\)\s+await phaze_dialogue\(state, displayEnv\);/u);
});
