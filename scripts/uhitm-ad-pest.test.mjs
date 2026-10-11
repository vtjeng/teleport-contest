import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CON,
    NEUTRAL,
    SICK,
    SICK_NONVOMITABLE,
    SICK_RES,
    TIMEOUT,
} from '../js/const.js';
import { acurr } from '../js/attrib.js';
import { find_delayed_killer } from '../js/end.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_DISE,
    AD_PEST,
    AT_TUCH,
    PM_GHOUL,
    PM_GREEN_DRAGON,
    PM_JUIBLEX,
    PM_ORC,
    PM_PESTILENCE,
    PM_RED_MOLD,
    S_FUNGUS,
} from '../js/monsters.js';
import { planningState } from '../js/unported_monster_actions.js';
import { diseasemu } from '../js/mhitu.js';
import {
    mhitm_ad_dise,
    mhitm_ad_pest,
    mhitm_adtyping,
} from '../js/uhitm.js';
import { getRngLog } from '../js/rng.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const MONSTERS_H = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url),
    'utf8',
);
const DATETIME = '20330719091500';
const RC = [
    'OPTIONS=name:PestilencePort,role:Wizard,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame(seed = 9300101) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    return game;
}

function addMonster(state, species, id, dx = 1, dy = 0) {
    const monster = newMonster({
        data: state.mons[species],
        m_id: id,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        m_lev: state.mons[species].mlevel,
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mcan: false,
        mcansee: true,
    });
    place_monster(monster, monster.mx, monster.my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function sourceBody(source, name) {
    // A helper can be called before its definition in C, so find the function
    // declaration at the start of a line rather than the first call site.
    const match = new RegExp(`^${name}\\s*\\(`, 'mu').exec(source);
    const signature = match?.index ?? -1;
    assert.notEqual(signature, -1, `${name} has a C definition`);
    const open = source.indexOf('{', signature);
    assert.notEqual(open, -1);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0)
            return source.slice(signature, i + 1);
    }
    assert.fail(`${name} C body closes`);
}

test('diseasemu follows source resistance, timeout and rn1 branches', async () => {
    const source = sourceBody(MHITU_C, 'diseasemu');
    assert.match(source,
        /if\s*\(Sick_resistance\)\s*\{\s*You_feel\("a slight illness\."\);\s*return FALSE;/u);
    assert.match(source,
        /make_sick\(Sick \? Sick \/ 3L \+ 1L : \(long\) rn1\(ACURR\(A_CON\), 20\),\s*mdat->pmnames\[NEUTRAL\], TRUE, SICK_NONVOMITABLE\);/u);

    await startGame();
    game.moves = 0;
    game.u.uprops[SICK].intrinsic = 0;
    game.u.uprops[SICK_RES].intrinsic = 1;
    const resistantMessages = [];
    const noDraw = () => assert.fail('C returns before the disease RNG branch');
    assert.equal(await diseasemu(game.mons[PM_PESTILENCE], {
        state: game,
        message: async (line) => resistantMessages.push(line),
        random: { rn1: noDraw, rn2: noDraw },
    }), false);
    assert.deepEqual(resistantMessages, ['You feel a slight illness.']);
    assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 0);

    await startGame(9300102);
    game.moves = 0;
    game.u.uprops[SICK].intrinsic = 0;
    game.u.uprops[SICK_RES].intrinsic = 0;
    const draws = [];
    const messages = [];
    const constitution = acurr(game, A_CON);
    const sick = await diseasemu(game.mons[PM_PESTILENCE], {
        state: game,
        message: async (line) => messages.push(line),
        random: {
            rn1(bound, base) {
                draws.push(`rn1(${bound},${base})`);
                assert.equal(bound, constitution);
                assert.equal(base, 20);
                return 27;
            },
            rn2(bound) {
                draws.push(`rn2(${bound})`);
                assert.equal(bound, 2);
                return 1;
            },
        },
    });
    assert.equal(sick, true);
    assert.deepEqual(draws, [`rn1(${constitution},20)`, 'rn2(2)']);
    assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 27);
    assert.equal(game.u.usick_type & SICK_NONVOMITABLE, SICK_NONVOMITABLE);
    assert.deepEqual(messages, ['You feel deathly sick.']);

    await startGame(9300103);
    game.moves = 0;
    game.u.uprops[SICK].intrinsic = 31;
    game.u.uprops[SICK_RES].intrinsic = 0;
    const repeatedDraws = [];
    const repeatedMessages = [];
    assert.equal(await diseasemu(game.mons[PM_ORC], {
        state: game,
        message: async (line) => repeatedMessages.push(line),
        random: {
            rn1: noDraw,
            rn2(bound) {
                repeatedDraws.push(`rn2(${bound})`);
                assert.equal(bound, 2);
                return 1;
            },
        },
    }), true);
    assert.deepEqual(repeatedDraws, ['rn2(2)']);
    assert.equal(game.u.uprops[SICK].intrinsic & TIMEOUT, 11,
        'C uses integer Sick/3+1 and consumes no rn1 when already sick');
    assert.ok(repeatedMessages.includes('You feel much worse.'));
});

test('AD_PEST dispatch snapshots the attacker and keeps normal damage', async () => {
    const cBody = sourceBody(UHITM_C, 'mhitm_ad_pest');
    const copied = cBody.indexOf('struct permonst *pa = magr->data;');
    const defender = cBody.indexOf('mdef == &gy.youmonst');
    const message = cBody.indexOf('pline_mon(magr');
    const disease = cBody.indexOf('(void) diseasemu(pa);');
    assert.ok(copied >= 0 && copied < defender && defender < message
        && message < disease,
    'C snapshots pa, emits the visible helper message, then infects the hero');
    assert.match(cBody,
        /if\s*\(magr == &gy\.youmonst\)[\s\S]*?hero can't polymorph into anything with this attack/u);
    assert.match(cBody,
        /alt_attk = \*mattk;\s*alt_attk\.adtyp = AD_DISE;\s*mhitm_ad_dise\(magr, &alt_attk, mdef, mhm\);/u);
    assert.match(MONSTERS_H,
        /NAM\("Pestilence"\)[\s\S]*?ATTK\(AT_TUCH, AD_PEST/u);

    await startGame(9300104);
    game.moves = 0;
    game.u.uprops[SICK].intrinsic = 0;
    game.u.uprops[SICK_RES].intrinsic = 0;
    const constitution = acurr(game, A_CON);
    const pest = addMonster(game, PM_PESTILENCE, 93014);
    const originalName = pest.data.pmnames[NEUTRAL];
    const bounds = [];
    const messages = [];
    const attackEnv = {
        message: async (line) => {
            messages.push(line);
            if (messages.length === 1) pest.data = game.mons[PM_ORC];
        },
        random: {
            rn1(bound, base) {
                bounds.push(`rn1(${bound},${base})`);
                return 27;
            },
            rn2(bound) {
                bounds.push(`rn2(${bound})`);
                return 1;
            },
        },
        unsupported: (reason) => assert.fail(reason),
        canSpotMonster: () => true,
        displayRandom: () => 0,
    };
    const attack = { aatyp: AT_TUCH, adtyp: AD_PEST, damn: 8, damd: 8 };
    const mhm = { damage: 48, specialdmg: 0, done: false, hitflags: 0 };
    await mhitm_adtyping(pest, attack, game.youmonst, mhm, game, attackEnv);

    assert.equal(pest.data, game.mons[PM_ORC], 'the awaited message changed the live pointer');
    assert.equal(find_delayed_killer(SICK, game).name, originalName,
        'diseasemu receives C’s entry-time permonst snapshot');
    assert.equal(mhm.damage, 48, 'Pestilence illness does not replace normal damage');
    assert.deepEqual(bounds, [`rn1(${constitution},20)`, 'rn2(2)']);
    assert.deepEqual(messages.slice(-1), ['You feel deathly sick.']);
    assert.match(messages[0], /reaches out, and you feel fever and chills\.$/u);
});

test('mhitm_ad_dise preserves C monster defenses and ordinary damage', async () => {
    const cBody = sourceBody(UHITM_C, 'mhitm_ad_dise');
    assert.match(cBody,
        /hero can't polymorph into anything with this attack/u);
    assert.match(cBody,
        /if\s*\(magr == &gy\.youmonst\)[\s\S]*?goto mhitm_dise;[\s\S]*?else if\s*\(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?if\s*\(!diseasemu\(pa\)\)\s*mhm->damage = 0;/u);
    assert.match(cBody,
        /pd->mlet == S_FUNGUS \|\| pd == &mons\[PM_GHOUL\][\s\S]*?defended\(mdef, AD_DISE\)[\s\S]*?mhm->damage = 0;/u);
    for (const [monster, symbol] of [
        ['Juiblex', 'JUIBLEX'],
        ['Demogorgon', 'DEMOGORGON'],
        ['Scorpius', 'SCORPIUS'],
    ]) {
        const start = MONSTERS_H.indexOf(`NAM("${monster}")`);
        const end = MONSTERS_H.indexOf(`${symbol})`, start);
        assert.notEqual(start, -1, `${monster} has a source definition`);
        assert.notEqual(end, -1, `${monster} definition ends at ${symbol}`);
        assert.match(MONSTERS_H.slice(start, end), /M2_NOPOLY/u,
            `${monster}'s source attack cannot be selected by hero polymorph`);
    }

    // Seed 9300107 gives this fixture a fresh game before the disease guards
    // are tested.
    await startGame(9300107);
    // IDs and neighboring offsets keep the monsters distinct while testing
    // the fungus, exact-Ghoul, adult-dragon and ordinary branches.
    const magr = addMonster(game, PM_PESTILENCE, 93017);
    const redMold = addMonster(game, PM_RED_MOLD, 93018, 0, 1);
    // Damage 36 is a nonzero sentinel that the S_FUNGUS guard must clear.
    const fungusDamage = { damage: 36 };
    await mhitm_ad_dise(magr,
        { aatyp: AT_TUCH, adtyp: AD_DISE }, redMold, fungusDamage, game);
    assert.equal(redMold.data.mlet, S_FUNGUS);
    assert.equal(fungusDamage.damage, 0,
        'C suppresses attack damage to every fungus-class monster');

    const ghoul = addMonster(game, PM_GHOUL, 93019, -1, 0);
    // Damage 12 makes the exact-PM_GHOUL damage reset observable.
    const ghoulDamage = { damage: 12 };
    await mhitm_ad_dise(magr,
        { aatyp: AT_TUCH, adtyp: AD_DISE }, ghoul, ghoulDamage, game);
    assert.equal(ghoulDamage.damage, 0,
        'C also suppresses damage to the exact PM_GHOUL species');

    const greenDragon = addMonster(game, PM_GREEN_DRAGON, 93020, 1, 1);
    // Damage 18 is a nonzero sentinel for the AD_DISE scale-defense path.
    const dragonDamage = { damage: 18 };
    await mhitm_ad_dise(magr,
        { aatyp: AT_TUCH, adtyp: AD_DISE }, greenDragon, dragonDamage, game);
    assert.equal(dragonDamage.damage, 0,
        'C treats an adult green dragon as its own disease-blocking scales');

    const orc = addMonster(game, PM_ORC, 93021, 0, -1);
    // Damage 12 distinguishes ordinary damage from each suppressing branch.
    const ordinaryDamage = { damage: 12 };
    await mhitm_ad_dise(magr,
        { aatyp: AT_TUCH, adtyp: AD_DISE }, orc, ordinaryDamage, game);
    assert.equal(ordinaryDamage.damage, 12,
        'unprotected monsters retain the ordinary attack damage');
});

test('AD_DISE dispatch calls the source helper for monster pairs', async () => {
    const dispatchBody = sourceBody(UHITM_C, 'mhitm_adtyping');
    assert.match(dispatchBody,
        /case AD_DISE:\s*mhitm_ad_dise\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(sourceBody(MHITM_C, 'mdamagem'),
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\)/u);
    assert.match(sourceBody(MHITU_C, 'hitmu'),
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\)/u);
    assert.match(sourceBody(UHITM_C, 'damageum'),
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\)/u);
    assert.match(MONSTERS_H,
        /NAM\("Juiblex"\)[\s\S]*?ATTK\(AT_ENGL, AD_DISE/u);
    assert.match(MONSTERS_H,
        /NAM\("Scorpius"\)[\s\S]*?ATTK\(AT_STNG, AD_DISE/u);

    // Seed 9300108 and IDs 93021-93022 make the direct dispatcher fixture
    // deterministic and keep its source monsters distinct.
    await startGame(9300108);
    const juiblex = addMonster(game, PM_JUIBLEX, 93021);
    const redMold = addMonster(game, PM_RED_MOLD, 93022, 0, 1);
    // The C mhitm_data defaults plus sentinel damage 40 make the fungus guard
    // visible without changing the dispatcher inputs.
    const mhm = { damage: 40, specialdmg: 0, done: false, hitflags: 0 };
    await mhitm_adtyping(juiblex,
        { aatyp: AT_TUCH, adtyp: AD_DISE }, redMold, mhm, game, {
            unsupported: (reason) => assert.fail(reason),
        });
    assert.equal(mhm.damage, 0,
        'the AD_DISE switch arm reaches the shared helper');
    assert.equal(game.unported.has('mhitm_ad_dise'), false);
});

test('AD_PEST converts the monster-pair attack to AD_DISE behavior', async () => {
    const cBody = sourceBody(UHITM_C, 'mhitm_ad_pest');
    assert.match(cBody,
        /alt_attk = \*mattk;\s*alt_attk\.adtyp = AD_DISE;\s*mhitm_ad_dise\(magr, &alt_attk, mdef, mhm\);/u);

    // Seed 9300105 and IDs 93015-93023 set up distinct monsters for the
    // Pestilence-to-fungus and Pestilence-to-ordinary-target paths.
    await startGame(9300105);
    game.unported.clear();
    const magr = addMonster(game, PM_PESTILENCE, 93015);
    const redMold = addMonster(game, PM_RED_MOLD, 93016, -1, 0);
    const mhm = { damage: 36, specialdmg: 0, done: false, hitflags: 0 };
    const messages = [];
    const env = {
        unsupported: (reason) => assert.fail(reason),
        message: async (line) => messages.push(line),
    };
    await mhitm_ad_pest(magr,
        { aatyp: AT_TUCH, adtyp: AD_PEST }, redMold, mhm, game, env);
    assert.equal(game.unported.has('uhitm.c mhitm_ad_dise'), false);
    assert.equal(mhm.damage, 0,
        'Pestilence’s copied AD_DISE attack reaches the fungus guard');

    const orc = addMonster(game, PM_ORC, 93023, 0, 1);
    // Damage 7 must remain unchanged for an ordinary defender.
    const ordinaryDamage = { damage: 7, specialdmg: 0, done: false, hitflags: 0 };
    await mhitm_ad_pest(magr,
        { aatyp: AT_TUCH, adtyp: AD_PEST }, orc, ordinaryDamage, game, env);
    assert.equal(ordinaryDamage.damage, 7,
        'the helper leaves normal damage unchanged for ordinary monsters');

    game.unported.clear();
    const impossibleHeroAttack = {
        ...game.youmonst,
        data: game.mons[PM_PESTILENCE],
    };
    const impossibleHeroState = { ...game, youmonst: impossibleHeroAttack };
    assert.equal(impossibleHeroState.youmonst, impossibleHeroAttack,
        'C tests identity against &gy.youmonst, not species equality');
    game.u.uprops[SICK].intrinsic = 0;
    // Damage 7 is cleared by the source hero goto into the fungus guard.
    const impossibleDamage = { damage: 7 };
    await mhitm_ad_pest(impossibleHeroAttack,
        { aatyp: AT_TUCH, adtyp: AD_PEST }, redMold, impossibleDamage,
        impossibleHeroState, env);
    assert.equal(game.unported.has('uhitm.c mhitm_ad_dise'), false);
    assert.equal(impossibleDamage.damage, 0,
        'the source goto shares the monster-pair fungus guard');
    assert.equal(game.u.uprops[SICK].intrinsic, 0,
        'the impossible attack does not run the monster-to-hero disease arm');
    assert.deepEqual(messages, [],
        'the source hero-attacker branch reaches no output before its gap');
});

test('diseasemu forwards planning state, RNG and silent encumber messages', async () => {
    await startGame(9300106);
    game.moves = 5;
    const liveBefore = {
        sick: game.u.uprops[SICK].intrinsic,
        type: game.u.usick_type,
        exercise: game.u.aexe[A_CON],
        botl: game.disp.botl,
        oldcap: game.go.oldcap,
        rngLog: getRngLog().slice(),
    };
    const clone = planningState(game);
    clone.go.oldcap = 5;
    const messages = [];
    const draws = [];
    await diseasemu(clone.mons[PM_PESTILENCE], {
        state: clone,
        planning: true,
        message: async (line, subject) => {
            assert.equal(subject, clone, 'the callback remains attached to clone state');
            messages.push(line);
        },
        random: {
            rn1(bound, base) {
                draws.push(`rn1(${bound},${base})`);
                return 24;
            },
            rn2(bound) {
                draws.push(`rn2(${bound})`);
                return 1;
            },
        },
    });

    assert.deepEqual(draws, [`rn1(${acurr(clone, A_CON)},20)`, 'rn2(2)']);
    assert.ok(messages.includes('You feel deathly sick.'));
    assert.ok(messages.some((line) => line.includes('movements')),
        'the helper binds encumber_msg to the supplied silent message operation');
    assert.equal(clone.u.uprops[SICK].intrinsic & TIMEOUT, 24);
    assert.equal(game.u.uprops[SICK].intrinsic, liveBefore.sick);
    assert.equal(game.u.usick_type, liveBefore.type);
    assert.equal(game.u.aexe[A_CON], liveBefore.exercise);
    assert.equal(game.disp.botl, liveBefore.botl);
    assert.equal(game.go.oldcap, liveBefore.oldcap);
    assert.deepEqual(getRngLog(), liveBefore.rngLog,
        'the injected clone RNG does not advance the live game stream');
});
