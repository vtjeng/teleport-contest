import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FAST, MFAST, MSLOW, STRAT_WAITFORU } from '../js/const.js';
import { isok } from '../js/cmd_isok.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { getRngLog } from '../js/rng.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_SLOW,
    AT_TUCH,
    PM_ORC,
    PM_SKELETON,
} from '../js/monsters.js';
import { mhitm_ad_slow, mhitm_adtyping } from '../js/uhitm.js';
import { u_slow_down } from '../js/mhitu.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const ZAP_C = readFileSync(
    new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
);
const MONSTERS_H = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const YOUPROP_H = readFileSync(
    new URL('../nethack-c/upstream/include/youprop.h', import.meta.url), 'utf8',
);
const DATETIME = '20330719091500';
const RC = [
    'OPTIONS=name:SlowBranch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame(seed) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scriptedDraws(plan) {
    const calls = [];
    let index = 0;
    const rn2 = (bound) => {
        const next = plan[index++];
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(next[0], bound);
        calls.push(`rn2(${bound})=${next[1]}`);
        return next[1];
    };
    return {
        calls,
        random: { rn2 },
        assertFinished() {
            assert.equal(index, plan.length, 'all planned C draws were consumed');
        },
    };
}

function addMonster(state, species, id, extra = {}) {
    const offsets = [
        [1, 0], [-1, 0], [0, -1], [0, 1],
        [1, -1], [1, 1], [-1, -1], [-1, 1],
    ];
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    assert.ok(Number.isInteger(mx) && Number.isInteger(my),
        'the initialized fixture has an adjacent free square');
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx,
        my,
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mfrozen: 0,
        meating: 0,
        mstrategy: STRAT_WAITFORU,
        mcan: false,
        mcansee: true,
        ...extra,
    });
    place_monster(monster, mx, my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackEnvironment(random, events) {
    return {
        random,
        message: async (line) => { events.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

function mhm() {
    return { damage: 1, specialdmg: 0, done: false, hitflags: 0 };
}

test('mhitm_ad_slow matches the whole C function, three dispatch routes, and HFast macro', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_slow\([\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(source, 'uhitm.c defines the complete selected helper');
    assert.match(source,
        /boolean negated = mhitm_mgc_atk_negated\(magr, mdef, FALSE\);[\s\S]*?if \(defended\(mdef, AD_SLOW\)\)\s*return;/u);
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mon_adjust_speed\(mdef, -1, \(struct obj \*\) 0\);[\s\S]*?mdef->mspeed != oldspeed && canseemon\(mdef\)/u);
    assert.match(source,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?!negated && HFast && !rn2\(4\)[\s\S]*?u_slow_down\(\);/u);
    assert.match(source,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?mon_adjust_speed\(mdef, -1, \(struct obj \*\) 0\);[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU;[\s\S]*?gv\.vis && canspotmon\(mdef\)/u);
    assert.match(UHITM_C,
        /case AD_SLOW:\s*mhitm_ad_slow\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    assert.match(YOUPROP_H, /#define HFast u\.uprops\[FAST\]\.intrinsic/u);
    assert.match(YOUPROP_H, /#define Fast \(HFast \|\| EFast\)/u);
    const slowDownSource = MHITU_C.match(
        /void\s+u_slow_down\(void\)[\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(slowDownSource, 'mhitu.c defines u_slow_down');
    assert.match(slowDownSource,
        /HFast = 0L;[\s\S]*?if \(!Fast\)[\s\S]*?You\("slow down\."\);[\s\S]*?Your\("quickness feels less natural\."\);[\s\S]*?exercise\(A_DEX, FALSE\);/u);
    assert.match(ZAP_C,
        /case WAN_SLOW_MONSTER:[\s\S]*?case SPE_SLOW_MONSTER:[\s\S]*?HFast & \(TIMEOUT \| INTRINSIC\)[\s\S]*?u_slow_down\(\);/u);
    const zapJs = readFileSync(new URL('../js/zap.js', import.meta.url), 'utf8');
    assert.match(zapJs,
        /export async function zapyourself\([\s\S]*?case WAN_SLOW_MONSTER:[\s\S]*?await u_slow_down\(state\);/u);
    assert.match(MHITU_C,
        /#ifdef PM_BEHOLDER \/\* work in progress \*\/[\s\S]*?case AD_SLOW:[\s\S]*?u_slow_down\(\);[\s\S]*?#endif \/\* BEHOLDER \*\//u);
    assert.match(MONSTERS_H,
        /#if 0 \/\* not yet implemented \*\/[\s\S]*?MON\(NAM\("beholder"\)/u);
    const slowDownJs = readFileSync(new URL('../js/mhitu.js', import.meta.url), 'utf8');
    assert.match(slowDownJs,
        /export async function u_slow_down\([\s\S]*?random = \{ rn2 \}[\s\S]*?exercise\(A_DEX, false, state, random\);/u);
    const js = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');
    assert.match(js,
        /case AD_SLOW:\s*await mhitm_ad_slow\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('hero AD_SLOW lowers a fast monster after the cancellation draw', async () => {
    const state = await startGame(170912);
    const defender = addMonster(state, PM_ORC, 98101, {
        mspeed: MFAST,
        permspeed: MFAST,
        mfrozen: 1,
    });
    const draws = scriptedDraws([[10, 9]]);
    const events = [];

    await mhitm_adtyping(
        state.youmonst,
        { aatyp: AT_TUCH, adtyp: AD_SLOW },
        defender,
        mhm(),
        state,
        attackEnvironment(draws.random, events),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(10)=9']);
    assert.equal(defender.permspeed, 0);
    assert.equal(defender.mspeed, 0);
});

test('monster AD_SLOW slows an intrinsically fast hero only after the one-in-four draw', async () => {
    const state = await startGame(170913);
    const attacker = addMonster(state, PM_SKELETON, 98102);
    state.u.uprops[FAST].intrinsic = 1;
    state.u.uprops[FAST].extrinsic = 0;
    // The real slow-down message first dismisses the startup line still
    // pending after an empty-move runSegment setup.
    state.nhDisplay.pushKey(13);
    state.nhDisplay.pushKey(13);
    const draws = scriptedDraws([[10, 9], [4, 0], [2, 0]]);
    const events = [];

    await mhitm_adtyping(
        attacker,
        { aatyp: AT_TUCH, adtyp: AD_SLOW },
        state.youmonst,
        mhm(),
        state,
        attackEnvironment(draws.random, events),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(10)=9', 'rn2(4)=0', 'rn2(2)=0']);
    assert.equal(state.u.uprops[FAST].intrinsic, 0);
    assert.equal(state.u.uprops[FAST].extrinsic, 0);
    assert.deepEqual(events, [
        'The skeleton touches you!',
        'You slow down.',
    ]);
});

test('extrinsic Fast alone does not enter the HFast draw or slow-down branch', async () => {
    const state = await startGame(170914);
    const attacker = addMonster(state, PM_SKELETON, 98103);
    state.u.uprops[FAST].intrinsic = 0;
    state.u.uprops[FAST].extrinsic = 1;
    const draws = scriptedDraws([[10, 9]]);
    const events = [];

    await mhitm_ad_slow(
        attacker,
        { aatyp: AT_TUCH, adtyp: AD_SLOW },
        state.youmonst,
        mhm(),
        state,
        attackEnvironment(draws.random, events),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(10)=9']);
    assert.equal(state.u.uprops[FAST].intrinsic, 0);
    assert.equal(state.u.uprops[FAST].extrinsic, 1);
    assert.equal(events.length, 1);
    assert.match(events[0], /skeleton touches you!/u);
});

test('monster-to-monster AD_SLOW changes speed and clears STRAT_WAITFORU', async () => {
    const state = await startGame(170915);
    const attacker = addMonster(state, PM_SKELETON, 98104);
    const defender = addMonster(state, PM_ORC, 98105, {
        mspeed: 0,
        permspeed: 0,
        mfrozen: 1,
    });
    state.gv.vis = false;
    const draws = scriptedDraws([[10, 9]]);
    const events = [];

    await mhitm_adtyping(
        attacker,
        { aatyp: AT_TUCH, adtyp: AD_SLOW },
        defender,
        mhm(),
        state,
        attackEnvironment(draws.random, events),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(10)=9']);
    assert.equal(defender.permspeed, MSLOW);
    assert.equal(defender.mspeed, MSLOW);
    assert.equal(defender.mstrategy & STRAT_WAITFORU, 0);
});


test('planned monster AD_SLOW routes u_slow_down output away from the shared live TTY', async () => {
    // This distinct seed initializes a normal Wizard game; the scripted draws below select the
    // C path through mhitm_mgc_atk_negated and the one-in-four HFast slowdown.
    const state = await startGame(170916);
    const liveAttacker = addMonster(state, PM_SKELETON, 98106);
    state.u.uprops[FAST].intrinsic = 1;
    state.u.uprops[FAST].extrinsic = 0;
    // These keys let a direct ttyPline fallback finish if the regression returns; the seam must
    // leave both queued keys untouched during the planned pass.
    state.nhDisplay.pushKey(13);
    state.nhDisplay.pushKey(13);
    const planned = planningState(state);
    const attacker = planned.level.monlist;
    assert.equal(attacker.m_id, liveAttacker.m_id);
    assert.strictEqual(planned.nhDisplay, state.nhDisplay,
        'planningState shares the display, so output must use the supplied operation');

    const liveDisplay = state.nhDisplay;
    const displayBefore = {
        screen: liveDisplay.serialize(),
        cursor: [liveDisplay.cursorCol, liveDisplay.cursorRow],
        topMessage: liveDisplay.topMessage,
        toplines: liveDisplay.toplines,
        toplin: liveDisplay.toplin,
        messages: [...liveDisplay.messages],
        inputQueueLength: liveDisplay.inputQueueLength,
        waitEpoch: liveDisplay.waitEpoch,
        pending: state._pending_message,
    };
    const liveRngBefore = [...getRngLog()];
    const draws = scriptedDraws([[10, 9], [4, 0], [2, 0]]);
    const events = [];

    await mhitm_ad_slow(
        attacker,
        { aatyp: AT_TUCH, adtyp: AD_SLOW },
        planned.youmonst,
        mhm(),
        planned,
        attackEnvironment(draws.random, events),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(10)=9', 'rn2(4)=0', 'rn2(2)=0']);
    assert.deepEqual(getRngLog(), liveRngBefore,
        'planning uses the cloned random source and does not advance live RNG');
    assert.deepEqual(events, [
        'The skeleton touches you!',
        'You slow down.',
    ]);
    assert.equal(planned.u.uprops[FAST].intrinsic, 0);
    assert.equal(state.u.uprops[FAST].intrinsic, 1,
        'the planning clone owns the cleared intrinsic speed state');
    assert.deepEqual({
        screen: liveDisplay.serialize(),
        cursor: [liveDisplay.cursorCol, liveDisplay.cursorRow],
        topMessage: liveDisplay.topMessage,
        toplines: liveDisplay.toplines,
        toplin: liveDisplay.toplin,
        messages: [...liveDisplay.messages],
        inputQueueLength: liveDisplay.inputQueueLength,
        waitEpoch: liveDisplay.waitEpoch,
        pending: state._pending_message,
    }, displayBefore);
});


test('u_slow_down retains its live ttyPline default for self-zap callers', async () => {
    const state = await startGame(170917);
    state.u.uprops[FAST].intrinsic = 1;
    state.u.uprops[FAST].extrinsic = 0;
    // Existing startup output may need acknowledgment before the live line is
    // replaced. These keys are consumed only by that real ttyPline path.
    state.nhDisplay.pushKey(13);
    state.nhDisplay.pushKey(13);
    const bounds = [];

    await u_slow_down(state, {
        random: {
            rn2(bound) {
                bounds.push(bound);
                return bound - 1;
            },
        },
    });

    assert.deepEqual(bounds, [2]);
    assert.equal(state.u.uprops[FAST].intrinsic, 0);
    assert.equal(state._pending_message, 'You slow down.');
});


test('u_slow_down preserves an extrinsic speed source and uses its source message', async () => {
    const state = await startGame(170918);
    state.u.uprops[FAST].intrinsic = 1;
    state.u.uprops[FAST].extrinsic = 1;
    const bounds = [];
    const messages = [];

    await u_slow_down(state, {
        message: async (line) => { messages.push(line); },
        random: {
            rn2(bound) {
                bounds.push(bound);
                return bound - 1;
            },
        },
    });

    assert.deepEqual(bounds, [2]);
    assert.equal(state.u.uprops[FAST].intrinsic, 0);
    assert.equal(state.u.uprops[FAST].extrinsic, 1);
    assert.deepEqual(messages, ['Your quickness feels less natural.']);
});
