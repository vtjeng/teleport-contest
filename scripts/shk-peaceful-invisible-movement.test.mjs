import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { INVIS, ROOM, ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { PM_SHOPKEEPER, NON_PM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { neweshk } from '../js/makemon_create.js';
import { set_itimeout } from '../js/potion.js';
import { shk_move } from '../js/shk.js';
import { vision_reset, vision_recalc } from '../js/vision.js';

async function shopSetup(invisible) {
    await runSegment({ seed: 829102, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:ShopSight,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    game.level = new GameMap();
    const room = { lx: 3, hx: 13, ly: 3, hy: 10, rtype: SHOPBASE,
        rlit: true, irregular: false, nsubrooms: 0 };
    game.level.rooms = [room]; game.level.nroom = 1;
    game.level.flags.has_shop = true;
    for (let x = 3; x <= 13; x++) for (let y = 3; y <= 10; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, roomno: ROOMOFFSET,
            lit: true, seenv: 255 });
    game.u.ux = 10; game.u.uy = 6;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    game.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    if (invisible) set_itimeout(game.u.uprops[INVIS], 20);
    const keeper = newMonster({ data: game.mons[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER, m_id: 829102, cham: NON_PM,
        isshk: true, mpeaceful: true, mcansee: true, mcanmove: true,
        mhp: 20, mhpmax: 20, mux: 10, muy: 6 });
    const eshk = neweshk(keeper);
    Object.assign(eshk, { shoproom: ROOMOFFSET, shoptype: SHOPBASE,
        shoplevel: { ...game.u.uz }, shk: { x: 5, y: 6 },
        shd: { x: 3, y: 6 }, customer: game.plname,
        following: false, robbed: 0, billct: 0, debit: 0 });
    eshk.bill_p = eshk.bill;
    room.resident = keeper; game.level.monlist = keeper;
    place_monster(keeper, 6, 6, game);
    vision_reset(game); vision_recalc(0);
    return keeper;
}

for (const invisible of [true, false]) {
    test(`${invisible ? 'target' : 'control'}: peaceful keeper movement with invisible=${invisible}`, async () => {
        const keeper = await shopSetup(invisible);
        // C shk.c:4958-4961 clears avoid for an invisible hero but leaves
        // appr=1, so move_special keeps aiming at the shop guard square.
        const draws = [];
        const result = await shk_move(keeper, game, { planning: true,
            random: { rn2: bound => { draws.push(bound); return 0; } } });
        assert.equal(result, invisible ? 1 : 0);
        assert.equal(keeper.mx, invisible ? 5 : 6);
        assert.deepEqual(draws, []);
    });
}
