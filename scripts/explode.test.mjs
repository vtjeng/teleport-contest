import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import {
    adtyp_to_expltype,
    explode,
    explosionmask,
    mon_explodes,
    scatter,
    splatter_burning_oil,
    SCATTER_MAY_DESTROY,
    SCATTER_MAY_FRACTURE,
    SCATTER_MAY_HIT,
    SCATTER_MAY_HITMON,
    SCATTER_MAY_HITYOU,
    SCATTER_VIS_EFFECTS,
} from '../js/explode.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
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
    DEAF,
    PLNMSG_TOWER_OF_FLAME,
    PLNMSG_UNKNOWN,
    FIRE_RES,
    OBJ_INVENT,
    PHYS_EXPL_TYPE,
    W_ARM,
    MON_EXPLODE,
} from '../js/const.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mksobj, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    NON_PM,
    PM_GAS_SPORE,
    PM_NEWT,
    PM_CLERIC,
    PM_MONK,
    PM_WIZARD,
    PM_HEALER,
    PM_KNIGHT,
    PM_CAVE_DWELLER,
    PM_HILL_GIANT,
} from '../js/monsters.js';
import {
    BOULDER,
    EGG,
    GOLD_PIECE,
    LEATHER_ARMOR,
    ROCK,
    SCR_BLANK_PAPER,
    SCROLL_CLASS,
    STATUE,
    WAND_CLASS,
    WAN_CREATE_MONSTER,
} from '../js/objects.js';
import { zap_over_floor } from '../js/zap.js';
import { getRngLog } from '../js/rng.js';
import { decodeScreen } from '../frozen/screen-decode.mjs';
import { ttyPline } from '../js/tty_message.js';

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

test('planned visible explosions apply clone mechanics without painting', async () => {
    // This seed and fixed date create an ordinary visible map; neither value
    // drives the explosion result, which depends on visibility and this fixture.
    await runSegment({
        seed: 30303031,
        datetime: '20310102030405',
        // These identity and option values avoid startup effects; the test
        // installs its own target and requires a visible square.
        nethackrc: [
            'OPTIONS=name:PlannedBlast,role:Wizard,race:human,gender:female,align:chaotic',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: '', // No elapsed turns; the fixture supplies the only blast target.
    });

    // A newt with 30 HP survives the one-point blast, exposing damage on the
    // planning clone without making death cleanup part of this display test.
    const target = newMonster({
        data: game.mons[PM_NEWT],
        cham: NON_PM,
        m_lev: game.mons[PM_NEWT].mlevel,
        m_id: 8801, // A test-only identity distinct from this fresh game's monsters.
        // One square east keeps the target inside the 3-by-3 explosion mask.
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 30,
        mhpmax: 30,
        mcanmove: 1,
        mcansee: 1,
    });
    place_monster(target, target.mx, target.my, game);
    target.nmon = game.level.monlist;
    game.level.monlist = target;

    const planned = planningState(game);
    const plannedTarget = planned.level.monsters[target.mx][target.my];
    const liveHitPoints = target.mhp;
    const liveScreen = game.nhDisplay.serialize();
    let animationFrames = 0;
    const messages = [];
    const previousHook = game._animationFrameHook;
    game._animationFrameHook = () => {
        previousHook?.();
        animationFrames++;
    };
    try {
        // The center is the hero square, which makes the C `visible` branch
        // true; type 1 selects AD_FIRE and dam 1 keeps the nearby actors alive.
        // Fixed-one helper results make any incidental damage checks deterministic.
        await explode(
            game.u.ux,
            game.u.uy,
            1,
            1,
            MON_EXPLODE,
            EXPL_FIERY,
            planned,
            {
                planning: true,
                message: async (line) => messages.push(line),
                random: {
                    d: () => 1,
                    rn1: (_range, base) => base,
                    rn2: () => 1,
                    rnd: () => 1,
                    rnl: () => 1,
                    rne: () => 1,
                },
            },
        );
    } finally {
        game._animationFrameHook = previousHook;
    }

    assert.ok(plannedTarget.mhp < liveHitPoints,
        'explode.c damage still changes the planned monster');
    assert.equal(target.mhp, liveHitPoints,
        'planning does not apply explosion damage to the live monster');
    // explode.c keeps the visible-branch Boom message while omitting only
    // the blast line used when no square in the mask can be seen.
    assert.ok(messages.includes('Boom!'), JSON.stringify(messages));
    assert.equal(messages.includes('You hear a blast.'), false,
        'the visible classification remains active during planning');
    assert.equal(animationFrames, 0,
        'planning skips visible animation callbacks that draw on the live display');
    assert.equal(game.nhDisplay.serialize(), liveScreen,
        'planning leaves the live terminal screen unchanged');
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

test('burning-oil splatter uses the diluted and ordinary C dice counts', async () => {
    // The C helper rolls 3d4 for diluted oil and 4d4 otherwise. The two
    // explosions are placed at (1,1), outside the initialized hero's area,
    // so this test isolates the helper's consumed RNG call. This independently
    // chosen seed, date, and Wizard setup only initialize an ordinary map; the
    // injected dice return the source-valid lower bound for each roll.
    await runSegment({
        seed: 6196701,
        datetime: '20370914112233',
        nethackrc: [
            'OPTIONS=name:OilDice,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: ' ',
    });
    const draws = [];
    const random = {
        d: (count, sides) => {
            draws.push([count, sides]);
            return count;
        },
    };

    await splatter_burning_oil(1, 1, true, game, {
        random,
        message: async () => {},
    });
    await splatter_burning_oil(1, 1, false, game, {
        random,
        message: async () => {},
    });

    assert.deepEqual(draws, [[3, 4], [4, 4]]);
});

test('explode_oil preserves its C end-light, lost-reason, splatter order', () => {
    const c = readFileSync(
        new URL('../nethack-c/upstream/src/explode.c', import.meta.url),
        'utf8',
    );
    const cStart = c.indexOf('explode_oil(struct obj *obj, coordxy x, coordxy y)');
    const cEnd = c.indexOf('\n}\n\n/* Convert a damage type', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart);
    const cBody = c.slice(cStart, cEnd);
    assert.match(cBody,
        /boolean diluted_oil = obj->odiluted;[\s\S]*?end_burn\(obj, TRUE\);[\s\S]*?obj->how_lost = LOST_EXPLODING;[\s\S]*?splatter_burning_oil\(x, y, diluted_oil\);/u);

    const js = readFileSync(new URL('../js/explode.js', import.meta.url), 'utf8');
    const jsStart = js.indexOf('export async function explode_oil(');
    const jsBody = js.slice(jsStart, js.indexOf('\n}', jsStart));
    assert.match(jsBody,
        /const dilutedOil = Boolean\(obj\.odiluted\);[\s\S]*?end_burn\(obj, true, env\);[\s\S]*?obj\.how_lost = LOST_EXPLODING;[\s\S]*?await splatter_burning_oil\(x, y, dilutedOil, state,/u);
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

test('scatter reaches the C egg destruction arm without a glass lookup', async () => {
    // The source coordinates are off the hero so the final uncover check is
    // inert; SCATTER_MAY_DESTROY makes C test the egg after one rn2(10) draw.
    const sx = 5;
    const sy = 5;
    const state = {
        u: { ux: 1, uy: 1, uundetected: false, urooms: '' },
        youmonst: { data: {} },
        level: {
            objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
            traps: [],
            objlist: null,
        },
        gb: { bhitpos: { x: sx, y: sy } },
        gt: {},
    };
    const egg = {
        otyp: EGG,
        oclass: 2,
        quan: 1,
        owt: 1,
        ox: sx,
        oy: sy,
    };
    const randomCalls = [];
    const broken = [];
    const effects = [];
    const total = await scatter(
        sx,
        sy,
        4, // A positive blast force reaches scatter's object pass.
        SCATTER_MAY_DESTROY,
        egg,
        state,
        {
            random: {
                rn2: (bound) => {
                    randomCalls.push(`rn2(${bound})`);
                    return 1; // The egg branch, rather than chance, destroys it.
                },
            },
            shopOrigin: false,
            monsterAt: () => null,
            extractObject: () => {},
            objectMaterial: () => {
                effects.push('material');
                return 0; // Non-glass allows C's following EGG test to run.
            },
            breakObject: async (object) => {
                effects.push('break');
                broken.push(object);
                return true;
            },
            newsym: () => {},
            maybeUnhideAt: () => {},
        },
    );

    assert.deepEqual(randomCalls, ['rn2(10)']);
    assert.deepEqual(effects, ['material', 'break']);
    assert.deepEqual(broken, [egg]);
    assert.equal(total, 0);
});

test('scatter divides unsigned object weight before subtracting range', async () => {
    // Weights 20 and 60 distinguish integer owt / 40 from fractional math.
    for (const [weight, expectedRange] of [[20, 4], [60, 3]]) {
        const sx = 5;
        const sy = 5;
        const state = {
            u: { ux: 1, uy: 1, uundetected: false, urooms: '' },
            youmonst: { data: {} },
            level: {
                objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
                traps: [],
                objlist: null,
            },
            gb: { bhitpos: { x: sx, y: sy } },
            gt: {},
        };
        const object = {
            otyp: ROCK,
            quan: 1,
            owt: weight,
            ox: sx,
            oy: sy,
        };
        const randomCalls = [];
        const total = await scatter(sx, sy, 4, 0, object, state, {
            random: {
                rn2: (bound) => {
                    randomCalls.push(`rn2(${bound})`);
                    return 3; // xdir[3], ydir[3] moves the item one step.
                },
                rnd: (bound) => {
                    randomCalls.push(`rnd(${bound})`);
                    return 1; // One movement step keeps landing assertions small.
                },
            },
            shopOrigin: false,
            extractObject: (value) => { value.where = 0; },
            placeObject: (value, x, y) => {
                value.where = 1;
                value.ox = x;
                value.oy = y;
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
        assert.deepEqual(randomCalls, ['rn2(8)', `rnd(${expectedRange})`]);
    }
});

test('scatter identifies source boulder and statue fracture branches', async () => {
    for (const [otyp, expectedHelper] of [
        [BOULDER, 'fractureRock'],
        [STATUE, 'breakStatue'],
    ]) {
        const sx = 5;
        const sy = 5;
        const state = {
            u: { ux: 1, uy: 1, uundetected: false, urooms: '' },
            youmonst: { data: {} },
            level: {
                objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
                traps: [],
                objlist: null,
            },
            gb: { bhitpos: { x: sx, y: sy } },
            gt: {},
        };
        const object = { otyp, quan: 1, owt: 1, ox: sx, oy: sy };
        const called = [];
        const total = await scatter(
            sx,
            sy,
            2,
            SCATTER_MAY_FRACTURE,
            object,
            state,
            {
                random: { rn2: () => 1 },
                shopOrigin: false,
                extractObject: () => {},
                placeObject: () => {},
                objectAt: () => null,
                fractureRock: async () => called.push('fractureRock'),
                breakStatue: async () => called.push('breakStatue'),
                soundEffect: async () => {},
                message: async () => {},
                canSee: () => false,
                monsterAt: () => null,
                newsym: () => {},
                maybeUnhideAt: () => {},
            },
        );

        assert.equal(total, 0);
        assert.deepEqual(called, [expectedHelper]);
    }
});

test('scatter bills gold that leaves a shop after the source landing step', async () => {
    const sx = 5;
    const sy = 5;
    const keeper = {};
    const state = {
        u: { ux: 1, uy: 1, uundetected: false, urooms: '' },
        youmonst: { data: {} },
        level: {
            objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
            traps: [],
            objlist: null,
        },
        gb: { bhitpos: { x: sx, y: sy } },
        gt: {},
    };
    const gold = {
        otyp: GOLD_PIECE,
        quan: 1, // One coin avoids the independent splitobj quantity branch.
        owt: 1,
        ox: sx,
        oy: sy,
    };
    const bills = [];
    const reports = [];
    const floorChecks = [];
    const total = await scatter(sx, sy, 4, 0, gold, state, {
        random: { rn2: () => 3, rnd: () => 1 },
        shopOrigin: true,
        shopkeeper: keeper,
        inRooms: () => [1],
        creditReport: async (...args) => reports.push(args),
        costlySpot: (x, y) => x === sx && y === sy,
        heroInShop: () => true,
        extractObject: (object) => { object.where = 0; },
        placeObject: (object, x, y) => {
            object.where = 1;
            object.ox = x;
            object.oy = y;
        },
        stackObject: () => {},
        floorEffects: async () => {
            floorChecks.push(bills.length);
            return false;
        },
        terrainAt: () => 100,
        closedDoor: () => false,
        isSink: () => false,
        monsterAt: () => null,
        heroAt: () => false,
        canSee: () => false,
        addToBill: async (...args) => bills.push(args),
        newsym: () => {},
        maybeUnhideAt: () => {},
    });

    assert.equal(total, 1);
    assert.deepEqual(floorChecks, [0]); // C bills only after floor effects return false.
    assert.deepEqual(bills, [[gold, false, false, true]]);
    assert.deepEqual(reports, [[keeper, 0, true], [keeper, 1, false]]);
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

// explode.c:668-673 uses the two specific antecedent markers, not merely a
// nonzero last_msg. Abort at the fatal line to isolate wording from done().
test('fatal explosion wording follows the source last-message markers', async () => {
    const cases = [
        { verbose: true, marker: PLNMSG_UNKNOWN, deaf: false, expected: 'It is fatal.' },
        { verbose: false, marker: PLNMSG_UNKNOWN, deaf: false, expected: 'The tower of flame is fatal.' },
        { verbose: false, marker: PLNMSG_TOWER_OF_FLAME, deaf: true, expected: 'It is fatal.' },
    ];
    for (const fixture of cases) {
        // This independent seed/date only initialize a valid production state;
        // the fixture supplies lethal damage and inventory-free fire effects.
        await runSegment({ seed: 7710144, datetime: '20360214031500',
            nethackrc: [
                'OPTIONS=name:FatalWords,role:Wizard,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
                '',
            ].join('\n'), moves: '' });
        game.flags.verbose = fixture.verbose;
        game.iflags.last_msg = fixture.marker;
        game.u.uprops[DEAF].intrinsic = fixture.deaf ? 1 : 0; // Active/absent intrinsic.
        game.invent = null; // No items can emit an intervening fire message.
        for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarmg', 'uarms', 'uarmf', 'uarmu'])
            game[slot] = null;
        game.u.uhp = 1; // A two-point fire blast must reach the fatal branch.
        for (const monster of game.level.monsters.flat().filter(Boolean))
            game.level.monsters[monster.mx][monster.my] = null;
        game.nhDisplay.pushKey(32); // Allow the existing startup line's More.
        const lines = [];
        const fatalBoundary = new Error('fatal message reached');
        const rngBefore = getRngLog().length;
        const draws = [];
        await assert.rejects(explode(game.u.ux, game.u.uy, -11, 2,
            // Scroll class leaves the no-caught tower-of-flame marker intact;
            // SCROLL_CLASS selects C's tower-of-flame description.
            SCROLL_CLASS, EXPL_FIERY, game, {
                random: { rn2: (bound) => { draws.push(bound); return 1; } },
                // burnarmor case 1 terminates at the empty torso slots;
                // selecting an empty helmet would repeat the source loop.
                message: async (line) => {
                    lines.push(line);
                    if (line.endsWith('is fatal.')) throw fatalBoundary;
                    await ttyPline(line, game);
                },
            }), (error) => error === fatalBoundary);
        assert.equal(lines.at(-1), fixture.expected);
        assert.equal(game.u.uhp, -1); // 1 HP minus source damage 2.
        // C burnarmor draws its five-slot choice, then destroy_items draws
        // DMG_DESTROY_SCALE (5) even with an empty inventory.
        assert.deepEqual(draws, [5, 5]);
        assert.equal(getRngLog().length, rngBefore, 'wording consumes no RNG');
    }
});

test('an intervening item-loss message replaces the fatal antecedent', async () => {
    await runSegment({ seed: 7710145, datetime: '20360214031600',
        nethackrc: [
            'OPTIONS=name:FatalItemWords,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'), moves: '' });
    game.flags.verbose = false;
    game.iflags.last_msg = PLNMSG_TOWER_OF_FLAME;
    game.u.uprops[DEAF].intrinsic = 1; // Keep the marker until item loss speaks.
    for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarmg', 'uarms', 'uarmf', 'uarmu'])
        game[slot] = null;
    const scroll = mksobj(SCR_BLANK_PAPER, false, false, { state: game });
    scroll.where = OBJ_INVENT;
    scroll.dknown = true;
    scroll.nobj = null;
    game.invent = scroll;
    game.u.uhp = 2; // Item loss costs 1 HP, then the 2-point blast is fatal.
    for (const monster of game.level.monsters.flat().filter(Boolean))
        game.level.monsters[monster.mx][monster.my] = null;
    game.nhDisplay.pushKey(32);

    const draws = [[5, 1], [5, 1], [3, 0], [2, 1]];
    const lines = [];
    const fatalBoundary = new Error('fatal message reached after item loss');
    await assert.rejects(explode(game.u.ux, game.u.uy, -11, 2,
        SCROLL_CLASS, EXPL_FIERY, game, {
            random: {
                rn2: (bound) => {
                    const [expectedBound, value] = draws.shift();
                    assert.equal(bound, expectedBound);
                    return value;
                },
            },
            message: async (line) => {
                lines.push(line);
                if (line.endsWith('is fatal.')) throw fatalBoundary;
                await ttyPline(line, game);
            },
        }), (error) => error === fatalBoundary);

    assert.deepEqual(lines, [
        'Your unlabeled scroll catches fire and burns!',
        'The tower of flame is fatal.',
    ]);
    assert.equal(game.invent, null);
    assert.equal(game.iflags.last_msg, PLNMSG_UNKNOWN);
    assert.deepEqual(draws, []);
});

// explode.c:224-255 switches on you.h's gu.urole.mnum, not the current form.
// Damage 13 exposes integer truncation for both divisors; 4 and 1 cover
// positive damage below the /5 and /2 thresholds, respectively.
test('retributive wand damage uses the canonical original role', async () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/explode.c', import.meta.url), 'utf8');
    const header = readFileSync(new URL('../nethack-c/upstream/include/you.h', import.meta.url), 'utf8');
    assert.match(header, /#define Role_switch \(gu\.urole\.mnum\)/u);
    assert.match(c, /case PM_CLERIC:\s*case PM_MONK:\s*case PM_WIZARD:\s*damu \/= 5;/u);
    assert.match(c, /case PM_HEALER:\s*case PM_KNIGHT:\s*damu \/= 2;/u);
    const cases = [
        { role: PM_CLERIC, damage: 13, expected: 2 },
        { role: PM_MONK, damage: 13, expected: 2 },
        { role: PM_WIZARD, damage: 13, expected: 2 },
        { role: PM_HEALER, damage: 13, expected: 6 },
        { role: PM_KNIGHT, damage: 13, expected: 6 },
        { role: PM_CAVE_DWELLER, damage: 13, expected: 13 },
        { role: PM_WIZARD, damage: 4, expected: 0 },
        { role: PM_HEALER, damage: 1, expected: 0 },
        // WAND_CLASS reduces hero damage with positive zap types too.
        { role: PM_WIZARD, damage: 13, expected: 2, type: 0 },
        // A giant's HP uses the original Wizard role, not the polymorph species.
        { role: PM_WIZARD, damage: 13, expected: 2, polymorph: true },
        // A Wizard form does not confer the reduction on an original Caveman.
        { role: PM_CAVE_DWELLER, damage: 13, expected: 13, form: PM_WIZARD },
    ];
    for (const fixture of cases) {
        await prepareWandDamageState();
        game.urole.mnum = fixture.role;
        // Misleading legacy data cannot override gu.urole.mnum in either direction.
        game.flags.role = fixture.role === PM_CAVE_DWELLER ? 'wizard' : 'caveman';
        if (fixture.polymorph || fixture.form !== undefined) {
            game.u.umonnum = fixture.form ?? PM_HILL_GIANT;
            // The startup Wizard index would otherwise equal the Wizard form.
            game.u.umonster = fixture.role;
            game.youmonst.data = game.mons[game.u.umonnum];
        }
        const polymorphed = game.u.umonnum !== game.u.umonster;
        const draws = [];
        const rngBefore = getRngLog().length;
        const lines = [];
        await explode(game.u.ux, game.u.uy, fixture.type ?? -WAN_CREATE_MONSTER,
            fixture.damage, WAND_CLASS, EXPL_MAGICAL, game, {
                message: async (line) => lines.push(line),
                random: { rn2: (bound) => { draws.push(bound); return 1; } },
            });
        assert.equal(polymorphed ? game.u.mh : game.u.uhp, 100 - fixture.expected,
            `role ${fixture.role}, damage ${fixture.damage}, form ${game.u.umonnum}`);
        assert.equal(polymorphed ? game.u.uhp : game.u.mh, 100,
            'only the active HP pool is reduced');
        // zap.c destroy_items draws its scale (5) once even with no inventory;
        // attrib.c exercise draws rn2(2) only outside a polymorphed form.
        assert.deepEqual(draws, polymorphed ? [5] : [5, 2]);
        assert.equal(getRngLog().length, rngBefore, 'role dispatch adds no RNG');
        assert.deepEqual(lines, ['Boom!', 'You are caught in the magical blast!']);
    }
});

// The fixed seed/date only initialize valid owners and a visible map. The
// constructed fixture supplies every value relevant to the damage branch.
async function prepareWandDamageState() {
    await runSegment({ seed: 93171020, datetime: '20781112121000',
        nethackrc: 'OPTIONS=name:RoleDamage,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
        moves: '' });
    game.invent = null;
    // Removing the starting cloak also removes its carried magic resistance.
    game.u.uprops[ANTIMAGIC].extrinsic = 0;
    for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarmg', 'uarms', 'uarmf', 'uarmu'])
        game[slot] = null;
    for (const monster of game.level.monsters.flat().filter(Boolean))
        game.level.monsters[monster.mx][monster.my] = null;
    game.level.monlist = null;
    // Both pools survive the largest (13-point) fixture, keeping death owners
    // outside this bounded role-dispatch test.
    game.u.uhp = game.u.uhpmax = game.u.mh = game.u.mhmax = 100;
}

test('role reduction leaves non-wand and monster damage unchanged', async () => {
    await prepareWandDamageState();
    const draws = [];
    const random = { rn2: (bound) => { draws.push(bound); return 1; } };
    // SCROLL_CLASS with magic type 0 bypasses the retributive WAND_CLASS arm.
    await explode(game.u.ux, game.u.uy, 0, 13, SCROLL_CLASS, EXPL_MAGICAL,
        game, { message: async () => {}, random });
    assert.equal(game.u.uhp, 87); // Source leaves 13 hero damage unreduced.
    assert.deepEqual(draws, [5, 2]);

    await prepareWandDamageState();
    const target = newMonster({ data: game.mons[PM_NEWT], cham: NON_PM,
        // Adjacent newt survives the original 13-point dose without death effects.
        m_lev: 0, m_id: 9317, mx: game.u.ux + 1, my: game.u.uy,
        mhp: 100, mhpmax: 100, mcanmove: 1, mcansee: 1 });
    place_monster(target, target.mx, target.my, game);
    target.nmon = null;
    game.level.monlist = target;
    draws.length = 0;
    await explode(game.u.ux, game.u.uy, -WAN_CREATE_MONSTER, 13,
        WAND_CLASS, EXPL_MAGICAL, game, { message: async () => {}, random });
    assert.equal(game.u.uhp, 98); // Original Wizard role divides 13/5 to 2.
    assert.equal(target.mhp, 87); // explode.c:522 uses dam, not reduced damu.
    // Source item/monster checks precede hero inventory and Strength exercise.
    // resist uses wand attack level 12 and newt defense clamped to 1: 111.
    assert.deepEqual(draws, [5, 111, 5, 2]);
    const c = readFileSync(new URL('../nethack-c/upstream/src/explode.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/explode.js', import.meta.url), 'utf8');
    assert.match(c, /destroy_items\(&gy\.youmonst, \(int\) adtyp, dam\)/u);
    assert.match(js, /destroy_items\(state\.youmonst, adtyp, dam,/u);
    assert.match(c, /i = dam \* dam;/u);
    assert.match(js, /let noise = dam \* dam;/u);
});
