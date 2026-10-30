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

// C dokick.c:1610-1624 calls hot_pursuit when robbed increases, including
// an already angry keeper while hero stays inside. Ordinary coins/daggers only.
import {GOLD_PIECE, DAGGER} from '../js/objects.js';
import {OBJ_MIGRATING} from '../js/const.js';
import {place_object} from '../js/obj.js';
import {setmangry} from '../js/mon.js';
import {impact_drop} from '../js/dokick.js';
import {obj_extract_self} from '../js/invent.js';
import {objectGenerationEnv} from '../js/object_generation.js';
for (const type of [GOLD_PIECE, DAGGER]) for (const outside of [true,false]) for(const angry of [false,true]) test(`ordinary impact type=${type} outside=${outside} angry=${angry}`, async () => {
 const keeper=await setup(false);
 const y=8;
 const x=10;
 for(let stock=game.level.objects[x]?.[y];stock;stock=game.level.objects[x]?.[y]){
  assert.equal(Boolean(stock.globby),false);
  obj_extract_self(stock,objectGenerationEnv({state:game}));place_object(stock,12,9,{state:game});
 }
 game.u.ux=x;game.u.uy=y;
 game.stairs={sx:x,sy:y,up:false,isladder:false,tolev:{dnum:0,dlevel:2},next:null};
 if(outside){
  for(let xx=14;xx<=16;xx++)Object.assign(game.level.at(xx,y),{typ:ROOM,lit:true});
  game.u.ux=15;game.u.uy=y;game.u.urooms=[];game.u.ushops=[];
 }
 vision_reset(game);vision_recalc(0);
 const obj=mksobj(type,false,false,{state:game});
 if(type===GOLD_PIECE)obj.quan=9;
 place_object(obj,x,y,{state:game});
 if(angry)await setmangry(keeper,false,{state:game,message:async()=>{}});
 const before={robbed:keeper.mextra.eshk.robbed,debit:keeper.mextra.eshk.debit,following:keeper.mextra.eshk.following};
 const messages=[],bounds=[];
 await impact_drop(null,x,y,0,{state:game,random:{rn2:n=>{bounds.push(n);return 0;}},message:async text=>messages.push(text)});
 assert.equal(obj.where,OBJ_MIGRATING);
 assert.equal(game.gm.migrating_objs,obj);
 const after={robbed:keeper.mextra.eshk.robbed,debit:keeper.mextra.eshk.debit,following:keeper.mextra.eshk.following,peaceful:keeper.mpeaceful,customer:keeper.mextra.eshk.customer};
 assert.ok(outside||angry?after.robbed>before.robbed:after.debit>before.debit);
 assert.equal(after.following, outside || angry);
 assert.equal(Boolean(after.peaceful), !outside && !angry);
 assert.deepEqual(bounds,[3]);
});
