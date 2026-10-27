import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { PM_SHOPKEEPER, NON_PM } from '../js/monsters.js';
import { PICK_AXE } from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { addinv } from '../js/invent.js';
import { newMonster, place_monster, remove_monster } from '../js/monst.js';
import { neweshk } from '../js/makemon_create.js';
import { shk_move } from '../js/shk.js';
import { vision_reset, vision_recalc } from '../js/vision.js';

async function setup(carryPick) {
    await runSegment({ seed: 829103, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:PickAway,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    game.level = new GameMap();
    const room = { lx: 3, hx: 13, ly: 3, hy: 10, rtype: SHOPBASE,
        rlit: true, irregular: false, nsubrooms: 0 };
    game.level.rooms = [room]; game.level.nroom = 1;
    game.level.flags.has_shop = true;
    for (let x = 3; x <= 13; x++) for (let y = 3; y <= 10; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, roomno: ROOMOFFSET,
            lit: true, seenv: 255 });
    game.u.ux = 10; game.u.uy = 8;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    game.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    if (carryPick) addinv(mksobj(PICK_AXE, false, false, { state: game }), { state: game });
    const keeper = newMonster({ data: game.mons[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER, m_id: 829103, cham: NON_PM,
        isshk: true, mpeaceful: true, mcansee: true, mcanmove: true,
        mhp: 20, mhpmax: 20, mux: 10, muy: 8 });
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

for (const carryPick of [true, false]) {
    test(`${carryPick ? 'target' : 'control'}: a pick away from the door does not move the guard`, async () => {
        const keeper = await setup(carryPick);
        // C shk.c:4961-4970 checks carrying(PICK_AXE) only when uondoor.
        // Away from the door it explicitly resets badinv to FALSE.
        const result = await shk_move(keeper, game, { planning: true });
        assert.equal(result, 0);
        assert.deepEqual([keeper.mx, keeper.my], [6, 6]);
    });
}

test('control: a pick at the shop door still holds the guard in place', async () => {
    const keeper = await setup(true);
    game.u.ux = 3; game.u.uy = 6;
    remove_monster(6, 6, game);
    place_monster(keeper, 5, 6, game);
    // C shk.c:4965-4966 returns early for a guard at the guard square
    // watching the hero carry a pickaxe on the doorway.
    const result = await shk_move(keeper, game, { planning: true });
    assert.equal(result, 0);
    assert.deepEqual([keeper.mx, keeper.my], [5, 6]);
});
