import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, ROOMOFFSET, SHOPBASE, DOOR, D_ISOPEN, STONE } from '../js/const.js';
import { PM_SHOPKEEPER } from '../js/monsters.js';
import { PICK_AXE } from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { addinv } from '../js/invent.js';
import { stock_room } from '../js/shknam.js';
import { rloc_to } from '../js/teleport.js';
import { shk_move } from '../js/shk.js';
import { setmangry } from '../js/mon.js';
import { vision_reset, vision_recalc, m_canseeu } from '../js/vision.js';

async function setup(carryPick) {
    await runSegment({ seed: 829103, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:PickAway,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    game.level = new GameMap();
    const room = { lx: 3, hx: 13, ly: 3, hy: 10, rtype: SHOPBASE,
        rlit: true, irregular: false, nsubrooms: 0, roomnoidx: 0, doorct: 1, fdoor: 0 };
    game.level.rooms = [room]; game.level.nroom = 1;
    game.level.flags.has_shop = true;
    for (let x = 3; x <= 13; x++) for (let y = 3; y <= 10; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, roomno: ROOMOFFSET,
            lit: true, seenv: 255 });
    game.u.ux = 10; game.u.uy = 8;
    game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
    game.u.ushops = [ROOMOFFSET, 0, 0, 0, 0];
    if (carryPick) addinv(mksobj(PICK_AXE, false, false, { state: game }), { state: game });
    game.level.doors = [{x: 2, y: 6}];
    Object.assign(game.level.at(2, 6), {typ: DOOR, flags: D_ISOPEN, doormask: D_ISOPEN});
    game.in_mklev = true;
    await stock_room(0, room, {state: game});
    game.in_mklev = false;
    const keeper = room.resident;
    assert.ok(keeper?.isshk);
    assert.equal(keeper.data, game.mons[PM_SHOPKEEPER]);
    assert.deepEqual(keeper.mextra.eshk.shk, {x: 3, y: 6});
    assert.equal(keeper.mextra.eshk.shoproom, ROOMOFFSET);
    await rloc_to(keeper, 4, 6, {state: game});
    vision_reset(game); vision_recalc(0);
    return keeper;
}

for (const visible of [true, false]) for (const planning of [true, false]) {
    test(`angry native keeper visible=${visible} planning=${planning}`, async () => {
        const keeper = await setup(false);
        if (!visible) for (let y = 3; y <= 10; y++) game.level.at(7, y).typ = STONE;
        vision_reset(game); vision_recalc(0);
        assert.equal(m_canseeu(keeper, game), visible);
        await setmangry(keeper, false, {state: game, message: async () => {}});
        assert.equal(Boolean(keeper.mpeaceful), false);
        const before = keeper.mx;
        const result = await shk_move(keeper, game, {planning});
        assert.equal(result, 1);
        assert.ok(visible ? keeper.mx > before : keeper.mx < before,
            'visible hero is pursued; obscured hero leaves guard position as goal');
    });
}
