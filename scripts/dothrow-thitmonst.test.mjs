import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_DELETED, OBJ_FREE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { tamedog } from '../js/dog.js';
import {
    befriendWithObject,
    digests,
    thitmonst,
} from '../js/dothrow.js';
import { mksobj } from '../js/obj.js';
import { runSegment } from '../js/jsmain.js';
import {
    AD_DGST,
    AT_ENGL,
    PM_DOG,
    PM_KOBOLD,
    PM_MONKEY,
    PM_SOLDIER_ANT,
} from '../js/monsters.js';
import { BANANA, CREAM_PIE, GRAY_DRAGON_SCALE_MAIL } from '../js/objects.js';

// The startup input is independent of the recorded development play. The
// target and object are then installed directly so this test isolates the
// source path and pins its random evaluation order.
const START = Object.freeze({
    seed: 29017,
    datetime: '20420617081244',
    nethackrc: [
        'OPTIONS=name:PieThrower,role:Healer,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        '',
    ].join('\n'),
    moves: '@',
});

test('thitmonst routes a thrown cream pie through hmon', async () => {
    await runSegment(START);
    const mon = {
        data: game.mons[PM_KOBOLD],
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 12,
        mhpmax: 12,
        m_id: 9001,
        mcanmove: true,
        mcansee: true,
        msleeping: false,
        mblinded: 0,
        mpeaceful: true,
        mavenge: 0,
        mstrategy: 0,
        minvent: null,
    };
    const pie = mksobj(CREAM_PIE, false, false, { state: game });
    assert.equal(pie.where, OBJ_FREE);
    game.gt.thrownobj = pie;
    game.gb.bhitpos = { x: mon.mx, y: mon.my };

    const draws = [];
    const random = {
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            return 1;
        },
        rn1(bound, offset) {
            draws.push(`rn1(${bound},${offset})`);
            return offset + 1;
        },
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            return 1;
        },
    };
    const messages = [];
    const result = await thitmonst(mon, pie, game, {
        random,
        message: (line) => { messages.push(line); },
        unsupported: (what) => { throw new Error(`unexpected ${what}`); },
    });

    assert.equal(result, 1);
    assert.deepEqual(draws, ['rnd(20)', 'rnd(25)', 'rn1(25,21)']);
    assert.equal(mon.mcansee, 0);
    assert.equal(mon.mblinded, 22);
    assert.equal(pie.where, OBJ_DELETED);
    assert.equal(game.gt.thrownobj, null);
    assert.ok(messages.some((line) => line.includes('cream pie')));
});

test('thitmonst ports the source pure object and engulfing predicates', async () => {
    await runSegment(START);
    const banana = mksobj(BANANA, false, false, { state: game });
    const pie = mksobj(CREAM_PIE, false, false, { state: game });
    assert.equal(befriendWithObject(game.mons[PM_DOG], pie, game), true);
    assert.equal(befriendWithObject(game.mons[PM_MONKEY], banana, game), true);
    assert.equal(
        befriendWithObject(game.mons[PM_DOG], {
            ...pie,
            oclass: 5, // C's food-class test must reject a non-food object.
        }, game),
        false,
    );
    assert.equal(digests({
        mattk: [{ aatyp: AT_ENGL, adtyp: AD_DGST }],
    }), true);
    assert.equal(digests({
        mattk: [{ aatyp: AT_ENGL, adtyp: 0 }],
    }), false);
});

test('thitmonst keeps C\'s final tmiss arm source-ordered', async () => {
    await runSegment(START);
    const mon = {
        data: game.mons[PM_SOLDIER_ANT],
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 12,
        mhpmax: 12,
        m_id: 9002,
        mcanmove: true,
        mcansee: true,
        msleeping: true,
        mblinded: 0,
        mpeaceful: false,
        mavenge: 0,
        mstrategy: 0,
        minvent: null,
    };
    const mail = mksobj(GRAY_DRAGON_SCALE_MAIL, false, false, {
        state: game,
    });
    assert.equal(mail.where, OBJ_FREE);
    game.gt.thrownobj = mail;
    game.gb.bhitpos = { x: mon.mx, y: mon.my };

    const draws = [];
    const result = await thitmonst(mon, mail, game, {
        random: {
            rnd(bound) {
                draws.push(`rnd(${bound})`);
                return 1;
            },
            rn1(bound, offset) {
                draws.push(`rn1(${bound},${offset})`);
                return offset + 1;
            },
            rn2(bound) {
                draws.push(`rn2(${bound})`);
                return 0;
            },
        },
        message: () => {},
        unsupported: (what) => { throw new Error(`unexpected ${what}`); },
    });

    // dothrow.c:2152 and :2300. The final non-weapon arm does one hit roll,
    // then tmiss()'s optional wakeup roll; it does not call hmon().
    assert.equal(result, 0);
    assert.deepEqual(draws, ['rnd(20)', 'rn2(3)']);
    assert.equal(mon.msleeping, 0);
    assert.equal(mail.where, OBJ_FREE);
});

test('tamedog feeds a newly tamed dog through dog_eat', async () => {
    await runSegment(START);
    const monster = {
        data: game.mons[PM_DOG],
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 12,
        mhpmax: 12,
        m_id: 9003,
        mcanmove: true,
        mcansee: true,
        msleeping: false,
        mblinded: 0,
        mpeaceful: false,
        mavenge: 0,
        mflee: true,
        mfleetim: 4,
        meating: 0,
        mconf: 0,
        mtame: 0,
        minvent: null,
        mextra: null,
    };
    const pie = mksobj(CREAM_PIE, false, false, { state: game });
    const result = await tamedog(monster, pie, true, {
        state: game,
        random: {
            rn1: () => 1,
            rn2: () => 0,
            rnd: () => 0,
            rne: () => 1,
            rnz: () => 1,
            d: () => 1,
        },
        message: () => {},
        redraw: () => {},
    });
    assert.equal(result, true);
    assert.ok(monster.mtame >= 10);
    assert.ok(monster.mextra?.edog);
    assert.equal(pie.where, OBJ_DELETED);
});
