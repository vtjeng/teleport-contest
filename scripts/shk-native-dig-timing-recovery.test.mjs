import test from 'node:test';
import assert from 'node:assert/strict';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, ROOMOFFSET, SHOPBASE, DOOR, D_ISOPEN } from '../js/const.js';
import { PM_SHOPKEEPER } from '../js/monsters.js';
import { PICK_AXE } from '../js/objects.js';
import { mksobj } from '../js/obj.js';
import { addinv } from '../js/invent.js';
import { stock_room } from '../js/shknam.js';
import { rloc_to } from '../js/teleport.js';
import { shk_move } from '../js/shk.js';
import { vision_reset, vision_recalc } from '../js/vision.js';

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

import {setuwep} from '../js/wield.js';
import {use_pick_axe2,dig,is_digging} from '../js/dig.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
// C dig.c:holetime and shk.c:shk_move. Every effort value comes from dig();
// no injected effort 230, occupation callback, or shopkeeper identity.
for(const late of [false,true])for(const planning of [false,true])
 test(`native digging late=${late} planning=${planning}`,async()=>{
  const keeper=await setup(false);
  clearTtyMessageWindow(game);
  for(let i=0;i<100;i++)game.nhDisplay.pushKey(32);
  const pick=addinv(mksobj(PICK_AXE,false,false,{state:game}),{state:game});
  await setuwep(pick,{state:game});
  game.u.dx=0;game.u.dy=0;game.u.dz=1;
  const env={state:game,message:async()=>{}};
  await use_pick_axe2(pick,game,env);
  assert.equal(is_digging(game),true);
  assert.equal(game.context.digging.effort,0);
  let reached=false;
  for(let i=0;i<35;i++){
   const result=await dig(game,env);
   const effort=game.context.digging.effort;
   if(effort>=(late?130:1)&&effort<=250){reached=true;break;}
   if(!result)await use_pick_axe2(pick,game,env);
  }
  assert.equal(reached,true);
  assert.equal(is_digging(game),true);
  const time=Math.trunc((250-game.context.digging.effort)/20);
  const distance=(keeper.mx-game.u.ux)**2+(keeper.my-game.u.uy)**2;
  assert.equal(time*time<=distance,late);
  const result=await shk_move(keeper,game,{planning});
  assert.equal(result,late?1:0);
  assert.deepEqual([keeper.mx,keeper.my],late?[5,7]:[4,6]);
 });
