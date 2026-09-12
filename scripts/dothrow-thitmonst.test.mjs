import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_DELETED, OBJ_FREE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { thitmonst } from '../js/dothrow.js';
import { mksobj } from '../js/obj.js';
import { runSegment } from '../js/jsmain.js';
import { PM_KOBOLD } from '../js/monsters.js';
import { CREAM_PIE } from '../js/objects.js';

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
    game.thrownobj = pie;
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
    assert.equal(game.thrownobj, null);
    assert.ok(messages.some((line) => line.includes('cream pie')));
});
