import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isok } from '../js/cmd_isok.js';
import { CONFUSION, STRAT_WAITFORU } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_CONF,
    AT_WEAP,
    PM_STONE_GOLEM,
    PM_YEENOGHU,
} from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const MONSTERS_C = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url), 'utf8',
);
const MONDATA_H = readFileSync(
    new URL('../nethack-c/upstream/include/mondata.h', import.meta.url), 'utf8',
);
const POLYSELF_C = readFileSync(
    new URL('../nethack-c/upstream/src/polyself.c', import.meta.url), 'utf8',
);

// The fixed date comes from the independently selected C64 stone-pair recipe.
const DATETIME = '20360401120619';
const RC = [
    'OPTIONS=name:ConfusionBranch,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame() {
    // Seed 12636002 and an empty input initialize the same ordinary game
    // state shape used by the independently recorded C64 stone-pair witness.
    await runSegment({
        seed: 12636002, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function addMonster(state, species, id, extra = {}) {
    // These adjacent offsets find a legal unoccupied square, as the C
    // `collect_coords()` setup does; IDs below only distinguish test fixtures.
    const offsets = [
        [1, 0], [-1, 0], [0, -1], [0, 1],
        [1, -1], [1, 1], [-1, -1], [-1, 1],
    ];
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    assert.ok(Number.isInteger(mx) && Number.isInteger(my));
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx,
        my,
        // Twenty HP keeps these test actors alive through the effect branch.
        mhp: 20,
        mhpmax: 20,
        // The defaults model active, uncancelled monsters with no previous
        // special attack, no status effect, and no pending wait-for-hero plan.
        mcanmove: true,
        mfrozen: 0,
        meating: 0,
        mstrategy: 0,
        mcan: false,
        mcansee: true,
        mspec_used: 0,
        ...extra,
    });
    place_monster(monster, mx, my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackEnv(plan = []) {
    const events = [];
    const draws = [];
    let index = 0;
    const random = {
        rn2(bound) {
            const [expectedBound, value] = plan[index++] ?? [];
            assert.equal(bound, expectedBound, `unexpected rn2(${bound})`);
            draws.push(`rn2(${bound})=${value}`);
            return value;
        },
    };
    return {
        events,
        draws,
        env: {
            random,
            message: async (line) => { events.push(line); },
            unsupported: (reason) => assert.fail(reason),
        },
        assertDrawsFinished() {
            assert.equal(index, plan.length, 'all planned source draws were used');
        },
    };
}

test('mhitm_ad_conf keeps C branch order and all three production callers', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_conf\([\s\S]*?\n\}\n\nvoid\s+mhitm_ad_poly/u,
    )?.[0];
    assert.ok(source, 'uhitm.c defines the complete selected helper');
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?!mdef->mconf[\s\S]*?canseemon\(mdef\)[\s\S]*?mdef->mconf = 1/u);
    assert.match(source,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?!magr->mcan && !rn2\(4\) && !magr->mspec_used[\s\S]*?mhm->damage \+ rn2\(6\)[\s\S]*?Confusion[\s\S]*?make_confused\(HConfusion \+ mhm->damage, FALSE\)[\s\S]*?mhm->damage = 0/u);
    assert.match(source,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?!magr->mcan && !mdef->mconf && !magr->mspec_used[\s\S]*?gv\.vis && canseemon\(mdef\)[\s\S]*?mdef->mconf = 1;\s*mdef->mstrategy &= ~STRAT_WAITFORU/u);
    assert.match(UHITM_C,
        /case AD_CONF:\s*mhitm_ad_conf\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
});

test('a monster Confuses the hero after the source one-in-four gate', async () => {
    const state = await startGame();
    const attacker = addMonster(state, PM_YEENOGHU, 64001);
    const attack = attacker.data.mattk.find((entry) => entry.adtyp === AD_CONF);
    assert.ok(attack, 'Yeenoghu has the C weapon-confusion attack');

    // C zero-based step 39 rolls d(2,8)=3, rn2(4)=0 and rn2(6)=3. The same
    // damage and gate outcomes pin both the hero timeout and cooldown sum.
    const result = attackEnv([[4, 0], [6, 3]]);
    const mhm = { damage: 3 };
    await mhitm_adtyping(
        attacker, attack, state.youmonst, mhm, state, result.env,
    );

    result.assertDrawsFinished();
    assert.deepEqual(result.draws, ['rn2(4)=0', 'rn2(6)=3']);
    assert.deepEqual(result.events, [
        'Yeenoghu hits!',
        'You are getting confused.',
    ]);
    assert.equal(attacker.mspec_used, 6);
    assert.equal(state.u.uprops[CONFUSION].intrinsic, 3);
    assert.equal(mhm.damage, 0);
});

test('a Confusing monster marks a visible monster and clears wait-for-hero',
    async () => {
        const state = await startGame();
        const attacker = addMonster(state, PM_YEENOGHU, 64002);
        // The second bit models an unrelated strategy flag which C preserves.
        const defender = addMonster(state, PM_STONE_GOLEM, 64003, {
            mstrategy: STRAT_WAITFORU | 4,
        });
        state.gv.vis = true;
        const result = attackEnv();
        // Five is source-independent damage; the monster-pair helper retains it.
        const mhm = { damage: 5 };

        await mhitm_adtyping(
            attacker,
            { aatyp: AT_WEAP, adtyp: AD_CONF },
            defender,
            mhm,
            state,
            result.env,
        );

        result.assertDrawsFinished();
        assert.deepEqual(result.draws, []);
        assert.deepEqual(result.events, ['The stone golem looks confused.']);
        assert.equal(defender.mconf, 1);
        assert.equal(defender.mstrategy, 4);
        assert.equal(mhm.damage, 5);
    });

test('the hero-attacker helper arm is pinned despite having no C attack route',
    async () => {
        // The C attack table has only two AD_CONF attacks: Umber Hulk's gaze,
        // handled by dogaze(), and Yeenoghu's weapon blow, whose species is
        // marked M2_NOPOLY. No valid polymorphed-hero attack reaches damageum()
        // with AD_CONF, so this direct dispatch fixture pins the source arm.
        assert.equal((MONSTERS_C.match(/\bAD_CONF\b/gu) ?? []).length, 2);
        const umberHulk = MONSTERS_C.match(
            /MON\(NAM\("umber hulk"\)[\s\S]*?\bUMBER_HULK\),/u,
        )?.[0];
        const yeenoghu = MONSTERS_C.match(
            /MON\(NAM\("Yeenoghu"\)[\s\S]*?\bYEENOGHU\),/u,
        )?.[0];
        const dogaze = POLYSELF_C.match(
            /int\s+dogaze\(void\)[\s\S]*?\n\}\n/u,
        )?.[0];
        assert.ok(umberHulk);
        assert.ok(yeenoghu);
        assert.ok(dogaze);
        assert.match(umberHulk, /ATTK\(AT_GAZE, AD_CONF, 0, 0\)/u);
        assert.match(yeenoghu, /ATTK\(AT_WEAP, AD_CONF, 2, 8\)/u);
        assert.match(yeenoghu, /M2_NOPOLY/u);
        assert.match(MONDATA_H,
            /#define\s+polyok\(ptr\).*M2_NOPOLY.*== 0L/u);
        assert.match(dogaze, /adtyp != AD_CONF && adtyp != AD_FIRE/u);
        assert.doesNotMatch(dogaze, /mhitm_adtyping/u);

        const state = await startGame();
        const defender = addMonster(state, PM_STONE_GOLEM, 64004);
        const result = attackEnv();
        // The helper's hero arm leaves the already-rolled damage unchanged.
        const mhm = { damage: 3 };

        await mhitm_adtyping(
            state.youmonst,
            { aatyp: AT_WEAP, adtyp: AD_CONF },
            defender,
            mhm,
            state,
            result.env,
        );

        result.assertDrawsFinished();
        assert.deepEqual(result.events, ['The stone golem looks confused.']);
        assert.equal(defender.mconf, 1);
        assert.equal(mhm.damage, 3);
    });
