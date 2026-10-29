import assert from 'node:assert/strict';
import test from 'node:test';

import { acurr } from '../js/attrib.js';
import { A_DEX, OBJ_FLOOR, OBJ_INVENT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_OGRE, NON_PM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mksobj } from '../js/obj.js';
import { ORCISH_DAGGER } from '../js/objects.js';
import { mpickobj } from '../js/steal.js';
import { runDirectMonsterAction } from '../js/unported_monster_actions.js';
import { recalc_block_point, vision_recalc } from '../js/vision.js';

// C mthrowu.c:u_catch_thrown_obj hands a successful catch to invent.c,
// then m_throw ends the missile's flight without damaging the hero.
for (const catchRoll of [0, 1]) {
    test(`${catchRoll ? 'control: miss' : 'target: catch'} of an ordinary monster dagger`, async () => {
        await runSegment({ seed: 7710044, datetime: '20261028120000',
            nethackrc: 'OPTIONS=name:CatchProbe,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
            moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        const x = game.u.ux, y = game.u.uy;
        for (let a = x; a <= x + 5; a++) for (let b = y - 1; b <= y + 1; b++) {
            game.level.at(a, b).typ = ROOM;
            game.level.objects[a][b] = null;
            recalc_block_point(a, b, game);
        }
        vision_recalc(0, { state: game });
        const mon = newMonster({ data: game.mons[PM_OGRE], m_id: 6001,
            mx: x + 4, my: y, mux: x, muy: y,
            m_lev: game.mons[PM_OGRE].mlevel, cham: NON_PM,
            mhp: 20, mhpmax: 20, mcanmove: 1, mcansee: 1 });
        place_monster(mon, mon.mx, mon.my, game);
        game.level.monlist = mon;
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state: game });
        mpickobj(mon, dagger, { state: game });
        assert.equal(mon.minvent, dagger);
        assert.equal(mon.mw, null);

        const catchBound = 100 - acurr(game, A_DEX);
        const draws = [];
        const random = {
            rn2: n => { draws.push(['rn2', n]); return n === catchBound ? catchRoll : n - 1; },
            rnd: n => { draws.push(['rnd', n]); return 1; },
            rn1: (_n, base) => base, rne: () => 1, rnl: n => n - 1,
            d: (n, k) => { draws.push(['d', n, k]); return n; },
        };
        for (let i = 0; i < 30; i++) game.nhDisplay.terminal.pushKey(32);
        const hpBefore = game.u.uhp;
        game.context.mon_moving = true;
        const status = await runDirectMonsterAction(mon, { state: game, random,
            message: async () => {}, redraw: () => {}, redrawSquare: () => {},
            unsupported: reason => assert.fail(reason) });
        assert.equal(status, 0);
        assert.ok(draws.some(([kind, n]) => kind === 'rn2' && n === catchBound));
        if (catchRoll === 0) {
            assert.equal(game.u.uhp, hpBefore);
            assert.equal(dagger.where, OBJ_INVENT);
        } else {
            assert.equal(game.u.uhp, hpBefore - 1);
            assert.equal(dagger.where, OBJ_FLOOR);
        }
    });
}
