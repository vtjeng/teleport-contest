import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import {
    adtyp_to_expltype,
    explode,
    explosionmask,
    mon_explodes,
    scatter,
    SCATTER_MAY_DESTROY,
    SCATTER_MAY_FRACTURE,
    SCATTER_MAY_HIT,
    SCATTER_MAY_HITMON,
    SCATTER_MAY_HITYOU,
    SCATTER_VIS_EFFECTS,
} from '../js/explode.js';
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
    ANTIMAGIC,
    EXPL_MAGICAL,
    EXPL_FIERY,
    HI_ZAP,
    COLD_RES,
    FIRE_RES,
    OBJ_INVENT,
    PHYS_EXPL_TYPE,
    W_ARM,
} from '../js/const.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mksobj, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    NON_PM,
    PM_GAS_SPORE,
    PM_NEWT,
} from '../js/monsters.js';
import { LEATHER_ARMOR, ROCK, SCROLL_CLASS, WAND_CLASS } from '../js/objects.js';
import { zap_over_floor } from '../js/zap.js';
import { getRngLog } from '../js/rng.js';
import { decodeScreen } from '../frozen/screen-decode.mjs';

test('magical shield frames map C cmap indices through cmap_to_glyph', async () => {
    await runSegment({
        seed: 30303030,
        datetime: '20310102030405',
        nethackrc: [
            'OPTIONS=name:ShieldFrame,role:Wizard,race:human,gender:female,align:chaotic',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: ' ',
    });
    game.u.uprops[ANTIMAGIC] ??= {};
    game.u.uprops[ANTIMAGIC].intrinsic = 1;
    game.flags.sparkle = true;

    const frames = [];
    const previousHook = game._animationFrameHook;
    game._animationFrameHook = () => {
        previousHook?.();
        frames.push(game.nhDisplay.serialize());
    };
    try {
        await explode(
            game.u.ux, game.u.uy, 0, 0, WAND_CLASS, EXPL_MAGICAL, game,
            {
                message: async () => {},
                random: {
                    d: (count) => count,
                    rn1: (_range, base) => base,
                    rn2: () => 0,
                    rnl: () => 0,
                    rnd: (count) => count,
                    rne: () => 1,
                },
            },
        );
    } finally {
        game._animationFrameHook = previousHook;
    }

    // explode.c:explode() converts every shield_static cmap index with
    // cmap_to_glyph() before show_glyph(); decl.c's 21 entries are three
    // repetitions of this seven-cell sequence, all colored HI_ZAP.
    const shieldSequence = ['0', '#', '@', '#', '0', '#', '*'];
    const heroRow = game.u.uy + 1;
    const heroColumn = game.u.ux - 1;
    const cells = frames.map((frame) =>
        decodeScreen(frame)[heroRow][heroColumn]);
    assert.deepEqual(cells, Array.from({ length: 3 }, () => shieldSequence)
        .flat().map((ch) => ({ ch, color: HI_ZAP, attr: 0, decgfx: 0 })));
});

test('scatter flags preserve explode.c hack.h bit assignments', () => {
    assert.equal(SCATTER_VIS_EFFECTS, 0x01);
    assert.equal(SCATTER_MAY_HITMON, 0x02);
    assert.equal(SCATTER_MAY_HITYOU, 0x04);
    assert.equal(SCATTER_MAY_HIT, 0x06);
    assert.equal(SCATTER_MAY_DESTROY, 0x08);
    assert.equal(SCATTER_MAY_FRACTURE, 0x10);
});

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

test('explode supplies rnl to blessed-armor fire damage', async () => {
    await runSegment({
        seed: 83015811,
        datetime: '20321112131415',
        nethackrc: [
            'OPTIONS=name:FireErosion,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: '                                                  ',
    });

    // explode.c:614 calls trap.c:burnarmor(); blessed gear then reaches
    // trap.c:erode_obj() and consumes the same rnd.c rnl wrapper. Keep one
    // vulnerable suit equipped so whichever armor slot is drawn, the loop
    // eventually reaches the body-armor arm without injecting RNG.
    const suit = mksobj(LEATHER_ARMOR, true, false, { state: game });
    suit.blessed = true;
    suit.owornmask = W_ARM;
    suit.where = OBJ_INVENT;
    suit.nobj = null;
    game.invent = suit;
    game.uarm = suit;
    game.uarmc = null;
    game.uarmh = null;
    game.uarms = null;
    game.uarmg = null;
    game.uarmf = null;
    game.uarmu = null;
    const firstDraw = getRngLog().length;

    await explode(
        game.u.ux, game.u.uy, 11, 8, SCROLL_CLASS, EXPL_FIERY, game,
    );

    assert.ok(
        getRngLog().slice(firstDraw).some((entry) => entry.startsWith('rnl(4)')),
        'blessed armor erosion reaches the source rnl(4) call',
    );
});

test('a player-caused explosion keeps xkilled’s ordinary message flag', async () => {
    await runSegment({
        seed: 83015812,
        datetime: '20321112131415',
        nethackrc: [
            'OPTIONS=name:FireKill,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: '',
    });
    game.u.uprops[FIRE_RES] ??= {};
    game.u.uprops[FIRE_RES].extrinsic = 1;
    const monster = newMonster({
        data: game.mons[PM_NEWT],
        cham: NON_PM,
        m_lev: game.mons[PM_NEWT].mlevel,
        m_id: 100,
        mx: 0,
        my: 0,
        mhp: 1,
        mhpmax: 1,
        mcanmove: 1,
    });
    place_monster(monster, game.u.ux + 1, game.u.uy, game);
    const lines = [];
    const random = {
        d: () => 1,
        rn1: (_range, from) => from,
        rn2: (bound) => Math.min(1, bound - 1),
        rnd: () => 1,
        rnl: () => 1,
        rne: () => 1,
    };

    await explode(
        game.u.ux, game.u.uy, 11, 100, SCROLL_CLASS, EXPL_FIERY, game,
        { message: async (line) => lines.push(line), random },
    );

    // explode.c:560 passes XKILL_GIVEMSG (0) | xkflg. It must retain the
    // separate kill line after the explosion's caught-in message.
    assert.ok(lines.some((line) => line.includes('is caught in the tower of flame!')));
    assert.ok(lines.includes('You kill the newt!'), JSON.stringify(lines));
    assert.equal(monster.mhp, 0);
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

test('scatter preserves C direction, range, landing, and total order', async () => {
    const state = {
        u: { ux: 5, uy: 5, uundetected: false },
        youmonst: { data: {} },
        level: {
            objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
            traps: [],
            objlist: null,
            at: () => ({ typ: 100 }),
        },
        gb: { bhitpos: { x: 5, y: 5 } },
        gt: {},
    };
    const object = {
        otyp: 1,
        oclass: 2,
        quan: 1,
        owt: 40,
        spe: 0,
        ox: 5,
        oy: 5,
        where: 1,
    };
    const randomCalls = [];
    const landed = [];
    const random = {
        rn2: (n) => {
            randomCalls.push(`rn2(${n})`);
            return 3; // xdir[3]=1, ydir[3]=-1
        },
        rnd: (n) => {
            randomCalls.push(`rnd(${n})`);
            return 2;
        },
    };
    const total = await scatter(5, 5, 3, 0, object, state, {
        random,
        shopOrigin: false,
        extractObject: (value) => { value.where = 0; },
        placeObject: (value, x, y) => {
            value.where = 1;
            value.ox = x;
            value.oy = y;
            landed.push([x, y]);
        },
        stackObject: () => {},
        floorEffects: () => false,
        terrainAt: () => 100,
        closedDoor: () => false,
        isSink: () => false,
        monsterAt: () => null,
        heroAt: () => false,
        canSee: () => false,
        newsym: () => {},
        maybeUnhideAt: () => {},
    });

    assert.equal(total, 1);
    assert.deepEqual(randomCalls, ['rn2(8)', 'rnd(2)']);
    assert.deepEqual(landed, [[7, 3]]);
    assert.deepEqual(state.gb.bhitpos, { x: 7, y: 3 });
    assert.equal(state.gt.thrownobj, null);
});

test('scatter gives a monster the source one-step hit boundary', async () => {
    const state = {
        u: { ux: 5, uy: 5, uundetected: false },
        youmonst: { data: {} },
        level: {
            objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
            traps: [],
            objlist: null,
            at: () => ({ typ: 100 }),
        },
        gb: { bhitpos: { x: 5, y: 5 } },
        gt: {},
    };
    const object = {
        otyp: 1,
        oclass: 2,
        quan: 1,
        owt: 40,
        spe: 0,
        ox: 5,
        oy: 5,
        where: 1,
    };
    const monster = { mhp: 10, mx: 6, my: 4, data: {} };
    const calls = [];
    const total = await scatter(5, 5, 2, SCATTER_MAY_HITMON, object, state, {
        random: {
            rn2: () => 3,
            rnd: () => 1,
        },
        shopOrigin: false,
        extractObject: (value) => { value.where = 0; },
        placeObject: () => {},
        stackObject: () => {},
        floorEffects: () => false,
        terrainAt: () => 100,
        closedDoor: () => false,
        isSink: () => false,
        monsterAt: (x, y) => x === 6 && y === 4 ? monster : null,
        hitMonster: async (...args) => {
            calls.push(args);
            return false;
        },
        heroAt: () => false,
        canSee: () => false,
        newsym: () => {},
        maybeUnhideAt: () => {},
    });

    assert.equal(total, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], 1);
    assert.deepEqual(state.gb.bhitpos, { x: 6, y: 4 });
});

test('scatter uses the production object lifecycle on an ordinary floor', async () => {
    await runSegment({
        seed: 6100421,
        datetime: '20300415091723',
        nethackrc: [
            'OPTIONS=name:ScatterLifecycle,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: '',
    });
    const x = game.u.ux;
    const y = game.u.uy;
    const object = mksobj(ROCK, true, false, { state: game });
    object.quan = 1;
    object.owt = 1;
    place_object(object, x, y, objectGenerationEnv({ state: game }));
    const total = await scatter(x, y, 2, 0, object, game, {
        random: {
            rn2: () => 3,
            rnd: () => 1,
        },
        shopOrigin: false,
        terrainAt: () => 100,
        closedDoor: () => false,
        isSink: () => false,
        monsterAt: () => null,
        heroAt: () => false,
        canSee: () => false,
        maybeUnhideAt: () => {},
    });

    assert.equal(total, 1);
    assert.equal(object.where, 1);
    assert.equal(object.ox, x + 1);
    assert.equal(object.oy, y - 1);
    assert.equal(game.level.objects[x]?.[y], null);
    assert.equal(game.level.objects[x + 1]?.[y - 1], object);
});
