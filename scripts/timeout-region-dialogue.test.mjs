import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    FROMOUTSIDE, MAGICAL_BREATHING, POISON_RES, TIMEOUT, W_RINGL,
} from '../js/const.js';
import { M1_BREATHLESS, M2_UNDEAD } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import * as timeout from '../js/timeout.js';

const source = readFileSync(
    new URL('../nethack-c/upstream/src/timeout.c', import.meta.url), 'utf8',
);
const regionTexts = [...source.match(/region_texts\[\] = \{([\s\S]*?)\};/u)[1]
    .matchAll(/"([^"]+)"/gu)].map(match => match[1]);
const noRandom = {
    rn2: bound => assert.fail(`region_dialogue must not draw rn2(${bound})`),
    rnd: bound => assert.fail(`region_dialogue must not draw rnd(${bound})`),
};

function regionState() {
    return {
        u: { uprops: {
            [MAGICAL_BREATHING]: { intrinsic: 0, extrinsic: 0, blocked: 0 },
            [POISON_RES]: { intrinsic: 0, extrinsic: 0 },
        } },
        // Zero species flags need ordinary breathing and have no immunity.
        youmonst: { data: { mflags1: 0, mflags2: 0, mlet: 0 } },
        // C's region callback table assigns zero to INSIDE_GAS_CLOUD.
        level: { regions: [{ hero_inside: true, inside_f: 0 }] },
    };
}

test('region dialogue selects the two C texts only at timeouts five and three', async () => {
    const state = regionState();
    const property = state.u.uprops[MAGICAL_BREATHING];
    // Odd counts 5 and 3 select indices 0 and 1. The surrounding counts
    // cover even clocks, expiry, the lower bound and just above the table.
    for (const remaining of [0, 1, 2, 3, 4, 5, 6, 7]) {
        property.intrinsic = remaining;
        const messages = [];
        await timeout.region_dialogue(state, { random: noRandom,
            message: async text => messages.push(text),
            urgentMessage: async () => assert.fail('C calls ordinary pline'),
        });
        assert.deepEqual(messages, remaining === 5 ? [regionTexts[0]]
            : remaining === 3 ? [regionTexts[1]] : []);
        assert.equal(property.intrinsic, remaining,
            'the helper restores the clock and leaves decrement to nh_timeout');
    }
});

test('region dialogue checks danger with only timeout bits removed and restores before output', async () => {
    // The permanent flag must survive the temporary clear and suppress the
    // warning; C still calls region_danger even when Breathless is true.
    for (const intrinsic of [5, FROMOUTSIDE | 5]) {
        const state = regionState();
        const property = state.u.uprops[MAGICAL_BREATHING];
        Object.assign(property, { intrinsic, blocked: W_RINGL });
        const observed = [];
        Object.defineProperty(state.level.regions[0], 'hero_inside', {
            get() { observed.push(property.intrinsic); return true; },
        });
        const messages = [];
        await timeout.region_dialogue(state, { message: async text => {
            assert.equal(property.intrinsic, intrinsic,
                'the original timeout is restored before pline can await input');
            messages.push(text);
        } });
        assert.deepEqual(observed, [intrinsic & ~TIMEOUT]);
        assert.deepEqual(property, { intrinsic, extrinsic: 0, blocked: W_RINGL });
        assert.deepEqual(messages, intrinsic === 5 ? [regionTexts[0]] : []);
    }
});

test('region dialogue suppresses breathing protection, resistance and absent gas', async () => {
    const changes = [
        state => { state.u.uprops[MAGICAL_BREATHING].extrinsic = W_RINGL; },
        state => { state.youmonst.data.mflags1 = M1_BREATHLESS; },
        state => { state.youmonst.data.mflags2 = M2_UNDEAD; },
        state => { state.u.uprops[POISON_RES].intrinsic = FROMOUTSIDE; },
        state => { state.u.uprops[POISON_RES].extrinsic = W_RINGL; },
        state => { state.level.regions[0].hero_inside = false; },
        // One is EXPIRE_GAS_CLOUD, not the inside-gas callback.
        state => { state.level.regions[0].inside_f = 1; },
        state => { state.level.regions = []; },
    ];
    for (const change of changes) {
        const state = regionState();
        state.u.uprops[MAGICAL_BREATHING].intrinsic = 5;
        change(state);
        const before = structuredClone(state.u.uprops);
        await timeout.region_dialogue(state, { random: noRandom,
            message: async () => assert.fail('this source condition suppresses pline'),
        });
        assert.deepEqual(state.u.uprops, before);
    }
});

async function hero() {
    // Independent human Wizard startup supplies production timeout/display
    // state. This seed and date were chosen for the helper's clock checks.
    await runSegment({ seed: 1180610, datetime: '20861119143000', moves: '',
        nethackrc: 'OPTIONS=name:RegionClock,role:Wizard,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.u.uprops[MAGICAL_BREATHING] = { intrinsic: 5, extrinsic: 0, blocked: 0 };
    game.u.uprops[POISON_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    game.level.regions = [{ hero_inside: true, inside_f: 0 }];
    return game;
}

test('nh_timeout awaits the region warning before decrement and preserves occupation', async () => {
    const state = await hero();
    const property = state.u.uprops[MAGICAL_BREATHING];
    const occupation = () => true;
    state.go.occupation = occupation;
    state.multi = 7; // A pending count must survive this output-only warning.
    let release;
    let entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const messages = [];
    const pending = timeout.nh_timeout(state, { random: noRandom,
        message: async text => {
            messages.push(text);
            entered();
            await new Promise(resolve => { release = resolve; });
        },
    });
    await reached;
    assert.equal(property.intrinsic, 5);
    release();
    await pending;
    assert.deepEqual(messages, [regionTexts[0]]);
    assert.equal(property.intrinsic, 4);
    assert.equal(state.go.occupation, occupation);
    assert.equal(state.multi, 7);
});

test('region warning planning defaults to silence and retains the caller message operation', async () => {
    const state = await hero();
    const before = state.nhDisplay.serialize();
    await timeout.region_dialogue(state, { planning: true, random: noRandom });
    assert.equal(state.nhDisplay.serialize(), before);
    const messages = [];
    await timeout.region_dialogue(state, { planning: true,
        message: async text => messages.push(text), random: noRandom,
    });
    assert.deepEqual(messages, [regionTexts[0]]);
    assert.equal(timeout.nh_timeout_requires_live_state(state), false,
        'region dialogue has no occupation or input side effect to hand off');
    await timeout.nh_timeout(state, { planning: true, random: noRandom });
    assert.equal(state.nhDisplay.serialize(), before);
    assert.equal(state.u.uprops[MAGICAL_BREATHING].intrinsic, 4);
});
