import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as insight from '../js/insight.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { M_AP_NOTHING, M_AP_OBJECT, M_AP_FURNITURE, M_AP_MONSTER,
    FLYING, HALLUC, ROOM, POOL, TT_PIT, SPIKED_PIT, PIT } from '../js/const.js';
import { PM_SMALL_MIMIC, PM_TRAPPER, PM_CAVE_SPIDER, PM_GIANT_EEL,
    PM_ROCK_PIERCER } from '../js/monsters.js';
import { STRANGE_OBJECT, ROCK } from '../js/objects.js';
import { HLIQUIDS } from '../js/random_text_data.js';

async function hidden(form = PM_TRAPPER) {
    // Directly chosen seed initializes canonical naming/terrain owners, not
    // an oracle-specific path. ROOM removes generated furniture from fixtures.
    await runSegment({ seed: 93271023, datetime: '20781113130709',
        nethackrc: 'OPTIONS=name:Hiding,role:Wizard,race:human,gender:male,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none\n', moves: '' });
    game.u.ux = 10;
    game.u.uy = 8;
    game.level.at(10, 8).typ = ROOM;
    game.level.at(10, 8).roomno = 0;
    game.u.uundetected = 1;
    game.youmonst.data = game.mons[form];
    game.youmonst.m_ap_type = M_AP_NOTHING;
    game.u.uprops[FLYING].intrinsic = 0;
    game.u.uprops[FLYING].extrinsic = 0;
    game.u.uprops[FLYING].blocked = 0;
    game.level.objects[10][8] = null;
    game.level.traps = [];
    return game;
}
function line(state, final = 0, env = {}) {
    assert.equal(typeof insight.youhiding, 'function', 'the complete source owner exists');
    const lines = [];
    insight.youhiding(true, final, state, lines, env);
    return lines[0];
}

test('youhiding source pins branch and caller order', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/insight.c', import.meta.url), 'utf8');
    const body = c.slice(c.indexOf('\nyouhiding('), c.indexOf('\n/* #conduct command'));
    assert.ok(body.indexOf('U_AP_TYPE != M_AP_NOTHING') < body.indexOf('u.uundetected'));
    assert.ok(body.indexOf('S_EEL') < body.indexOf('hides_under'));
    assert.ok(body.indexOf('hides_under') < body.indexOf('is_clinger'));
    assert.match(body, /is_clinger\(gy\.youmonst\.data\) \|\| Flying/u);
    assert.match(body, /u\.utrap && u\.utraptype == TT_PIT/u);
    assert.match(body, /you_are\(buf, ""\)/u);
    assert.match(body, /msgflag \? "already" : "now"/u);
});

test('mimic appearance takes precedence over undetected hiding', async () => {
    const state = await hidden(PM_SMALL_MIMIC);
    state.youmonst.mappearance = STRANGE_OBJECT; // dohide's actual appearance.
    for (const [type,description] of [[M_AP_OBJECT,'mimicking a strange object'],
        [M_AP_FURNITURE,'mimicking something'],[M_AP_MONSTER,'mimicking someone'],
        // The source default covers an unexpected masked appearance type.
        [4,'mimicking']]) {
        state.youmonst.m_ap_type = type;
        assert.equal(line(state), ` You are ${description}.`);
        assert.equal(line(state, 2), ` You were ${description}.`); // final disclosure.
    }
});

test('eel description is water-only and precedes ordinary floor hiding', async () => {
    const state = await hidden(PM_GIANT_EEL);
    assert.equal(line(state), ' You are hiding.'); // No water, no fallback.
    state.level.at(10, 8).typ = POOL;
    assert.equal(line(state), ' You are hiding in the pool of water.');
});

test('cover naming uses the top object and preserves absent-cover behavior', async () => {
    const state = await hidden(PM_CAVE_SPIDER);
    assert.equal(line(state), ' You are hiding.'); // No ceiling/floor fallback.
    const rock = {otyp:ROCK,quan:1,oclass:state.objects[ROCK].oc_class,dknown:1,known:1};
    state.level.objects[10][8] = rock;
    assert.equal(line(state), ' You are hiding underneath a rock.');
    rock.quan = 2; // ansimpleoname omits the article for plural stacks.
    assert.equal(line(state), ' You are hiding underneath rocks.');
});

test('clinging or unblocked flight precedes floor pit descriptions', async () => {
    const state = await hidden(PM_ROCK_PIERCER);
    state.u.utrap = 3; // Nonzero timeout, TT_PIT is the discriminant.
    state.u.utraptype = TT_PIT;
    assert.equal(line(state), ' You are hiding on the ceiling.');
    state.youmonst.data = state.mons[PM_TRAPPER];
    state.u.uprops[FLYING].intrinsic = 1;
    assert.equal(line(state), ' You are hiding on the ceiling.');
    state.u.uprops[FLYING].blocked = 1;
    assert.equal(line(state), ' You are hiding in a pit.');
});

test('pit naming checks trap type; ordinary hiding uses the surface', async () => {
    const state = await hidden();
    assert.equal(line(state), ' You are hiding on the floor.');
    state.u.utrap = 3;
    state.u.utraptype = TT_PIT;
    state.level.traps = [{tx:10,ty:8,ttyp:SPIKED_PIT}];
    assert.equal(line(state), ' You are hiding in a spiked pit.');
    state.level.traps[0].ttyp = PIT;
    assert.equal(line(state), ' You are hiding in a pit.');
    state.level.traps = []; // Missing physical trap still uses ordinary pit wording.
    assert.equal(line(state), ' You are hiding in a pit.');
    state.u.utraptype = 0; // A non-pit trap must use the terrain branch.
    assert.equal(line(state), ' You are hiding on the floor.');
    state.u.utrap = 0;
    assert.equal(line(state), ' You are hiding on the floor.');
    state.u.uundetected = 0;
    assert.equal(line(state), ' You are hiding.'); // Defensive C fallback.
});

test('ordinary messaging returns the awaited owner promise and variant wording', async () => {
    const state = await hidden();
    assert.equal(typeof insight.youhiding, 'function');
    const messages = [];
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const result = insight.youhiding(false, 0, state, [], {message(text) {
        messages.push(text);
        return pending;
    }});
    assert.equal(result, pending, 'caller waits for the ordinary live message');
    assert.deepEqual(messages, ['You are now hiding on the floor.']);
    release();
    await result;
    await insight.youhiding(false, 1, state, [], {message(text) { messages.push(text); }});
    assert.equal(messages[1], 'You are already hiding on the floor.');
});

// pager.c waterbody_name() delegates Hallucination liquid wording to hliquid;
// youhiding must consume that returned name once, without a core-RNG draw.
test('eel hiding preserves the liquid naming owner display-RNG contract', async () => {
    const state=await hidden(PM_GIANT_EEL);
    state.level.at(10,8).typ=POOL;
    state.u.uprops[HALLUC].intrinsic=1;
    const coreBefore=structuredClone(state.coreCtx);
    const calls=[];
    const env={displayRandom(bound) {calls.push(bound);return 0;}};
    assert.equal(line(state,0,env),' You are hiding in the pool of '+HLIQUIDS[0]+'.');
    assert.deepEqual(calls,[HLIQUIDS.length+1],'one hliquid draw including the preferred water choice');
    assert.deepEqual(state.coreCtx,coreBefore);
    state.program_state.gameover=true; // waterbody_name suppresses hallucinatory liquids after death.
    assert.equal(line(state,2,env),' You were hiding in the pool of water.');
    assert.equal(calls.length,1,'no display draw after the source gameover suppression');
});
