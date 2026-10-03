import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DRAIN_RES,
    STRAT_WAITFORU,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_DETH, AD_DRLI, AT_BITE, AT_TUCH, PM_ORC, PM_WRAITH } from '../js/monsters.js';
import { mhitm_ad_drli, mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const DATETIME = '20330112094500'; // Stable independent date for the fixture game.
const RC = [
    'OPTIONS=name:DrainBranch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame(seed) {
    // Each test uses a different fixed seed so accidental shared state is visible.
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function scriptedRandom(plan) {
    const calls = [];
    let index = 0;
    function take(kind, args) {
        const next = plan[index++];
        assert.ok(next, `unexpected ${kind}(${args.join(',')})`);
        assert.equal(next.kind, kind);
        assert.deepEqual(next.args, args);
        calls.push(`${kind}(${args.join(',')})=${next.result}`);
        return next.result;
    }
    return {
        calls,
        random: {
            rn2: (bound) => take('rn2', [bound]),
            d: (count, sides) => take('d', [count, sides]),
        },
        assertFinished() {
            assert.equal(index, plan.length, 'all source-ordered draws were used');
        },
    };
}

function draw(kind, args, result) {
    return { kind, args, result };
}

// Fixture IDs are unique synthetic handles, not monster-state inputs.
function addMonster(state, species, id, offsets, extra = {}) {
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => !state.level.monsters[x]?.[y]);
    assert.ok(Number.isInteger(mx) && Number.isInteger(my),
        'the initialized map has a free adjacent monster square');
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx,
        my,
        mhp: 40,
        mhpmax: 40,
        m_lev: 6, // The defender survives a maximum scripted drain.

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

function attackEnvironment(random, messages) {
    return {
        random,
        message: async (line) => { messages.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

function attackData(adtyp = AD_DRLI, aatyp = AT_BITE) {
    return { adtyp, aatyp, damn: 1, damd: 1 };
}

function damageData(damage = 3) {
    return { damage, specialdmg: 0, done: false, hitflags: 0 };
}

test('mhitm_ad_drli matches its whole C function and all production dispatch directions', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_drli\([\s\S]*?\n\}/u,
    )?.[0];
    assert.ok(source, 'uhitm.c defines the complete level-drain helper');
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?!rn2\(3\)\s*&& !\(resists_drli\(mdef\) \|\| defended\(mdef, AD_DRLI\)\)\s*&& !mhitm_mgc_atk_negated\(magr, mdef, TRUE\)/u);
    assert.match(source,
        /mhm->damage = d\(2, 6\);[\s\S]*?mdef->mhpmax - mhm->damage > \(int\) mdef->m_lev[\s\S]*?mdef->mhp -= mhm->damage;[\s\S]*?DEADMONSTER\(mdef\) \|\| !mdef->m_lev[\s\S]*?xkilled\(mdef, XKILL_NOMSG\);[\s\S]*?mhm->damage = 0;/u);
    assert.match(source,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?!rn2\(3\) && !Drain_resistance\s*&& !mhitm_mgc_atk_negated\(magr, mdef, TRUE\)[\s\S]*?losexp\("life drainage"\);/u);
    assert.match(source,
        /boolean is_death = \(mattk->adtyp == AD_DETH\);[\s\S]*?if \(is_death\s*\|\| \(!rn2\(3\)[\s\S]*?if \(!is_death\)[\s\S]*?mdef->mhpmax - mhm->damage[\s\S]*?if \(mdef->m_lev == 0\)[\s\S]*?mhm->damage = mdef->mhp;/u);
    assert.match(UHITM_C,
        /case AD_DRLI:\s*mhitm_ad_drli\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    assert.match(UHITM_C,
        /mhitm_ad_drli\(magr, mattk, mdef, mhm\);/u);
    const js = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');
    assert.match(js,
        /case AD_DRLI:\s*await mhitm_ad_drli\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('hero-to-monster drain applies damage once, clamps max HP, and lowers level', async () => {
    const state = await startGame(910331);
    const defender = addMonster(state, PM_ORC, 99201, [[1, 0]]);
    defender.mhp = 34; // A living 6th-level orc survives the scripted four damage.
    const draws = scriptedRandom([
        draw('rn2', [3], 0), // C one-in-three drain gate succeeds.
        draw('rn2', [10], 9), // MC=0, so magic cancellation does not negate it.
        draw('d', [2, 6], 4), // A small fixed drain avoids the death/corpse branch.
    ]);
    const messages = [];

    await mhitm_adtyping(
        state.youmonst,
        attackData(),
        defender,
        damageData(),
        state,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls,
        ['rn2(3)=0', 'rn2(10)=9', 'd(2,6)=4']);
    assert.equal(defender.mhp, 30);
    assert.equal(defender.mhpmax, 36);
    assert.equal(defender.m_lev, 5);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /becomes weaker!/u);
});

test('monster-to-hero drain prints the hit first and honours Drain_resistance', async () => {
    const state = await startGame(910332);
    const attacker = addMonster(state, PM_ORC, 99202, [[1, 0]]);
    state.u.uprops[DRAIN_RES].intrinsic = 1; // C Drain_resistance uses either bit.
    const draws = scriptedRandom([
        draw('rn2', [3], 0), // The resistance check follows the one-in-three gate.
    ]);
    const messages = [];

    await mhitm_adtyping(
        attacker,
        attackData(AD_DRLI, AT_TUCH),
        state.youmonst,
        damageData(),
        state,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(3)=0']);
    assert.equal(state.u.ulevel, 1); // The empty-start Wizard is level one.
    assert.equal(state.u.uprops[DRAIN_RES].intrinsic, 1);
    assert.equal(messages[0], 'The orc touches you!');
    assert.equal(messages.length, 1);
});

test('monster-to-monster drain preserves the gate, visible-message guard, and caller damage', async () => {
    const state = await startGame(910333);
    const attacker = addMonster(state, PM_ORC, 99203, [[1, 0]]);
    const defender = addMonster(state, PM_ORC, 99204,
        [[0, -1], [0, 1], [-1, 0]]);
    state.gv.vis = false; // C emits pline_mon only when the level is visible.
    const hit = damageData();
    const draws = scriptedRandom([
        draw('rn2', [3], 0), // The one-in-three gate succeeds.
        draw('rn2', [10], 9), // MC=0 passes the magic-negation test.
        draw('d', [2, 6], 4), // The defender loses one level and max HP.
    ]);
    const messages = [];

    await mhitm_ad_drli(
        attacker,
        attackData(),
        defender,
        hit,
        state,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls,
        ['rn2(3)=0', 'rn2(10)=9', 'd(2,6)=4']);
    assert.equal(defender.mhp, 40); // mdamagem applies mhm.damage after this helper.
    assert.equal(defender.mhpmax, 36);
    assert.equal(defender.m_lev, 5);
    assert.equal(hit.damage, 4);
    assert.deepEqual(messages, []);
});

test('an undead defender short-circuits before magic cancellation', async () => {
    const state = await startGame(910334);
    const attacker = addMonster(state, PM_ORC, 99205, [[1, 0]]);
    const defender = addMonster(state, PM_WRAITH, 99206,
        [[0, -1], [0, 1], [-1, 0]]);
    const hit = damageData();
    const draws = scriptedRandom([
        draw('rn2', [3], 0), // C still rolls its chance before resists_drli.
    ]);

    await mhitm_ad_drli(
        attacker,
        attackData(),
        defender,
        hit,
        state,
        attackEnvironment(draws.random, []),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(3)=0']);
    assert.equal(defender.mhpmax, 40);
    assert.equal(defender.m_lev, 6);
    assert.equal(hit.damage, 3);
});

test('the direct Death branch bypasses the normal gates without a new damage roll', async () => {
    const state = await startGame(910335);
    const attacker = addMonster(state, PM_ORC, 99207, [[1, 0]]);
    const defender = addMonster(state, PM_ORC, 99208,
        [[0, -1], [0, 1], [-1, 0]], { m_lev: 0, mhp: 11, mhpmax: 20 });
    const hit = damageData(4); // Existing damage arrives from the AD_DETH caller.
    const draws = scriptedRandom([]); // Death short-circuits all chance/damage draws.

    await mhitm_ad_drli(
        attacker,
        attackData(AD_DETH),
        defender,
        hit,
        state,
        attackEnvironment(draws.random, []),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, []);
    assert.equal(defender.mhpmax, 16);
    assert.equal(defender.m_lev, 0);
    assert.equal(hit.damage, 11); // The caller is told to apply the remaining HP.
});
