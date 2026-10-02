import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    isok,
    SLEEP_RES,
    STRAT_WAITFORU,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_SLEE,
    AT_BITE,
    PM_HOMUNCULUS,
    PM_ORC,
} from '../js/monsters.js';
import { mhitm_ad_slee, mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const DATETIME = '20320415093000';
const RC = [
    'OPTIONS=name:SleepBranch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame() {
    // This seed and empty move list provide an initialized ordinary state; the
    // branch tests inject and assert every combat draw separately.
    await runSegment({
        seed: 710279, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scriptedDraws(plan) {
    const calls = [];
    let index = 0;
    function take(method, bound) {
        const next = plan[index++];
        assert.ok(next, `unexpected ${method}(${bound})`);
        assert.deepEqual(next.slice(0, 2), [method, bound]);
        calls.push(`${method}(${bound})=${next[2]}`);
        return next[2];
    }
    return {
        calls,
        random: {
            rn2: (bound) => take('rn2', bound),
            rnd: (bound) => take('rnd', bound),
        },
        assertFinished() {
            assert.equal(index, plan.length, 'all planned C draws were consumed');
        },
    };
}

function addMonster(state, species, id, extra = {}) {
    // The level can place a generated monster on any fixed adjacent square.
    const offsets = [
        [1, 0], [-1, 0], [0, -1], [0, 1],
        [1, -1], [1, 1], [-1, -1], [-1, 1],
    ];
    const [x, y] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([mx, my]) => isok(mx, my) && !state.level.monsters[mx][my]);
    assert.ok(Number.isInteger(x) && Number.isInteger(y),
        'the initialized fixture has a free adjacent monster square');
    // The synthetic IDs distinguish test monsters from generated level actors.
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx: x,
        my: y,
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
    place_monster(monster, x, y, state);
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

test('mhitm_ad_slee matches the complete C helper and AD_SLEE dispatcher', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_slee\([\s\S]*?\n\}\n\n(?=\/\* slime \*\/)/u,
    )?.[0];
    assert.ok(source, 'uhitm.c defines the whole selected helper');
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?!mdef->msleeping\s*&&\s*!mhitm_mgc_atk_negated\(magr, mdef, FALSE\)\s*&&\s*sleep_monst\(mdef, rnd\(10\), -1\)/u);
    assert.match(source,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?gm\.multi >= 0 && !rn2\(5\)\s*&&\s*!mhitm_mgc_atk_negated\(magr, mdef, TRUE\)[\s\S]*?Sleep_resistance[\s\S]*?monstseesu\(M_SEEN_SLEEP\)[\s\S]*?fall_asleep\(-rnd\(10\), TRUE\)/u);
    assert.match(source,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?!mdef->msleeping && sleep_monst\(mdef, rnd\(10\), -1\)\s*&&\s*sleep_monst\(mdef, rnd\(10\), -1\)[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU;[\s\S]*?slept_monst\(mdef\)/u);
    assert.match(UHITM_C,
        /case AD_SLEE:\s*mhitm_ad_slee\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);

    const js = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');
    assert.match(js,
        /case AD_SLEE:\s*await mhitm_ad_slee\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('hero sleep attack uses magic cancellation, duration, and sleep result in order',
    async () => {
        const state = await startGame();
        // This adjacent orc survives the synthetic 1d1 test blow so the sleep
        // effect, rather than monster death, is the observed source branch.
        const defender = addMonster(state, PM_ORC, 97101);
        const draws = scriptedDraws([
            ['rn2', 10, 9], // MC=0: 9 passes the C magic-cancellation test.
            ['rnd', 10, 5], // The C rnd(10) sleep duration freezes five turns.
        ]);
        const events = [];
        await mhitm_adtyping(
            state.youmonst,
            { aatyp: AT_BITE, adtyp: AD_SLEE },
            defender,
            { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
            state,
            attackEnvironment(draws.random, events),
        );

        draws.assertFinished();
        assert.deepEqual(draws.calls, ['rn2(10)=9', 'rnd(10)=5']);
        assert.equal(defender.mcanmove, false);
        assert.equal(defender.mfrozen, 5);
        assert.equal(defender.meating, 0);
        assert.equal(events.length, 1);
        assert.match(events[0], /is put to sleep by you!/u);
    });

test('monster sleep attack hits first, then applies the positive sleep gate',
    async () => {
        const state = await startGame();
        // The homunculus species provides the source AT_BITE/AD_SLEE attack.
        const attacker = addMonster(state, PM_HOMUNCULUS, 97102);
        const draws = scriptedDraws([
            ['rn2', 5, 0], // A zero result passes C's one-in-five sleep gate.
            ['rn2', 10, 9], // MC=0: the follow-up cancellation roll passes.
            ['rnd', 10, 4], // C passes negative rnd(10) to fall_asleep.
        ]);
        const events = [];
        await mhitm_adtyping(
            attacker,
            { aatyp: AT_BITE, adtyp: AD_SLEE },
            state.youmonst,
            { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
            state,
            attackEnvironment(draws.random, events),
        );

        draws.assertFinished();
        assert.deepEqual(draws.calls, [
            'rn2(5)=0', 'rn2(10)=9', 'rnd(10)=4',
        ]);
        assert.ok(state.multi < 0);
        assert.equal(state.u.usleep, state.moves);
        assert.equal(state.nomovemsg, 'You wake up.');
        assert.match(events[0], /homunculus bites!/u);
        assert.match(events[1], /put to sleep by the homunculus/u);
    });

test('monster-pair sleep calls short-circuit after the first freezing result',
    async () => {
        const state = await startGame();
        // Both live monsters enter the C monster-to-monster dispatcher arm.
        const attacker = addMonster(state, PM_HOMUNCULUS, 97103);
        const defender = addMonster(state, PM_ORC, 97104);
        state.gv.vis = false; // C suppresses the visible pair message here.
        const draws = scriptedDraws([
            ['rnd', 10, 4], // Positive first duration freezes the defender.
            ['rnd', 10, 7], // C still draws before sleep_monst sees immobility.
        ]);
        const events = [];
        await mhitm_ad_slee(
            attacker,
            { aatyp: AT_BITE, adtyp: AD_SLEE },
            defender,
            { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
            state,
            attackEnvironment(draws.random, events),
        );

        draws.assertFinished();
        assert.deepEqual(draws.calls, ['rnd(10)=4', 'rnd(10)=7']);
        assert.equal(defender.mcanmove, false);
        assert.equal(defender.mfrozen, 4);
        assert.equal(defender.mstrategy, STRAT_WAITFORU);
        assert.deepEqual(events, []);
    });

test('a resisting first monster-pair sleep skips the second duration draw',
    async () => {
        const state = await startGame();
        // SLEEP_RES is source property 3, so bit 2 of mintrinsics exercises
        // mhitm.c sleep_monst's first resisting short-circuit.
        const attacker = addMonster(state, PM_HOMUNCULUS, 97105);
        const defender = addMonster(
            state, PM_ORC, 97106,
            { mintrinsics: 1 << (SLEEP_RES - 1) },
        );
        const draws = scriptedDraws([
            ['rnd', 10, 6], // C obtains one duration before sleep resistance.
        ]);
        const events = [];
        await mhitm_ad_slee(
            attacker,
            { aatyp: AT_BITE, adtyp: AD_SLEE },
            defender,
            { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
            state,
            attackEnvironment(draws.random, events),
        );

        draws.assertFinished();
        assert.deepEqual(draws.calls, ['rnd(10)=6']);
        assert.equal(defender.mcanmove, true);
        assert.equal(defender.mfrozen, 0);
        assert.deepEqual(events, []);
    });

test('monster sleep resistance stops before a duration draw',
    async () => {
        const state = await startGame();
        // The C Sleep_resistance macro accepts either property source.
        state.u.uprops[SLEEP_RES].intrinsic = 1;
        const attacker = addMonster(state, PM_HOMUNCULUS, 97107);
        const priorMulti = state.multi;
        const priorSleep = state.u.usleep;
        const draws = scriptedDraws([
            ['rn2', 5, 0], // The source's chance gate succeeds.
            ['rn2', 10, 9], // Magic cancellation does not block the effect.
        ]);
        const events = [];
        await mhitm_ad_slee(
            attacker,
            { aatyp: AT_BITE, adtyp: AD_SLEE },
            state.youmonst,
            { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
            state,
            attackEnvironment(draws.random, events),
        );

        draws.assertFinished();
        assert.deepEqual(draws.calls, ['rn2(5)=0', 'rn2(10)=9']);
        assert.equal(state.multi, priorMulti);
        assert.equal(state.u.usleep, priorSleep);
        assert.equal(events.length, 1);
        assert.match(events[0], /homunculus bites!/u);
    });
