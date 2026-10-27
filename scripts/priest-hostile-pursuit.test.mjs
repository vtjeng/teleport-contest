import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, ROOMOFFSET, TEMPLE } from '../js/const.js';
import { PM_ALIGNED_CLERIC, NON_PM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { pri_move } from '../js/priest.js';
import { vision_reset, vision_recalc } from '../js/vision.js';

async function templeSetup(hostile, canSee = true) {
    await runSegment({ seed: 829101, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:Pursuit,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    game.level = new GameMap();
    const room = { lx: 3, hx: 13, ly: 3, hy: 10, rtype: TEMPLE,
        rlit: true, irregular: false, nsubrooms: 0 };
    game.level.rooms = [room];
    game.level.nroom = 1;
    for (let x = 3; x <= 13; x++) for (let y = 3; y <= 10; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, roomno: ROOMOFFSET,
            lit: true, seenv: 255 });
    game.u.ux = 10; game.u.uy = 6;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    const priest = newMonster({ data: game.mons[PM_ALIGNED_CLERIC],
        mnum: PM_ALIGNED_CLERIC, m_id: 829101, cham: NON_PM,
        ispriest: true, mpeaceful: !hostile, mcansee: canSee, mcanmove: true,
        mhp: 20, mhpmax: 20, mux: 10, muy: 6,
        mextra: { epri: { shroom: ROOMOFFSET, shrpos: { x: 5, y: 6 },
            shrlevel: { ...game.u.uz } } } });
    game.level.monlist = priest;
    place_monster(priest, 6, 6, game);
    vision_reset(game); vision_recalc(0);
    return priest;
}

for (const [hostile, canSee] of [[true, true], [false, true], [true, false]]) {
    test(`${hostile && canSee ? 'target' : 'control'}: nonadjacent priest hostile=${hostile} sight=${canSee}`, async () => {
        const priest = await templeSetup(hostile, canSee);
        const draws = [];
        const random = { rn1: (n, base) => {
            draws.push(`rn1(${n},${base})`); return base;
        }, rn2: n => { draws.push(`rn2(${n})`); return 0; } };
        const result = await pri_move(priest, { state: game, random,
            redraw: () => {} });
        assert.ok([0, 1].includes(result));
        assert.deepEqual(draws.slice(0, 2), ['rn1(3,-1)', 'rn1(3,-1)']);
        assert.equal(priest.mextra.epri.shroom, ROOMOFFSET);
        assert.equal(result, 1);
        assert.equal(priest.mx, hostile && canSee ? 7 : 5,
            'only a hostile priest who sees the hero pursues instead of milling');
    });
}
