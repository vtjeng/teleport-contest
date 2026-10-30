import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_XORN, PM_OGRE, NON_PM } from '../js/monsters.js';
import { ROOM, POLY_TRAP, OBJ_MINVENT, OBJ_FLOOR } from '../js/const.js';
import { recalc_block_point, vision_recalc } from '../js/vision.js';
import { DAGGER } from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { mpickobj } from '../js/steal.js';
import { newcham } from '../js/mon.js';
import { maketrap } from '../js/trap.js';
import { runDirectMonsterAction } from '../js/unported_monster_actions.js';

for (const original of ['xorn', 'ogre']) {
    test(`post-polymorph ranged gate preserves original ${original} attack type`, async () => {
        await runSegment({
            seed: 7710044, datetime: '20261028120000',
            nethackrc: 'OPTIONS=playmode:debug,monpolycontrol,name:PolyGate,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
            moves: '',
        });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        const x = game.u.ux;
        const y = game.u.uy;
        for (let a = x; a <= x + 5; a++) {
            for (let b = y - 1; b <= y + 1; b++) {
                game.level.at(a, b).typ = ROOM;
                game.level.objects[a][b] = null;
                recalc_block_point(a, b, game);
            }
        }
        vision_recalc(0, { state: game });
        const mon = newMonster({
            data: game.mons[PM_OGRE], m_id: 6001, mx: x + 4, my: y,
            mux: x, muy: y, m_lev: game.mons[PM_OGRE].mlevel,
            cham: NON_PM, mhp: 20, mhpmax: 20, mcanmove: 1, mcansee: 1,
        });
        place_monster(mon, mon.mx, mon.my, game);
        game.level.monlist = mon;
        const random = {
            rn2: n => n - 1, rnd: () => 1, rn1: (_n, b) => b,
            rne: () => 1, rnl: n => n - 1, d: n => n,
        };
        assert.equal(game.wizard, true);
        assert.equal(game.iflags.mon_polycontrol, true);
        const env = {
            state: game, random, message: async () => {},
            getlin: async () => 'ogre', redraw: () => {},
            redrawSquare: () => {}, unsupported: why => assert.fail(why),
        };
        assert.ok(maketrap(x + 3, y, POLY_TRAP, env));
        const dagger = mksobj(DAGGER, false, false, { state: game });
        mpickobj(mon, dagger, { state: game });
        for (let i = 0; i < 30; i++) game.nhDisplay.terminal.pushKey(32);
        if (original === 'xorn')
            assert.equal(await newcham(mon, game.mons[PM_XORN], env), true);
        assert.equal(mon.minvent, dagger);
        assert.equal(mon.mw, null);
        game.context.mon_moving = true;
        const hpBefore = game.u.uhp;
        const status = await runDirectMonsterAction(mon, env);
        assert.equal(mon.data, game.mons[PM_OGRE]);
        assert.deepEqual([mon.mx, mon.my], [x + 3, y]);
        assert.equal(status, 0);
        if (original === 'xorn') {
            assert.equal(game.u.uhp, hpBefore);
            assert.equal(dagger.where, OBJ_MINVENT);
        } else {
            assert.equal(game.u.uhp, hpBefore - 1);
            assert.equal(dagger.where, OBJ_FLOOR);
            assert.match(game._ttyToplines, /hit by a dagger/u);
        }
    });
}
