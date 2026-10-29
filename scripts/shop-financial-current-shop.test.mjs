import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_SHOPKEEPER, NON_PM } from '../js/monsters.js';
import { neweshk } from '../js/makemon_create.js';
import { ROOM, ROOMOFFSET, SHOPBASE, DOOR, D_ISOPEN } from '../js/const.js';
import { doprgold } from '../js/invent.js';
import { inside_shop, shop_keeper, shop_debt } from '../js/shk.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { msghistory_snapshot, free_msghistory_snapshot } from '../js/topl.js';
import { vision_reset, vision_recalc } from '../js/vision.js';

for (const debit of [17, 0]) test(`${debit ? 'target' : 'control'}: current shop debit=${debit}`, async () => {
    await runSegment({ seed: 901729, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:Finances,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n', moves: '' });
    game.level = new GameMap();
    const room = { lx: 4, hx: 10, ly: 3, hy: 9, rtype: SHOPBASE,
        rlit: true, irregular: false, nsubrooms: 0, resident: null,
        doorct: 1, fdoor: 0 };
    game.level.rooms = [room]; game.level.nroom = 1;
    game.level.flags.has_shop = true;
    for (let x = 4; x <= 10; x++) for (let y = 3; y <= 9; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, lit: true, seenv: 255,
            roomno: ROOMOFFSET, edge: false });
    game.level.doors = [{ x: 3, y: 6 }];
    Object.assign(game.level.at(3, 6), { typ: DOOR, doormask: D_ISOPEN,
        flags: D_ISOPEN, lit: true, seenv: 255, roomno: ROOMOFFSET, edge: true });
    game.u.ux = 6; game.u.uy = 6;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    game.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    const keeper = newMonster({ data: game.mons[PM_SHOPKEEPER], mnum: PM_SHOPKEEPER,
        m_id: 901729, cham: NON_PM, mhp: 30, mhpmax: 30,
        isshk: true, mpeaceful: true, mcanmove: true, mcansee: true });
    const eshk = neweshk(keeper);
    Object.assign(eshk, { shoproom: ROOMOFFSET, shoptype: SHOPBASE,
        shoplevel: { ...game.u.uz }, shk: { x: 4, y: 6 },
        shd: { x: 3, y: 6 }, shknam: 'Testkeeper', customer: game.plname, debit });
    eshk.bill_p = eshk.bill;
    room.resident = keeper; game.level.monlist = keeper;
    place_monster(keeper, 4, 6, game);
    vision_reset(game); vision_recalc(0);
    assert.equal(inside_shop(6, 6, game), ROOMOFFSET);
    assert.equal(shop_keeper(ROOMOFFSET, game), keeper);
    assert.equal(shop_debt(eshk), debit);
    clearTtyMessageWindow(game); game._ttyToplines = '';
    for (let i = 0; i < 12; i++) game.nhDisplay.pushKey(32);
    await doprgold(game);
    const text = (msghistory_snapshot(false, game) ?? []).join('\n');
    free_msghistory_snapshot(false, game);
    // C shk.c:shopper_financial_report:1024-1033 handles the current shop first.
    if (debit) {
        assert.ok(text.includes('You have no credit in here.'));
        assert.ok(text.includes('You owe Testkeeper 17 zorkmids.'));
    } else assert.ok(text.includes('You have no credit or debt in here.'));
    assert.equal(eshk.debit, debit, 'reporting cannot change the debt');
    assert.equal(eshk.credit, 0);
});
