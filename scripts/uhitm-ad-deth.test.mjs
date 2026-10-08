import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ANTIMAGIC, STRAT_WAITFORU } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_DETH, AT_TUCH, PM_ORC, PM_WRAITH } from '../js/monsters.js';
import { mhitm_ad_deth, mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const UHTIM_JS = readFileSync(
    new URL('../js/uhitm.js', import.meta.url), 'utf8',
);
const MHITU_JS = readFileSync(
    new URL('../js/mhitu.js', import.meta.url), 'utf8',
);
const DATETIME = '20330214091500'; // A fixed date keeps the independent fixture stable.
const RC = [
    'OPTIONS=name:DeathTouch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

function sourceBody(source, name) {
    const signature = source.indexOf(`${name}(`);
    assert.notEqual(signature, -1, `${name} has a C definition`);
    const open = source.indexOf('{', signature);
    assert.notEqual(open, -1, `${name} has a function body`);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0)
            return source.slice(signature, i + 1);
    }
    assert.fail(`${name} C body closes`);
}

async function startGame(seed) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.unported?.clear();
    return game;
}

function addMonster(state, species, id, dx, dy, overrides = {}) {
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mhp: 40,
        mhpmax: 40,
        m_lev: 6,
        mcanmove: true,
        mfrozen: 0,
        meating: 0,
        mstrategy: STRAT_WAITFORU,
        mcan: false,
        mcansee: true,
        ...overrides,
    });
    place_monster(monster, monster.mx, monster.my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackData() {
    // AT_TUCH and AD_DETH are the source Death touch dispatched by uhitm.c.
    return { aatyp: AT_TUCH, adtyp: AD_DETH, damn: 1, damd: 1 };
}

function damageData(damage) {
    // The caller supplies this already-rolled damage; the helper only adjusts it.
    return { damage, specialdmg: 0, done: false, hitflags: 0, permdmg: 0 };
}

function randomPlan(plan) {
    const calls = [];
    let index = 0;
    function take(kind, args) {
        const item = plan[index++];
        assert.ok(item, `unexpected ${kind}(${args.join(',')})`);
        assert.equal(item.kind, kind);
        assert.deepEqual(item.args, args);
        calls.push(`${kind}(${args.join(',')})=${item.result}`);
        return item.result;
    }
    return {
        calls,
        random: {
            rn2: (bound) => take('rn2', [bound]),
            rnd: (bound) => take('rnd', [bound]),
            d: (count, sides) => take('d', [count, sides]),
        },
        assertFinished() {
            assert.equal(index, plan.length, 'the helper uses every source-ordered draw');
        },
    };
}

function draw(kind, args, result) {
    // Each row pins one C RNG call, its exact argument, and returned value.
    return { kind, args, result };
}

function attackEnvironment(random, messages) {
    return {
        random,
        message: async (line) => { messages.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

test('mhitm_ad_deth preserves whole C branch order and production dispatch', () => {
    const body = sourceBody(UHITM_C, 'mhitm_ad_deth');
    const cachedDefender = body.indexOf('struct permonst *pd = mdef->data;');
    const firstBranch = body.indexOf('if (magr == &gy.youmonst)');
    const heroBranch = body.indexOf('else if (mdef == &gy.youmonst)');
    const message = body.indexOf('pline_mon(magr');
    const undead = body.indexOf('if (is_undead(pd))');
    const chance = body.indexOf('switch (rn2(20))');
    const touch = body.indexOf('touch_of_death(magr)');
    const shield = body.indexOf('shieldeff(u.ux, u.uy)');
    const delegation = body.indexOf('mhitm_ad_drli(magr, mattk, mdef, mhm);');
    assert.ok(cachedDefender >= 0 && cachedDefender < firstBranch
        && firstBranch < heroBranch && heroBranch < message
        && message < undead && undead < chance && chance < touch
        && touch < shield && shield < delegation,
    'the cached target and source branch/callee order are retained');
    assert.match(body,
        /mhm->damage = \(mhm->damage \+ 1\) \/ 2;[\s\S]*?return;/u);
    assert.match(body,
        /case 19:[\s\S]*?case 17:[\s\S]*?if \(!Antimagic\)\s*\{\s*touch_of_death\(magr\);\s*mhm->damage = 0;\s*return;/u);
    assert.match(body,
        /You_feel\("your life force draining away\.\.\."\);\s*mhm->permdmg = 1;[^\n]*\s*return;/u);
    assert.match(body,
        /case 4:[\s\S]*?case 0:[\s\S]*?if \(Antimagic\)\s*shieldeff\(u\.ux, u\.uy\);\s*pline\("Lucky for you, it didn't work!"\);/u);
    assert.match(body,
        /if \(is_undead\(pd\) && mhm->damage > 1\)\s*mhm->damage = rnd\(mhm->damage \/ 2\);[\s\S]*?mhitm_ad_drli\(magr, mattk, mdef, mhm\);/u);
    assert.match(UHITM_C,
        /case AD_DETH:\s*mhitm_ad_deth\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /if \(mhm\.permdmg\)[\s\S]*?mhm\.permdmg = rn2\(mhm\.damage \/ 2 \+ 1\);[\s\S]*?mdamageu\(mtmp, mhm\.damage\);/u);
    assert.match(MHITU_JS,
        /if \(mhm\.permdmg\)\s*\{[\s\S]*?mhm\.permdmg = random\.rn2\([\s\S]*?await mdamageu\(mtmp, mhm\.damage, state, env\);/u);
    assert.match(UHTIM_JS,
        /case AD_DETH:\s*await mhitm_ad_deth\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('monster-to-hero dispatch sets permanent damage on the ordinary Death touch', async () => {
    // This seed only initializes an independent live fixture; the scripted roll selects C's default 5..16 arm.
    await startGame(9400101);
    game.gv.vis = false;
    const attacker = addMonster(game, PM_ORC, 940101, 1, 0);
    const mhm = damageData(7); // C leaves the ordinary hit damage intact for permanent damage.
    const messages = [];
    const draws = randomPlan([draw('rn2', [20], 6)]); // C rn2(20)=6 enters default case 5..16.

    await mhitm_adtyping(
        attacker, attackData(), game.youmonst, mhm, game,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(20)=6']);
    assert.equal(mhm.damage, 7, 'C applies the ordinary hit damage after mhm.permdmg');
    assert.equal(mhm.permdmg, 1, 'the completed helper marks hitmu permanent damage');
    assert.equal(game.unported.has('mcastu.c touch_of_death'), false,
        'C does not enter its high-roll touch_of_death gap on roll 6');
    assert.match(messages[0], /reaches out with its deadly touch\.$/u);
    assert.deepEqual(messages.slice(1), ['You feel your life force draining away...']);
});

test('undead hero defender uses the cached form and returns before random draws', async () => {
    // This seed initializes the fixture; the wraith form selects C's early undead return.
    await startGame(9400102);
    game.youmonst.data = game.mons[PM_WRAITH];
    const attacker = addMonster(game, PM_ORC, 940102, 1, 0);
    const mhm = damageData(6); // C computes (damage + 1) / 2 with integer arithmetic.
    const messages = [];
    const noDraw = () => assert.fail('C returns before rn2(20) for an undead defender');
    let changed = false;
    const env = attackEnvironment({ rn2: noDraw, rnd: noDraw }, messages);
    env.message = async (line) => {
        messages.push(line);
        if (!changed) {
            changed = true;
            game.youmonst.data = game.mons[PM_ORC];
        }
    };

    await mhitm_ad_deth(attacker, attackData(), game.youmonst, mhm, game, env);

    assert.deepEqual(messages.slice(1), ['Was that the touch of death?']);
    assert.equal(mhm.damage, 3, 'C uses cached wraith data after output yields');
    assert.equal(mhm.permdmg, 0, 'the undead return does not mark permanent damage');
});

test('the antimagic upper roll falls through to permanent damage', async () => {
    // This seed initializes the fixture; the property and roll select C's Antimagic fallthrough.
    await startGame(9400103);
    game.gv.vis = false;
    game.u.uprops[ANTIMAGIC].extrinsic = 1; // C Antimagic reads either intrinsic or extrinsic property.
    const attacker = addMonster(game, PM_ORC, 940103, 1, 0);
    const mhm = damageData(4); // C preserves the already-rolled base damage.
    const messages = [];
    const draws = randomPlan([draw('rn2', [20], 18)]); // C's 17..19 arm falls through when Antimagic is present.

    await mhitm_ad_deth(
        attacker, attackData(), game.youmonst, mhm, game,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(20)=18']);
    assert.equal(mhm.permdmg, 1);
    assert.equal(mhm.damage, 4);
    assert.equal(game.unported.has('mcastu.c touch_of_death'), false,
        'Antimagic skips C touch_of_death before its fallthrough');
});

test('the antimagic low roll shows its shield and clears the hit damage', async () => {
    // This seed initializes the fixture; the property and roll select C cases 0..4.
    await startGame(9400106);
    game.flags.sparkle = false; // C's shieldeff obeys sparkle; disabling frames keeps this assertion bounded.
    game.u.uprops[ANTIMAGIC].intrinsic = 0; // The test isolates the extrinsic Antimagic property.
    game.u.uprops[ANTIMAGIC].extrinsic = 1; // C reaches shieldeff only when Antimagic is present.
    const attacker = addMonster(game, PM_ORC, 940106, 1, 0);
    const mhm = damageData(5); // The low-roll source branch clears ordinary damage.
    const messages = [];
    const draws = randomPlan([draw('rn2', [20], 2)]); // C case 0..4 consumes one rn2(20).

    await mhitm_ad_deth(
        attacker, attackData(), game.youmonst, mhm, game,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(20)=2']);
    assert.equal(mhm.damage, 0);
    assert.equal(mhm.permdmg, 0);
    assert.deepEqual(messages.slice(1), ["Lucky for you, it didn't work!"]);
});

test('the high roll without antimagic applies canonical Death touch and clears damage', async () => {
    // This seed initializes the fixture; roll 17 selects the C void touch_of_death boundary.
    await startGame(9400104);
    game.gv.vis = false;
    game.u.uprops[ANTIMAGIC].intrinsic = 0; // C's no-Antimagic high roll requires both properties to be absent.
    game.u.uprops[ANTIMAGIC].extrinsic = 0; // The Wizard fixture normally starts with an Antimagic source.
    const attacker = addMonster(game, PM_ORC, 940104, 1, 0);
    const mhm = damageData(9); // The C source clears only this hit's damage after the void call.
    const messages = [];
    // HP200 exceeds the37-point max-HP drain from source50+d(8,6)=74;
    // this pins olduhp correction after setuhpmax clamps current HP.
    game.u.uhp = game.u.uhpmax = 200;
    const draws = randomPlan([draw('rn2', [20], 17), draw('d', [8, 6], 24)]);

    await mhitm_ad_deth(
        attacker, attackData(), game.youmonst, mhm, game,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rn2(20)=17', 'd(8,6)=24']);
    assert.equal(mhm.damage, 0);
    assert.equal(mhm.permdmg, 0);
    assert.equal(game.u.uhpmax, 163); // 200 minus integer-half drain37.
    assert.equal(game.u.uhp, 126); // Total loss74, including the max-HP clamp.
    assert.equal(messages.at(-1), 'You feel drained...');
    assert.equal(game.killer.name, '', 'source clears the death reason after survival');
    assert.equal(game.unported.has('mcastu.c touch_of_death'), false,
        'the source call now reaches its canonical owner');
});

test('monster-pair Death delegation halves undead damage then applies direct life drain', async () => {
    // This seed initializes the fixture; an undead target selects the source rnd(damage / 2) case.
    await startGame(9400105);
    game.gv.vis = false;
    const attacker = addMonster(game, PM_ORC, 940105, 1, 0);
    const defender = addMonster(game, PM_WRAITH, 940106, 0, 1,
        { mhp: 30, mhpmax: 40, m_lev: 6 });
    const mhm = damageData(10); // C passes this hit damage to rnd(10 / 2).
    const draws = randomPlan([draw('rnd', [5], 3)]); // C target-undead rule consumes one rnd(5).
    const messages = [];

    await mhitm_adtyping(
        attacker, attackData(), defender, mhm, game,
        attackEnvironment(draws.random, messages),
    );

    draws.assertFinished();
    assert.deepEqual(draws.calls, ['rnd(5)=3']);
    assert.equal(mhm.damage, 3, 'C passes the halved damage through the AD_DRLI Death arm');
    assert.equal(defender.mhpmax, 37, 'the existing whole AD_DRLI helper applies max-HP loss');
    assert.equal(defender.m_lev, 5, 'the delegated Death drain lowers monster level');
});

test('monster-pair living target delegates Death damage without the undead draw', async () => {
    // This seed initializes the fixture; a living target skips C's undead-only rnd.
    await startGame(9400107);
    game.gv.vis = false;
    const attacker = addMonster(game, PM_ORC, 940107, 1, 0);
    const defender = addMonster(game, PM_ORC, 940108, 0, 1,
        { mhp: 30, mhpmax: 40, m_lev: 6 });
    const mhm = damageData(4); // C passes the original damage directly to AD_DRLI.
    const noDraw = () => assert.fail('C has no AD_DETH rnd call for a living target');

    await mhitm_adtyping(
        attacker, attackData(), defender, mhm, game,
        attackEnvironment({ rn2: noDraw, rnd: noDraw }, []),
    );

    assert.equal(mhm.damage, 4, 'the existing Death drain retains caller damage');
    assert.equal(defender.mhpmax, 36, 'the AD_DRLI owner applies the direct max-HP loss');
    assert.equal(defender.m_lev, 5, 'the delegated Death drain lowers monster level');
});
