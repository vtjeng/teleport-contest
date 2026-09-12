import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { adtyp_to_expltype, explosionmask } from '../js/explode.js';
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
