import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STRAT_WAITFORU } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_HALU, PM_BLACK_LIGHT, PM_OGRE } from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

async function fixture() {
    await runSegment({
        seed: 7_108_203,
        datetime: '20390716124500',
        nethackrc: [
            'OPTIONS=name:BlacklightTest,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    game.gv.vis = true;
    return game;
}

function addMonster(state, species, id, x, y, extra = {}) {
    const mon = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx: x,
        my: y,
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mcansee: true,
        mcan: false,
        mstrategy: 0,
        ...extra,
    });
    place_monster(mon, x, y, state);
    mon.nmon = state.level.monlist;
    state.level.monlist = mon;
    return mon;
}

function operations() {
    const lines = [];
    return {
        lines,
        env: {
            message: async line => { lines.push(line); },
            unsupported: reason => assert.fail(reason),
        },
    };
}

test('mhitm_ad_halu follows the complete source function and dispatcher arm', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_halu\([\s\S]*?\n\}\n\nboolean\ndo_stone_u/u,
    )?.[0];
    assert.ok(source);
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mhm->damage = 0;[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?mhm->damage = 0;[\s\S]*?!magr->mcan && haseyes\(pd\) && mdef->mcansee[\s\S]*?gv\.vis && canseemon\(mdef\)[\s\S]*?mdef->mconf = 1;[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU;[\s\S]*?mhm->damage = 0;/u);
    assert.match(UHITM_C,
        /case AD_HALU:\s*mhitm_ad_halu\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_JS,
        /case AD_HALU:\s*await mhitm_ad_halu\(magr, mdef, mhm, state, env\);\s*break;/u);
    assert.doesNotMatch(UHITM_JS,
        /case AD_HALU:\s*unported\('mhitm_ad_halu'\)/u);
});

test('an uncancelled monster confuses an eyed, seeing monster and clears its wait strategy', async () => {
    const state = await fixture();
    const attacker = addMonster(state, PM_BLACK_LIGHT, 71101, state.u.ux + 1, state.u.uy);
    const defender = addMonster(state, PM_OGRE, 71102, state.u.ux - 1, state.u.uy, {
        mstrategy: STRAT_WAITFORU,
    });
    const result = operations();
    const mhm = { damage: 12 };

    await mhitm_adtyping(
        attacker,
        { aatyp: 0, adtyp: AD_HALU },
        defender,
        mhm,
        state,
        result.env,
    );

    assert.deepEqual(result.lines, ['The ogre looks confused.']);
    assert.equal(defender.mconf, 1);
    assert.equal(defender.mstrategy & STRAT_WAITFORU, 0);
    assert.equal(mhm.damage, 0);
});

test('hero attack directions take no confusion branch and still zero damage', async () => {
    const state = await fixture();
    const defender = addMonster(state, PM_OGRE, 71103, state.u.ux + 1, state.u.uy);
    const attacker = addMonster(state, PM_BLACK_LIGHT, 71104, state.u.ux - 1, state.u.uy);
    const result = operations();
    const heroAttack = { damage: 4 };
    const monsterAttack = { damage: 5 };

    await mhitm_adtyping(
        state.youmonst,
        { aatyp: 0, adtyp: AD_HALU },
        defender,
        heroAttack,
        state,
        result.env,
    );
    await mhitm_adtyping(
        attacker,
        { aatyp: 0, adtyp: AD_HALU },
        state.youmonst,
        monsterAttack,
        state,
        result.env,
    );

    assert.deepEqual(result.lines, []);
    assert.equal(heroAttack.damage, 0);
    assert.equal(monsterAttack.damage, 0);
    assert.equal(defender.mconf, false);
});
