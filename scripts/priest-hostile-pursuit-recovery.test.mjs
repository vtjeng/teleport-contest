import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, ROOMOFFSET, TEMPLE, OROOM, STONE } from '../js/const.js';
import { PM_ALIGNED_CLERIC } from '../js/monsters.js';
import { do_mkroom } from '../js/mkroom.js';
import { setmangry } from '../js/mon.js';
import { pri_move, has_shrine, histemple_at } from '../js/priest.js';
import { vision_reset, vision_recalc, m_canseeu } from '../js/vision.js';

async function templeSetup(hostile, mode) {
    await runSegment({ seed: 829101, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:Pursuit,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    game.level = new GameMap();
    const room = { lx: 3, hx: 13, ly: 3, hy: 10, rtype: OROOM, doorct: 1, fdoor: 0,
        rlit: true, irregular: false, nsubrooms: 0 };
    game.level.rooms = [room];
    game.level.nroom = 1;
    for (let x = 3; x <= 13; x++) for (let y = 3; y <= 10; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, roomno: ROOMOFFSET,
            lit: true, seenv: 255 });
    game.u.ux = 10; game.u.uy = 6;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    // Ordinary special-room construction, not the stopped Lua des.room API.
    game.in_mklev = true;
    do_mkroom(TEMPLE, game);
    game.in_mklev = false;
    let priest = game.level.monlist;
    while (priest && !priest.ispriest) priest = priest.nmon;
    assert.ok(priest);
    assert.equal(priest.data, game.mons[PM_ALIGNED_CLERIC]);
    assert.equal(has_shrine(priest, game), true);
    assert.equal(histemple_at(priest, priest.mx, priest.my, game), true);
    game.u.ux = 12; game.u.uy = priest.my;
    if (mode === 'obscured') game.level.at(10, priest.my).typ = STONE;
    if (mode === 'outside') {
        game.u.ux = 15;
        for (let x = 14; x <= 15; x++) game.level.at(x, priest.my).typ = ROOM;
        game.u.urooms = [0, 0, 0, 0, 0];
    }
    vision_reset(game); vision_recalc(0);
    assert.equal(m_canseeu(priest, game), mode !== 'obscured');
    if (hostile) await setmangry(priest, false, {state: game, message: async () => {}});
    return priest;
}

for (const [hostile, mode] of [[true, 'inside'], [false, 'inside'], [true, 'obscured'], [true, 'outside']]) {
    test(`native priest hostile=${hostile} mode=${mode}`, async () => {
        const priest = await templeSetup(hostile, mode);
        const before = {x: priest.mx, y: priest.my};
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
        assert.ok(hostile && mode === 'inside' ? priest.mx > before.x : priest.mx <= before.x,
            'native constructed hostile priest pursues; peaceful control mills');
    });
}
