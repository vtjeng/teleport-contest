import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { adtyp_to_expltype, explosionmask, mon_explodes } from '../js/explode.js';
import { runSegment } from '../js/jsmain.js';
import {
    AD_COLD,
    AD_DRST,
    AD_ELEC,
    AD_ENCH,
    AD_FIRE,
    AD_PHYS,
    AD_SPEL,
    AD_DREN,
    AD_DRDX,
    AD_DRCO,
    AD_DISE,
    AD_PEST,
} from '../js/monsters.js';
import {
    COLD_RES,
    FIRE_RES,
    PHYS_EXPL_TYPE,
} from '../js/const.js';
import { newMonster } from '../js/monst.js';
import {
    NON_PM,
    PM_GAS_SPORE,
} from '../js/monsters.js';
import { zap_over_floor } from '../js/zap.js';

test('adtyp_to_expltype follows explode.c mapping', () => {
    for (const adtyp of [AD_ELEC, AD_SPEL, AD_DREN, AD_ENCH])
        assert.equal(adtyp_to_expltype(adtyp), 4);
    assert.equal(adtyp_to_expltype(AD_FIRE), 5);
    assert.equal(adtyp_to_expltype(AD_COLD), 6);
    for (const adtyp of [AD_DRST, AD_DRDX, AD_DRCO, AD_DISE, AD_PEST, AD_PHYS])
        assert.equal(adtyp_to_expltype(adtyp), 1);
});

test('explosionmask reports only resisted targets', () => {
    const hero = { data: { mresists: 0 } };
    const state = {
        youmonst: hero,
        u: { uprops: { [FIRE_RES]: { intrinsic: 1 } } },
    };
    assert.equal(explosionmask(hero, AD_PHYS, -1, state), 0);
    assert.equal(explosionmask(hero, AD_FIRE, -1, state), 2);
    assert.equal(explosionmask(hero, AD_COLD, -1, state), 0);
    const resistant = {
        data: { mresists: 1 << (COLD_RES - 1) },
        mintrinsics: 0,
        mextrinsics: 0,
        minvent: null,
    };
    assert.equal(explosionmask(resistant, AD_COLD, -1, state), 1);
});

test('zap_over_floor ignores physical explosions before zap arms', async () => {
    await runSegment({
        seed: 192837,
        datetime: '20260306120000',
        nethackrc: [
            'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,time',
            '',
        ].join('\n'),
        moves: '',
    });
    const shopdamage = { value: false };
    assert.equal(
        await zap_over_floor(
            game.u.ux,
            game.u.uy,
            PHYS_EXPL_TYPE,
            shopdamage,
            false,
            0,
            game,
        ),
        -1000,
    );
    assert.equal(shopdamage.value, false);
});

// explode.c mon_explodes():1056-1060 uses pmname(mon->data, Mgender(mon))
// for the killer text. A named fixture makes contextual Monnam() observably
// different while keeping the source's species and gender inputs explicit.
test('mon_explodes uses the species name for killer text', async () => {
    // This seed and fixed datetime select a normal initialized level; neither
    // value affects the naming branch under test.
    await runSegment({
        seed: 7710044,
        datetime: '20260214031500',
        nethackrc: [
            'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,time',
            '',
        ].join('\n'),
        moves: '',
    });
    const monster = newMonster({
        // Gas spore's physical AT_BOOM path calls mon_explodes() with AD_PHYS.
        data: game.mons[PM_GAS_SPORE],
        cham: NON_PM,
        m_lev: game.mons[PM_GAS_SPORE].mlevel,
        // A given name is what contextual Monnam() would select here.
        mextra: { mgivenname: 'Bob' },
        // Centering the zero-map fixture on the hero gives explode() a visible
        // target, so its message includes the killer text.
        mx: game.u.ux,
        my: game.u.uy,
        mhp: 0,
    });
    const lines = [];
    const random = {
        // mon_explodes()'s one damage die is fixed at one to keep the hero
        // alive while still exercising the physical explosion message.
        d: () => 1,
        rn1: () => 1,
        rn2: () => 0,
        rnd: () => 1,
        rne: () => 1,
    };
    await mon_explodes(monster, { damn: 1, damd: 1, adtyp: AD_PHYS }, game, {
        message: async (line) => lines.push(line),
        random,
        unsupported: (reason) => { throw new Error(reason); },
    });
    assert.ok(
        lines.includes("You are caught in the gas spore's explosion!"),
        `messages: ${JSON.stringify(lines)}`,
    );
    assert.equal(game.killer.name, '');
});
