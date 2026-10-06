import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    DB_LAVA, DB_MOAT, DRAWBRIDGE_UP, FROMOUTSIDE, LAVAPOOL,
    LEVITATION, POOL, ROOM, STONE, TIMEOUT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    levitation_dialogue, nh_timeout, nh_timeout_requires_live_state,
} from '../js/timeout.js';

async function hero() {
    // Independent initialized hero supplies the occupation and command queues.
    await runSegment({ seed: 1150611, datetime: '20751118113000', moves: '',
        nethackrc: 'OPTIONS=name:LeviTest,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.level.at(game.u.ux, game.u.uy).typ = ROOM;
    game.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return game;
}

function messages() {
    const events = [];
    return { events, message: async text => { events.push(['ordinary', text]); },
        urgentMessage: async text => { events.push(['urgent', text]); } };
}

test('levitation dialogue selects only the source five- and three-turn warnings', async () => {
    const state = await hero();
    // C i=(timeout-1)/2 permits only odd counts 5 and 3; 1 is float_down's turn.
    for (const timeout of [0, 1, 2, 3, 4, 5, 6, 7]) {
        state.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE | timeout;
        const env = messages();
        await levitation_dialogue(state, env);
        assert.deepEqual(env.events, timeout === 5
            ? [['ordinary', 'You float slightly lower.']]
            : timeout === 3 ? [['urgent', 'You wobble unsteadily in the air.']]
                : []);
        assert.equal(state.u.uprops[LEVITATION].intrinsic, FROMOUTSIDE | timeout,
            'dialogue does not decrement the packed intrinsic itself');
        assert.equal(nh_timeout_requires_live_state(state),
            timeout === 1 || timeout === 3 || timeout === 5,
            'source warnings and final expiry use the live handoff');
    }
});

test('levitation dialogue uses pool/lava surfaces except on the Plane of Water', async () => {
    const state = await hero();
    state.u.uprops[LEVITATION].intrinsic = 3; // The urgent warning needs surface().
    const location = state.level.at(state.u.ux, state.u.uy);
    // Raised drawbridges use their underlying terrain in is_pool_or_lava().
    for (const [typ, flags, noun] of [
        [POOL, 0, 'water'], [LAVAPOOL, 0, 'lava'],
        [DRAWBRIDGE_UP, DB_MOAT, 'water'], [DRAWBRIDGE_UP, DB_LAVA, 'lava'],
    ]) {
        location.typ = typ;
        location.flags = flags;
        const env = messages();
        await levitation_dialogue(state, env);
        assert.deepEqual(env.events, [['urgent', `You wobble unsteadily over the ${noun}.`]]);
    }
    state.u.uz = { ...state.water_level }; // C Is_waterlevel suppresses danger wording.
    location.typ = POOL;
    const env = messages();
    await levitation_dialogue(state, env);
    assert.deepEqual(env.events, [['urgent', 'You wobble unsteadily in the air.']]);
});

test('extrinsic levitation and inaccessible non-liquid terrain suppress warnings and handoff', async () => {
    const state = await hero();
    const property = state.u.uprops[LEVITATION];
    property.intrinsic = 5; // The ordinary warning would otherwise be active.
    property.extrinsic = FROMOUTSIDE; // Any nonzero ELevitation suppresses C dialogue.
    let env = messages();
    await levitation_dialogue(state, env);
    assert.deepEqual(env.events, []);
    assert.equal(nh_timeout_requires_live_state(state), false);
    property.extrinsic = 0;
    state.level.at(state.u.ux, state.u.uy).typ = STONE;
    env = messages();
    await levitation_dialogue(state, env);
    assert.deepEqual(env.events, []);
    assert.equal(nh_timeout_requires_live_state(state), false);
    state.level.at(state.u.ux, state.u.uy).typ = ROOM;
    for (const timeout of [3, 5]) {
        property.intrinsic = timeout; // Both emitted warnings cancel occupation live.
        assert.equal(nh_timeout_requires_live_state(state), true);
    }
    property.blocked = FROMOUTSIDE; // C reads HLevitation and ELevitation, not blocked.
    assert.equal(nh_timeout_requires_live_state(state), true);
    state.u.uinvulnerable = true;
    assert.equal(nh_timeout_requires_live_state(state), false,
        'nh_timeout returns for invulnerability before any dialogue');
});

test('nh_timeout awaits warning and occupation cancellation before decrement', async () => {
    const state = await hero();
    state.u.uprops[LEVITATION].intrinsic = 5; // The first warning, before common decrement.
    state.go.occupation = () => true;
    state.go.occtxt = 'searching';
    state.multi = 12; // A positive pending sequence must be cancelled with the occupation.
    let release;
    let entered;
    const reached = new Promise(resolve => { entered = resolve; });
    const events = [];
    const pending = nh_timeout(state, {
        message: async text => {
            events.push(text);
            if (text === 'You float slightly lower.') {
                entered();
                await new Promise(resolve => { release = resolve; });
            }
        },
    });
    await reached;
    assert.equal(state.u.uprops[LEVITATION].intrinsic & TIMEOUT, 5);
    assert.ok(state.go.occupation, 'warning suspension precedes stop_occupation');
    release();
    await pending;
    assert.deepEqual(events, ['You float slightly lower.', 'You stop searching.']);
    assert.equal(state.go.occupation, null);
    assert.equal(state.multi, 0);
    assert.equal(state.u.uprops[LEVITATION].intrinsic & TIMEOUT, 4);
});

test('levitation dialogue and production caller preserve the complete C branch', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/timeout.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/timeout.js', import.meta.url), 'utf8');
    assert.match(c, /if \(HLevitation & TIMEOUT\)\s+levitation_dialogue\(\);/u);
    assert.match(c, /urgent_pline\(s, danger \? "over" : "in",\s+danger \? surface\(u\.ux, u\.uy\) : "air"\);/u);
    assert.match(c, /pline1\(s\);\s+stop_occupation\(\);/u);
    assert.doesNotMatch(js, /note_unported\('timeout.c levitation_dialogue'\)/u);
    assert.match(js, /if \(u\.uprops\?\.\[LEVITATION\]\?\.intrinsic & TIMEOUT\)\s+await levitation_dialogue/u);
});
